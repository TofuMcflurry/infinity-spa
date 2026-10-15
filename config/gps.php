<?php

// GPS v1 locked defaults — see docs/architecture/GPS-ARCHITECTURE.md §20
// "Locked Implementation Defaults". These are the named configurable
// constants the ADR requires for the accuracy/speed thresholds and the
// Redis TTL, so they can be tuned later without a code change.

return [

    // Reject any location update with accuracy_meters above this.
    'max_accuracy_meters' => env('GPS_MAX_ACCURACY_METERS', 100),

    // Reject a location update if the implied travel speed from the
    // previous valid location exceeds this (km/h).
    'max_speed_kmh' => env('GPS_MAX_SPEED_KMH', 160),

    // Sliding TTL (seconds) for the latest-location Redis/Valkey entry.
    'location_ttl_seconds' => env('GPS_LOCATION_TTL_SECONDS', 60),

];
