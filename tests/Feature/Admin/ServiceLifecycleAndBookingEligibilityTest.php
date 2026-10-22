<?php

namespace Tests\Feature\Admin;

use App\Models\Booking;
use App\Models\Service;
use App\Models\ServiceVariant;
use App\Models\Therapist;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * NOTE: requires a Postgres-backed test database (infinity_spa_test) — see
 * tests/TestCase.php's guardAgainstUnsafeTestDatabase().
 *
 * Batch #31B — Admin service lifecycle (archive/restore semantics) and
 * authenticated-customer booking eligibility enforcement:
 *   - archive()/restore() must preserve is_active across the archive cycle
 *     instead of forcing it
 *   - getServices() must independently check archived_at and require at
 *     least one active variant, now that archiving no longer forces
 *     is_active=false as a side effect
 *   - getAvailableSlots()/store() must reject an inactive variant, an
 *     inactive parent service, or an archived parent service directly,
 *     not merely rely on the UI never offering them
 */
class ServiceLifecycleAndBookingEligibilityTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        return User::factory()->create(['role' => 'admin']);
    }

    private function customer(): User
    {
        return User::factory()->create(['role' => 'customer']);
    }

    private function makeTherapist(): Therapist
    {
        $user = User::factory()->create(['role' => 'therapist']);

        // Defaults to Tuesday day-off, 16:00-04:00 shift — same convention
        // already established in BookingCreationRaceTest.
        return Therapist::create([
            'user_id'       => $user->id,
            'base_location' => 'Dubai',
            'gender'        => 'female',
            'is_active'     => true,
        ]);
    }

    private function shiftDateTime(int $hour, int $minute = 0): string
    {
        return Carbon::parse('next Monday')->setTime($hour, $minute)->toDateTimeString();
    }

    private function makeService(string $name = 'Swedish Massage', array $overrides = []): Service
    {
        return Service::create(array_merge([
            'name'       => $name,
            'category'   => 'massage',
            'group_name' => $name,
            'is_active'  => true,
        ], $overrides));
    }

    private function makeVariant(Service $service, int $duration, float $price, bool $active = true): ServiceVariant
    {
        return ServiceVariant::create([
            'service_id'       => $service->id,
            'duration_minutes' => $duration,
            'price'            => $price,
            'is_active'        => $active,
        ]);
    }

    private function bookingPayload(ServiceVariant $variant, Therapist $therapist, array $overrides = []): array
    {
        return array_merge([
            'service_id'     => $variant->id,
            'therapist_id'   => $therapist->id,
            'zone_name'      => 'Test Zone',
            'location'       => 'Test location',
            'datetime'       => $this->shiftDateTime(20, 0),
            'payment_type'   => 'full',
            'payment_method' => 'cashless',
        ], $overrides);
    }

    // ── 1 & 2. Archive/restore preserves pre-archive is_active ─────────────

    public function test_inactive_service_restored_after_archive_stays_inactive(): void
    {
        $service = $this->makeService('Inactive Service', ['is_active' => false]);

        $this->actingAs($this->admin())->postJson("/admin/api/services/{$service->id}/archive")->assertOk();
        $service->refresh();
        $this->assertFalse($service->is_active, 'archive() must not flip is_active.');
        $this->assertNotNull($service->archived_at);

        $this->actingAs($this->admin())->postJson("/admin/api/services/{$service->id}/restore")->assertOk();
        $service->refresh();
        $this->assertFalse($service->is_active, 'restore() must not force is_active=true.');
        $this->assertNull($service->archived_at);
    }

    public function test_active_service_restored_after_archive_stays_active(): void
    {
        $service = $this->makeService('Active Service', ['is_active' => true]);

        $this->actingAs($this->admin())->postJson("/admin/api/services/{$service->id}/archive")->assertOk();
        $service->refresh();
        $this->assertTrue($service->is_active, 'archive() must leave a previously-active service active.');

        $this->actingAs($this->admin())->postJson("/admin/api/services/{$service->id}/restore")->assertOk();
        $service->refresh();
        $this->assertTrue($service->is_active);
        $this->assertNull($service->archived_at);
    }

    public function test_toggle_active_cannot_make_an_archived_service_bookable(): void
    {
        $service = $this->makeService();
        $variant = $this->makeVariant($service, 60, 300);
        $this->actingAs($this->admin())->postJson("/admin/api/services/{$service->id}/archive")->assertOk();

        // Toggling is_active on an archived service only flips that column —
        // archived_at is untouched, so it must remain unbookable regardless
        // of which way is_active ends up. Two toggles land back on the
        // original true, making the point explicit: even "active" + archived
        // must stay unbookable.
        $this->actingAs($this->admin())->postJson("/admin/api/services/{$service->id}/toggle")->assertOk();
        $this->actingAs($this->admin())->postJson("/admin/api/services/{$service->id}/toggle")->assertOk();
        $service->refresh();
        $this->assertTrue($service->is_active);
        $this->assertNotNull($service->archived_at);

        $therapist = $this->makeTherapist();
        $this->actingAs($this->customer())
            ->getJson('/api/available-slots?' . http_build_query([
                'service_id' => $variant->id, 'zone_name' => 'Test Zone',
                'date' => $this->shiftDateTime(20, 0), 'therapist_id' => $therapist->id,
            ]))
            ->assertStatus(409);
    }

    // ── 3 & 4. Archived / variant-less services excluded from discovery ────

    public function test_archived_service_excluded_from_customer_services_listing(): void
    {
        $service = $this->makeService();
        $this->makeVariant($service, 60, 300);
        $service->update(['archived_at' => now()]);

        $response = $this->actingAs($this->customer())->getJson('/api/services');
        $response->assertOk();
        $names = collect($response->json())->pluck('group_name');
        $this->assertFalse($names->contains($service->group_name));
    }

    public function test_archived_service_excluded_from_guest_services_listing(): void
    {
        $service = $this->makeService();
        $this->makeVariant($service, 60, 300);
        $service->update(['archived_at' => now()]);

        $response = $this->getJson('/api/guest/services');
        $response->assertOk();
        $ids = collect($response->json())->pluck('id');
        $this->assertFalse($ids->contains($service->id));
    }

    public function test_active_service_with_no_active_variants_excluded_from_customer_listing(): void
    {
        $service = $this->makeService();
        $this->makeVariant($service, 60, 300, active: false);

        $response = $this->actingAs($this->customer())->getJson('/api/services');
        $response->assertOk();
        $names = collect($response->json())->pluck('group_name');
        $this->assertFalse($names->contains($service->group_name));
    }

    public function test_active_service_with_no_active_variants_excluded_from_guest_listing(): void
    {
        $service = $this->makeService();
        $this->makeVariant($service, 60, 300, active: false);

        $response = $this->getJson('/api/guest/services');
        $response->assertOk();
        $ids = collect($response->json())->pluck('id');
        $this->assertFalse($ids->contains($service->id));
    }

    // ── 5 & 6. Inactive variant rejected by both booking endpoints ─────────

    public function test_inactive_variant_rejected_by_available_slots(): void
    {
        $service  = $this->makeService();
        $variant  = $this->makeVariant($service, 60, 300, active: false);
        $therapist = $this->makeTherapist();

        $this->actingAs($this->customer())
            ->getJson('/api/available-slots?' . http_build_query([
                'service_id' => $variant->id, 'zone_name' => 'Test Zone',
                'date' => $this->shiftDateTime(20, 0), 'therapist_id' => $therapist->id,
            ]))
            ->assertStatus(409);
    }

    public function test_inactive_variant_rejected_by_store(): void
    {
        $service  = $this->makeService();
        $variant  = $this->makeVariant($service, 60, 300, active: false);
        $therapist = $this->makeTherapist();

        $this->actingAs($this->customer())
            ->postJson('/api/bookings', $this->bookingPayload($variant, $therapist))
            ->assertStatus(409);

        $this->assertSame(0, Booking::count());
    }

    // ── 7. Archived parent service rejected by both endpoints ──────────────

    public function test_archived_parent_service_rejected_by_both_endpoints(): void
    {
        $service  = $this->makeService();
        $variant  = $this->makeVariant($service, 60, 300);
        $service->update(['archived_at' => now()]);
        $therapist = $this->makeTherapist();
        $customer  = $this->customer();

        $this->actingAs($customer)
            ->getJson('/api/available-slots?' . http_build_query([
                'service_id' => $variant->id, 'zone_name' => 'Test Zone',
                'date' => $this->shiftDateTime(20, 0), 'therapist_id' => $therapist->id,
            ]))
            ->assertStatus(409);

        $this->actingAs($customer)
            ->postJson('/api/bookings', $this->bookingPayload($variant, $therapist))
            ->assertStatus(409);

        $this->assertSame(0, Booking::count());
    }

    // ── 8. Inactive (not archived) parent service rejected by both ─────────

    public function test_inactive_parent_service_rejected_by_both_endpoints(): void
    {
        $service  = $this->makeService('Inactive Parent', ['is_active' => false]);
        $variant  = $this->makeVariant($service, 60, 300);
        $therapist = $this->makeTherapist();
        $customer  = $this->customer();

        $this->actingAs($customer)
            ->getJson('/api/available-slots?' . http_build_query([
                'service_id' => $variant->id, 'zone_name' => 'Test Zone',
                'date' => $this->shiftDateTime(20, 0), 'therapist_id' => $therapist->id,
            ]))
            ->assertStatus(409);

        $this->actingAs($customer)
            ->postJson('/api/bookings', $this->bookingPayload($variant, $therapist))
            ->assertStatus(409);

        $this->assertSame(0, Booking::count());
    }

    // ── 9. Active variant remains bookable despite an inactive sibling ─────

    public function test_active_variant_remains_bookable_when_sibling_variant_is_inactive(): void
    {
        $service       = $this->makeService();
        $activeVariant = $this->makeVariant($service, 60, 300, active: true);
        $this->makeVariant($service, 90, 450, active: false);
        $therapist     = $this->makeTherapist();

        $response = $this->actingAs($this->customer())
            ->postJson('/api/bookings', $this->bookingPayload($activeVariant, $therapist));

        $response->assertCreated();
        $this->assertSame(1, Booking::count());
    }

    // ── 10. Admin catalog correctly separates archived vs non-archived ─────

    public function test_admin_catalog_separates_archived_and_non_archived_services(): void
    {
        $visible  = $this->makeService('Visible Service');
        $this->makeVariant($visible, 60, 300);
        $archived = $this->makeService('Archived Service');
        $this->makeVariant($archived, 60, 300);
        $archived->update(['archived_at' => now()]);

        $admin = $this->admin();

        $active = $this->actingAs($admin)->getJson('/admin/api/services');
        $active->assertOk();
        $activeIds = collect($active->json())->pluck('id');
        $this->assertTrue($activeIds->contains($visible->id));
        $this->assertFalse($activeIds->contains($archived->id));

        $archivedList = $this->actingAs($admin)->getJson('/admin/api/services?archived=1');
        $archivedList->assertOk();
        $archivedIds = collect($archivedList->json())->pluck('id');
        $this->assertTrue($archivedIds->contains($archived->id));
        $this->assertFalse($archivedIds->contains($visible->id));
    }

    // ── 11. Existing booking/payment/refund fields unchanged ───────────────

    public function test_existing_booking_financial_fields_unchanged_by_lifecycle_actions(): void
    {
        $service  = $this->makeService();
        $variant  = $this->makeVariant($service, 60, 300);
        $therapist = $this->makeTherapist();
        $customer  = $this->customer();

        $booking = Booking::create([
            'customer_id'         => $customer->id,
            'therapist_id'        => $therapist->id,
            'service_id'          => $variant->service_id,
            'service_variant_id'  => $variant->id,
            'location'            => 'Home - Palm Jumeirah',
            'zone_name'           => 'Palm Jumeirah',
            'scheduled_date'      => now()->addDay()->toDateString(),
            'scheduled_start'     => now()->addDay(),
            'scheduled_end'       => now()->addDay()->addHour(),
            'travel_start'        => now()->addDay()->subMinutes(30),
            'buffer_end'          => now()->addDay()->addHour()->addMinutes(30),
            'payment_method'      => 'cash',
            'payment_type'        => 'downpayment',
            'status'              => 'accepted',
            'downpayment_amount'  => 60,
            'remaining_amount'    => 240,
            'payment_status'      => 'paid',
            'paid_amount'         => 60,
        ]);

        $before = $booking->only([
            'downpayment_amount', 'remaining_amount', 'paid_amount', 'payment_status', 'status',
        ]);

        $admin = $this->admin();
        $this->actingAs($admin)->postJson("/admin/api/services/{$service->id}/archive")->assertOk();
        $this->actingAs($admin)->postJson("/admin/api/services/{$service->id}/restore")->assertOk();
        $this->actingAs($admin)->postJson("/admin/api/services/{$service->id}/toggle")->assertOk();

        $booking->refresh();
        $after = $booking->only([
            'downpayment_amount', 'remaining_amount', 'paid_amount', 'payment_status', 'status',
        ]);

        $this->assertEquals(
            array_map(fn ($v) => (string) $v, $before),
            array_map(fn ($v) => (string) $v, $after)
        );
    }
}
