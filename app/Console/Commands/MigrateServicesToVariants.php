<?php

namespace App\Console\Commands;

use App\Models\Booking;
use App\Models\Service;
use App\Models\ServiceVariant;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class MigrateServicesToVariants extends Command
{
    /**
     * php artisan services:migrate-variants            (dry run, shows the plan only)
     * php artisan services:migrate-variants --execute   (actually performs the migration)
     */
    protected $signature = 'services:migrate-variants {--execute : Actually perform the migration. Without this flag, it only previews the plan.}';

    protected $description = 'Group duplicate duration-based services (e.g. "Couple Massage 60 min" / "90 min") into a parent service with variants, preserving booking references.';

    public function handle(): int
    {
        $execute = $this->option('execute');

        $services = Service::orderBy('group_name')->orderBy('name')->get();

        if ($services->isEmpty()) {
            $this->info('No services found. Nothing to migrate.');
            return self::SUCCESS;
        }

        // Group by (group_name, base name without the trailing "N min").
        // e.g. "Couple Massage 60 min" -> base name "Couple Massage"
        $groups = $services->groupBy(function (Service $service) {
            $base = preg_replace('/\s*\d+\s*min(ute)?s?\s*$/i', '', $service->name);
            return trim($service->group_name . '|' . $base);
        });

        $this->info("Found {$services->count()} services, grouping into {$groups->count()} parent service(s).");
        $this->newLine();

        $plan = [];

        foreach ($groups as $key => $groupServices) {
            $first = $groupServices->first();
            $baseName = preg_replace('/\s*\d+\s*min(ute)?s?\s*$/i', '', $first->name);
            $baseName = trim($baseName) ?: $first->name;

            $this->line("<fg=yellow>Parent:</> {$baseName} (group: {$first->group_name})");

            $variantPlans = [];
            foreach ($groupServices->sortBy('duration_minutes') as $svc) {
                $bookingCount = Booking::where('service_id', $svc->id)->count();
                $this->line("   - {$svc->duration_minutes} min @ AED {$svc->price}  (old service #{$svc->id}, {$bookingCount} booking(s) to relink)");
                $variantPlans[] = $svc;
            }

            $plan[] = [
                'base_name' => $baseName,
                'source'    => $first,
                'variants'  => $variantPlans,
            ];

            $this->newLine();
        }

        if (! $execute) {
            $this->warn('This was a DRY RUN. No changes were made.');
            $this->warn('Review the plan above. If it looks correct, back up your database, then run:');
            $this->line('  php artisan services:migrate-variants --execute');
            return self::SUCCESS;
        }

        if (! $this->confirm('This will modify your services and bookings tables. Have you backed up your database?')) {
            $this->error('Aborted. Please back up your database first (e.g. pg_dump) before running with --execute.');
            return self::FAILURE;
        }

        DB::beginTransaction();

        try {
            foreach ($plan as $group) {
                /** @var Service $source */
                $source = $group['source'];

                // Promote the first service in the group into the parent record.
                $parent = Service::create([
                    'name'          => $group['base_name'],
                    'name_ar'       => $source->name_ar,
                    'description'   => $source->description,
                    'category'      => $source->category,
                    'group_name'    => $source->group_name,
                    'group_name_ar' => $source->group_name_ar,
                    'is_active'     => true,
                    'rating'        => $source->rating,
                ]);

                foreach ($group['variants'] as $oldSvc) {
                    $variant = ServiceVariant::create([
                        'service_id'       => $parent->id,
                        'duration_minutes' => $oldSvc->duration_minutes,
                        'price'            => $oldSvc->price,
                        'is_active'        => $oldSvc->is_active,
                    ]);

                    // Relink every booking that pointed at the old flat service
                    // to the new parent + the matching variant.
                    Booking::where('service_id', $oldSvc->id)->update([
                        'service_id'         => $parent->id,
                        'service_variant_id' => $variant->id,
                    ]);
                }

                $this->info("Migrated '{$group['base_name']}' -> service #{$parent->id} with " . count($group['variants']) . ' variant(s).');
            }

            // Old flat service rows are now orphaned (their bookings were relinked above).
            // Soft-archive them instead of deleting, just in case.
            $oldIds = $services->pluck('id');
            Service::whereIn('id', $oldIds)->update(['archived_at' => now(), 'is_active' => false]);

            DB::commit();

            $this->newLine();
            $this->info('Migration complete. Old service rows were archived (not deleted) for safety.');
            $this->info('Verify your bookings and reports look correct, then you may optionally clean up archived rows later.');

            return self::SUCCESS;
        } catch (\Throwable $e) {
            DB::rollBack();
            $this->error('Migration failed and was rolled back: ' . $e->getMessage());
            return self::FAILURE;
        }
    }
}