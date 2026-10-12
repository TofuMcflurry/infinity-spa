<?php

namespace App\Http\Controllers;

use App\Models\Booking;
use App\Models\Service;
use Carbon\Carbon;
use Illuminate\Http\Request;

class GuestBookingController extends Controller
{
    public function services()
    {
        // Guest (landing-page) bookings are always 60-minute sessions — the
        // guest wizard has no duration picker, so only services with an
        // active 60-minute variant can be shown/booked from this endpoint.
        // `guest_variant` is that variant's duration/price; null means the
        // service has no active 60-minute option and callers should hide it
        // rather than fall back to a different duration.
        $services = Service::where('is_active', true)
            ->whereNull('archived_at')
            ->whereHas('variants', fn ($q) => $q->where('is_active', true))
            ->with(['variants' => fn ($q) => $q->where('is_active', true)->orderBy('duration_minutes')])
            ->orderBy('name')
            ->get()
            ->map(function (Service $service) {
                $sixtyMinVariant = $service->variants->firstWhere('duration_minutes', 60);

                return [
                    'id'            => $service->id,
                    'name'          => $service->name,
                    'description'   => $service->description,
                    'rating'        => $service->rating !== null ? (float) $service->rating : null,
                    'guest_variant' => $sixtyMinVariant ? [
                        'duration_minutes' => (int) $sixtyMinVariant->duration_minutes,
                        'price'             => (float) $sixtyMinVariant->price,
                    ] : null,
                ];
            })
            ->values();

        return response()->json($services);
    }

    public function store(Request $request)
    {
        $request->validate([
            'service_id'  => 'required|exists:services,id',
            'date'        => 'required|date|after_or_equal:today',
            'time'        => 'required|date_format:H:i',
            'location'    => 'required|string|max:500',
            'guest_name'  => 'required|string|max:255',
            'guest_email' => 'required|email|max:255',
            'guest_phone' => 'required|string|max:50',
        ]);

        $scheduledStart = Carbon::parse($request->date . ' ' . $request->time);

        Booking::create([
            'service_id'     => $request->service_id,
            'location'       => $request->location,
            'zone_name'      => 'TBD',
            'scheduled_start'=> $scheduledStart,
            'payment_method' => 'cash',
            'status'         => 'pending',
            'guest_name'     => $request->guest_name,
            'guest_email'    => $request->guest_email,
            'guest_phone'    => $request->guest_phone,
        ]);

        return response()->json([
            'message' => "Booking submitted! We'll email you once confirmed.",
        ], 201);
    }
}
