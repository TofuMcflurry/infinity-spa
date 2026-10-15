<?php

namespace App\Http\Controllers;

use App\Events\TherapistLocationUpdated;
use App\Models\Booking;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Redis;

// GPS v1 ingestion/storage/realtime layer — see docs/architecture/GPS-ARCHITECTURE.md.
// This controller validates, stores the latest therapist location in
// Redis/Valkey, and broadcasts it. PostgreSQL is never written here —
// deliberate per the ADR (§10, §20).
class TherapistLocationController extends Controller
{
    public function update(Request $request, Booking $booking)
    {
        $this->authorizeTherapist($booking);

        abort_if(
            $booking->status !== 'en_route',
            422,
            'Location updates are only accepted while the booking is en route.'
        );

        $validated = $request->validate([
            'latitude'        => ['required', 'numeric', 'between:-90,90'],
            'longitude'       => ['required', 'numeric', 'between:-180,180'],
            'accuracy_meters' => ['required', 'numeric', 'min:0'],
            'recorded_at'     => ['required', 'date'],
            'heading'         => ['nullable', 'numeric', 'between:0,360'],
        ]);

        abort_if(
            $validated['accuracy_meters'] > config('gps.max_accuracy_meters'),
            422,
            'Location accuracy is too low to accept.'
        );

        $recordedAt = Carbon::parse($validated['recorded_at']);

        // Reasonable-timestamp guard: a device clock can drift a little, but
        // this rejects payloads that are obviously stale (sat in a queue) or
        // obviously from the future (clock misconfigured), rather than
        // trusting whatever the client claims.
        $now = now();
        abort_if(
            $recordedAt->lt($now->copy()->subMinutes(5)) || $recordedAt->gt($now->copy()->addMinute()),
            422,
            'Location timestamp is not valid.'
        );

        $key   = "booking:{$booking->id}:location";
        $redis = Redis::connection();
        $raw   = $redis->get($key);
        $existing = $raw ? json_decode($raw, true) : null;

        if ($existing) {
            $existingRecordedAt = Carbon::parse($existing['recorded_at']);

            // Stale/out-of-order overwrite protection — an update that isn't
            // strictly newer than what's already stored must never replace it.
            abort_if(
                $recordedAt->lessThanOrEqualTo($existingRecordedAt),
                409,
                'A newer location has already been recorded for this booking.'
            );

            $distanceKm    = $this->haversineKm(
                (float) $existing['latitude'],
                (float) $existing['longitude'],
                $validated['latitude'],
                $validated['longitude'],
            );
            $elapsedHours  = $existingRecordedAt->diffInMilliseconds($recordedAt) / 3_600_000;
            $impliedSpeed  = $distanceKm / $elapsedHours;

            abort_if(
                $impliedSpeed > config('gps.max_speed_kmh'),
                422,
                'Implied travel speed is not plausible.'
            );
        }

        $payload = [
            'booking_id'      => $booking->id,
            'therapist_id'    => $booking->therapist_id,
            'latitude'        => $validated['latitude'],
            'longitude'       => $validated['longitude'],
            'accuracy_meters' => $validated['accuracy_meters'],
            'recorded_at'     => $recordedAt->toIso8601String(),
            'heading'         => $validated['heading'] ?? null,
        ];

        // Broadcast only after the Redis write has actually succeeded (setex
        // throws on failure, which aborts here before this line is reached —
        // the exception then falls through to the framework's normal error
        // response, same as before this event existed) and only using the
        // exact payload just written, never re-reading the request/booking.
        $redis->setex($key, config('gps.location_ttl_seconds'), json_encode($payload));

        broadcast(new TherapistLocationUpdated(
            bookingId: $payload['booking_id'],
            therapistId: $payload['therapist_id'],
            latitude: $payload['latitude'],
            longitude: $payload['longitude'],
            accuracyMeters: $payload['accuracy_meters'],
            recordedAt: $payload['recorded_at'],
            heading: $payload['heading'],
        ));

        return response()->json(['status' => 'accepted', 'message' => 'Location updated.']);
    }

    private function haversineKm(float $lat1, float $lon1, float $lat2, float $lon2): float
    {
        $earthRadiusKm = 6371;

        $dLat = deg2rad($lat2 - $lat1);
        $dLon = deg2rad($lon2 - $lon1);

        $a = sin($dLat / 2) ** 2
            + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLon / 2) ** 2;
        $c = 2 * atan2(sqrt($a), sqrt(1 - $a));

        return $earthRadiusKm * $c;
    }

    private function authorizeTherapist(Booking $booking): void
    {
        abort_if($booking->therapist_id !== auth()->user()->therapist->id, 403, 'Unauthorized.');
    }
}
