<?php

namespace Tests\Feature;

use App\Models\Service;
use App\Models\ServiceVariant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * NOTE: requires a Postgres-backed test database (infinity_spa_test) — see
 * tests/TestCase.php's guardAgainstUnsafeTestDatabase().
 *
 * Batch #31C, Stage 1 — Admin-managed service image integration:
 *   - GuestBookingController::services() must expose image/image_url using
 *     the same Storage::disk('public')->url() contract AdminServiceController
 *     already uses, with image_url=null when no image is assigned
 *   - every pre-existing response field and visibility filter (archived_at,
 *     is_active, active-variant requirement) must survive untouched
 *   - the pre-existing Admin image upload/serialization behavior (unchanged
 *     in this batch) must still work as a regression guard
 */
class ServiceImageIntegrationTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        return User::factory()->create(['role' => 'admin']);
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

    // ── Task C.1 & C.2 — image / image_url contract ─────────────────────────

    public function test_guest_services_returns_image_and_image_url_for_an_image_assigned_service(): void
    {
        Storage::fake('public');
        $service = $this->makeService();
        $this->makeVariant($service, 60, 300);
        $service->update(['image' => 'services/sample.jpg']);

        $response = $this->getJson('/api/guest/services');
        $response->assertOk();

        $entry = collect($response->json())->firstWhere('id', $service->id);
        $this->assertNotNull($entry);
        $this->assertSame('services/sample.jpg', $entry['image']);
        $this->assertSame(Storage::disk('public')->url('services/sample.jpg'), $entry['image_url']);
    }

    public function test_guest_services_returns_null_image_url_for_a_service_without_an_image(): void
    {
        $service = $this->makeService();
        $this->makeVariant($service, 60, 300);
        // image left at its default NULL — never assigned

        $response = $this->getJson('/api/guest/services');
        $response->assertOk();

        $entry = collect($response->json())->firstWhere('id', $service->id);
        $this->assertNotNull($entry);
        $this->assertNull($entry['image']);
        $this->assertNull($entry['image_url']);
    }

    // ── Task C.3 — existing response fields untouched ───────────────────────

    public function test_guest_services_response_still_includes_every_pre_existing_field(): void
    {
        $service = $this->makeService('Hot Stone Therapy');
        $this->makeVariant($service, 60, 300);

        $response = $this->getJson('/api/guest/services');
        $response->assertOk();

        $entry = collect($response->json())->firstWhere('id', $service->id);
        $this->assertNotNull($entry);
        $this->assertArrayHasKey('id', $entry);
        $this->assertArrayHasKey('name', $entry);
        $this->assertArrayHasKey('description', $entry);
        $this->assertArrayHasKey('rating', $entry);
        $this->assertArrayHasKey('guest_variant', $entry);
        $this->assertSame('Hot Stone Therapy', $entry['name']);
        $this->assertSame(60, $entry['guest_variant']['duration_minutes']);
        $this->assertEquals(300, $entry['guest_variant']['price']);
    }

    // ── Task C.4 — archived / inactive services stay excluded ───────────────

    public function test_archived_service_stays_excluded_from_guest_services_even_with_an_image(): void
    {
        $service = $this->makeService();
        $this->makeVariant($service, 60, 300);
        $service->update(['image' => 'services/sample.jpg', 'archived_at' => now()]);

        $response = $this->getJson('/api/guest/services');
        $response->assertOk();
        $ids = collect($response->json())->pluck('id');
        $this->assertFalse($ids->contains($service->id));
    }

    public function test_inactive_service_stays_excluded_from_guest_services_even_with_an_image(): void
    {
        $service = $this->makeService(overrides: ['is_active' => false]);
        $this->makeVariant($service, 60, 300);
        $service->update(['image' => 'services/sample.jpg']);

        $response = $this->getJson('/api/guest/services');
        $response->assertOk();
        $ids = collect($response->json())->pluck('id');
        $this->assertFalse($ids->contains($service->id));
    }

    // ── Task C.5 — services without an active variant stay excluded ─────────

    public function test_service_with_no_active_variant_stays_excluded_from_guest_services_even_with_an_image(): void
    {
        $service = $this->makeService();
        $this->makeVariant($service, 60, 300, active: false);
        $service->update(['image' => 'services/sample.jpg']);

        $response = $this->getJson('/api/guest/services');
        $response->assertOk();
        $ids = collect($response->json())->pluck('id');
        $this->assertFalse($ids->contains($service->id));
    }

    // ── Task C.6 — existing Admin image upload/serialization regression ─────

    public function test_admin_image_upload_still_returns_correct_image_and_image_url(): void
    {
        Storage::fake('public');
        $service = $this->makeService();
        $this->makeVariant($service, 60, 300);

        $response = $this->actingAs($this->admin())->post("/admin/api/services/{$service->id}", [
            '_method'   => 'put',
            'name'      => $service->name,
            'is_active' => '1',
            'image'     => UploadedFile::fake()->create('photo.jpg', 10, 'image/jpeg'),
            'variants'  => [
                ['id' => $service->variants->first()->id, 'duration_minutes' => 60, 'price' => 300, 'is_active' => '1'],
            ],
        ]);

        $response->assertOk();
        $service->refresh();
        $this->assertNotNull($service->image);
        Storage::disk('public')->assertExists($service->image);
        $this->assertSame($response->json('image_url'), Storage::disk('public')->url($service->image));
    }
}
