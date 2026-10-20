<?php

namespace Tests\Feature\Admin;

use App\Models\Booking;
use App\Models\Service;
use App\Models\ServiceVariant;
use App\Models\Therapist;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * NOTE: requires a Postgres-backed test database (infinity_spa_test) — see
 * tests/TestCase.php's guardAgainstUnsafeTestDatabase(), which refuses to run
 * against anything else.
 *
 * Batch #31A — Admin Services CRUD & variant integrity:
 *   - the PUT/POST route-method mismatch that broke "Save Changes"
 *   - variant ownership scoping (no cross-service mutation)
 *   - duplicate-duration rejection as clean validation, not a raw DB error
 *   - booking-referenced variants surviving an edit instead of being deleted
 */
class AdminServiceCrudTest extends TestCase
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

    private function therapistUser(): User
    {
        $user = User::factory()->create(['role' => 'therapist']);

        Therapist::create([
            'user_id'       => $user->id,
            'base_location' => 'Dubai',
            'gender'        => 'female',
            'is_active'     => true,
        ]);

        return $user;
    }

    private function makeService(string $name = 'Swedish Massage'): Service
    {
        return Service::create([
            'name'       => $name,
            'category'   => 'massage',
            'group_name' => $name,
            'is_active'  => true,
        ]);
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

    private function makeBookingFor(ServiceVariant $variant): Booking
    {
        $customer  = $this->customer();
        $therapist = Therapist::create([
            'user_id'       => $this->therapistUser()->id,
            'base_location' => 'Dubai',
            'gender'        => 'male',
            'is_active'     => true,
        ]);

        return Booking::create([
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
            'status'              => 'accepted',
            'downpayment_amount'  => 50,
            'remaining_amount'    => (float) $variant->price - 50,
            'paid_amount'         => 50,
        ]);
    }

    // ── Task A: route repair ────────────────────────────────────────────────

    public function test_admin_can_edit_service_via_multipart_post_with_method_spoofing(): void
    {
        $service = $this->makeService();
        $variant = $this->makeVariant($service, 60, 300);

        $response = $this->actingAs($this->admin())->post("/admin/api/services/{$service->id}", [
            '_method'                      => 'put',
            'name'                        => 'Swedish Massage Deluxe',
            'is_active'                   => '1',
            'variants'                    => [
                ['id' => $variant->id, 'duration_minutes' => 60, 'price' => 320, 'is_active' => '1'],
            ],
        ]);

        $response->assertOk();
        $this->assertSame('Swedish Massage Deluxe', $service->fresh()->name);
        $this->assertEquals(320, $variant->fresh()->price);
    }

    public function test_plain_post_without_method_spoofing_still_works(): void
    {
        $service = $this->makeService();
        $variant = $this->makeVariant($service, 60, 300);

        $response = $this->actingAs($this->admin())->post("/admin/api/services/{$service->id}", [
            'name'                        => 'Swedish Massage',
            'is_active'                   => '1',
            'variants'                    => [
                ['id' => $variant->id, 'duration_minutes' => 60, 'price' => 300, 'is_active' => '1'],
            ],
        ]);

        $response->assertOk();
    }

    public function test_admin_can_add_a_new_service(): void
    {
        $response = $this->actingAs($this->admin())->postJson('/admin/api/services', [
            'name'       => 'Hot Stone Therapy',
            'is_active'  => true,
            'variants'   => [
                ['duration_minutes' => 90, 'price' => 450],
            ],
        ]);

        $response->assertCreated();
        $this->assertDatabaseHas('services', ['name' => 'Hot Stone Therapy']);
        $this->assertDatabaseHas('service_variants', ['duration_minutes' => 90, 'price' => 450]);
    }

    // ── Task B: variant ownership & validation ──────────────────────────────

    public function test_admin_can_add_a_new_duration_option_on_edit(): void
    {
        $service = $this->makeService();
        $variant = $this->makeVariant($service, 60, 300);

        $response = $this->actingAs($this->admin())->putJson("/admin/api/services/{$service->id}", [
            'name'      => $service->name,
            'is_active' => true,
            'variants'  => [
                ['id' => $variant->id, 'duration_minutes' => 60, 'price' => 300, 'is_active' => true],
                ['duration_minutes' => 90, 'price' => 420, 'is_active' => true],
            ],
        ]);

        $response->assertOk();
        $this->assertDatabaseHas('service_variants', ['service_id' => $service->id, 'duration_minutes' => 90, 'price' => 420]);
    }

    public function test_admin_can_edit_duration_pricing(): void
    {
        $service = $this->makeService();
        $variant = $this->makeVariant($service, 60, 300);

        $this->actingAs($this->admin())->putJson("/admin/api/services/{$service->id}", [
            'name'      => $service->name,
            'is_active' => true,
            'variants'  => [
                ['id' => $variant->id, 'duration_minutes' => 60, 'price' => 350, 'is_active' => true],
            ],
        ])->assertOk();

        $this->assertEquals(350, $variant->fresh()->price);
    }

    public function test_admin_can_toggle_variant_availability(): void
    {
        $service = $this->makeService();
        $variant = $this->makeVariant($service, 60, 300, active: true);

        $this->actingAs($this->admin())->putJson("/admin/api/services/{$service->id}", [
            'name'      => $service->name,
            'is_active' => true,
            'variants'  => [
                ['id' => $variant->id, 'duration_minutes' => 60, 'price' => 300, 'is_active' => false],
            ],
        ])->assertOk();

        $this->assertFalse($variant->fresh()->is_active);
    }

    public function test_duplicate_duration_in_same_submission_is_rejected_with_422(): void
    {
        $service  = $this->makeService();
        $variant  = $this->makeVariant($service, 60, 300);

        $response = $this->actingAs($this->admin())->putJson("/admin/api/services/{$service->id}", [
            'name'      => $service->name,
            'is_active' => true,
            'variants'  => [
                ['id' => $variant->id, 'duration_minutes' => 60, 'price' => 300, 'is_active' => true],
                ['duration_minutes' => 60, 'price' => 350, 'is_active' => true],
            ],
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['variants.0.duration_minutes', 'variants.1.duration_minutes']);
    }

    public function test_cross_service_variant_id_is_rejected_without_mutating_other_service(): void
    {
        $serviceA = $this->makeService('Service A');
        $serviceB = $this->makeService('Service B');
        $variantB = $this->makeVariant($serviceB, 60, 300);

        $response = $this->actingAs($this->admin())->putJson("/admin/api/services/{$serviceA->id}", [
            'name'      => 'Service A',
            'is_active' => true,
            'variants'  => [
                // variantB belongs to serviceB, not serviceA
                ['id' => $variantB->id, 'duration_minutes' => 75, 'price' => 999, 'is_active' => true],
            ],
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['variants.0.id']);

        // serviceB's variant must be completely untouched
        $this->assertEquals(60, $variantB->fresh()->duration_minutes);
        $this->assertEquals(300, $variantB->fresh()->price);
    }

    public function test_invalid_submission_leaves_all_service_data_unchanged(): void
    {
        $service = $this->makeService('Original Name');
        $variant = $this->makeVariant($service, 60, 300);

        $response = $this->actingAs($this->admin())->putJson("/admin/api/services/{$service->id}", [
            'name'      => 'Attempted Rename',
            'is_active' => true,
            'variants'  => [
                ['id' => $variant->id, 'duration_minutes' => 60, 'price' => 999, 'is_active' => true],
                ['duration_minutes' => 60, 'price' => 999, 'is_active' => true], // duplicate duration -> fails
            ],
        ]);

        $response->assertStatus(422);
        $this->assertSame('Original Name', $service->fresh()->name);
        $this->assertEquals(300, $variant->fresh()->price);
        $this->assertCount(1, $service->fresh()->variants);
    }

    // ── Task C: booking-history preservation ────────────────────────────────

    public function test_referenced_variant_cannot_be_deleted_by_omitting_it(): void
    {
        $service = $this->makeService();
        $variant = $this->makeVariant($service, 60, 300);
        $booking = $this->makeBookingFor($variant);

        $otherVariant = $this->makeVariant($service, 90, 450);

        // Admin submits an edit that omits the referenced 60-min variant entirely.
        $response = $this->actingAs($this->admin())->putJson("/admin/api/services/{$service->id}", [
            'name'      => $service->name,
            'is_active' => true,
            'variants'  => [
                ['id' => $otherVariant->id, 'duration_minutes' => 90, 'price' => 450, 'is_active' => true],
            ],
        ]);

        $response->assertOk();

        // The referenced variant must still exist — not hard-deleted.
        $this->assertDatabaseHas('service_variants', ['id' => $variant->id]);
        $booking->refresh();
        $this->assertEquals($variant->id, $booking->service_variant_id);
    }

    public function test_unreferenced_variant_is_deleted_when_omitted(): void
    {
        $service = $this->makeService();
        $keep    = $this->makeVariant($service, 60, 300);
        $drop    = $this->makeVariant($service, 90, 450); // no bookings reference this one

        $response = $this->actingAs($this->admin())->putJson("/admin/api/services/{$service->id}", [
            'name'      => $service->name,
            'is_active' => true,
            'variants'  => [
                ['id' => $keep->id, 'duration_minutes' => 60, 'price' => 300, 'is_active' => true],
            ],
        ]);

        $response->assertOk();
        $this->assertDatabaseMissing('service_variants', ['id' => $drop->id]);
        $this->assertDatabaseHas('service_variants', ['id' => $keep->id]);
    }

    public function test_existing_booking_history_and_financial_amounts_remain_unchanged(): void
    {
        $service = $this->makeService();
        $variant = $this->makeVariant($service, 60, 300);
        $booking = $this->makeBookingFor($variant);

        $originalDownpayment = (float) $booking->downpayment_amount;
        $originalRemaining   = (float) $booking->remaining_amount;
        $originalPaid        = (float) $booking->paid_amount;

        $this->actingAs($this->admin())->putJson("/admin/api/services/{$service->id}", [
            'name'      => 'Renamed Service',
            'is_active' => true,
            'variants'  => [
                ['id' => $variant->id, 'duration_minutes' => 60, 'price' => 399, 'is_active' => true],
            ],
        ])->assertOk();

        $booking->refresh();
        $this->assertEquals($originalDownpayment, (float) $booking->downpayment_amount);
        $this->assertEquals($originalRemaining, (float) $booking->remaining_amount);
        $this->assertEquals($originalPaid, (float) $booking->paid_amount);
        $this->assertEquals($variant->id, $booking->service_variant_id);
        $this->assertEquals('accepted', $booking->status);
    }

    // ── Authorization ────────────────────────────────────────────────────────

    public function test_customer_cannot_mutate_admin_services(): void
    {
        $service = $this->makeService();
        $variant = $this->makeVariant($service, 60, 300);

        $this->actingAs($this->customer())->put("/admin/api/services/{$service->id}", [
            'name'      => 'Hacked Name',
            'is_active' => true,
            'variants'  => [
                ['id' => $variant->id, 'duration_minutes' => 60, 'price' => 1, 'is_active' => true],
            ],
        ])->assertRedirect('/'); // AdminMiddleware denies non-admins by redirect, not JSON 403

        $this->assertEquals(300, $variant->fresh()->price);
    }

    public function test_therapist_cannot_mutate_admin_services(): void
    {
        $service = $this->makeService();
        $variant = $this->makeVariant($service, 60, 300);

        $this->actingAs($this->therapistUser())->put("/admin/api/services/{$service->id}", [
            'name'      => 'Hacked Name',
            'is_active' => true,
            'variants'  => [
                ['id' => $variant->id, 'duration_minutes' => 60, 'price' => 1, 'is_active' => true],
            ],
        ])->assertRedirect('/');

        $this->assertEquals(300, $variant->fresh()->price);
    }
}
