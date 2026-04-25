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
        $services = Service::where('is_active', true)
            ->orderBy('name')
            ->get(['id', 'name', 'duration_minutes', 'price']);

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
