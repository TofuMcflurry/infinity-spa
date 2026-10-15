<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

// GPS v1 realtime layer — see docs/architecture/GPS-ARCHITECTURE.md §11/§20.
// Mirrors BookingStatusUpdated's shape, but on its own channel
// (private-booking.{booking_id}.location, NOT booking.{booking_id}) since
// that channel's authorization is status-agnostic and used by every other
// lifecycle event — GPS access must independently require en_route.
class TherapistLocationUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public int $bookingId,
        public int $therapistId,
        public float $latitude,
        public float $longitude,
        public float $accuracyMeters,
        public string $recordedAt,
        public ?float $heading = null,
    ) {}

    public function broadcastOn(): array
    {
        return [
            new PrivateChannel("booking.{$this->bookingId}.location"),
        ];
    }

    public function broadcastAs(): string
    {
        return 'location.updated';
    }

    public function broadcastWith(): array
    {
        return [
            'booking_id'      => $this->bookingId,
            'therapist_id'    => $this->therapistId,
            'latitude'        => $this->latitude,
            'longitude'       => $this->longitude,
            'accuracy_meters' => $this->accuracyMeters,
            'recorded_at'     => $this->recordedAt,
            'heading'         => $this->heading,
        ];
    }
}
