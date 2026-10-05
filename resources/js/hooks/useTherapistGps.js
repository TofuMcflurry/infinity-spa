import { useEffect, useRef, useState } from 'react';

// GPS v1 — see docs/architecture/GPS-ARCHITECTURE.md §9/§11/§19 and §20's
// locked 10–30s update-cadence target. This is the ONLY configurable
// constant governing send frequency — watchPosition() itself may fire far
// more often than this; see handleSuccess below for the throttle.
export const GPS_SEND_INTERVAL_MS = 15_000;

const STATUS_MESSAGES = {
    idle:        '',
    starting:    'Live location is active',
    active:      'Live location is active',
    denied:      'Location access is disabled. Enable location permission to share your live location.',
    unavailable: 'Your current location is unavailable.',
    unsupported: "Live location isn't supported on this browser.",
    timeout:     'Waiting for a location signal…',
};

function getCsrf() {
    const cookie = document.cookie.split('; ').find(r => r.startsWith('XSRF-TOKEN='));
    return cookie ? decodeURIComponent(cookie.split('=')[1]) : '';
}

async function postLocation(bookingId, payload) {
    const res = await fetch(`/therapist/api/bookings/${bookingId}/location`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
            'Content-Type':     'application/json',
            'Accept':           'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-XSRF-TOKEN':     getCsrf(),
        },
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

// Captures the therapist's browser location via navigator.geolocation and
// POSTs it to the existing GPS ingestion endpoint while — and only while —
// `booking.status === 'en_route'`. The backend remains authoritative for
// ownership/status/accuracy/timestamp/speed validation and Redis storage;
// this hook only decides WHEN to send, never whether a value is "valid".
export function useTherapistGps(booking) {
    const [status, setStatus] = useState('idle');

    const watchIdRef       = useRef(null);
    const trackedBookingRef = useRef(null);
    const lastSentAtRef    = useRef(null);
    const sendingRef       = useRef(false);

    useEffect(() => {
        const isEnRoute = booking?.status === 'en_route';

        // Status is no longer en_route (arrived/cancelled/completed/rejected/
        // anything else) or there's no active booking — stop immediately.
        if (!isEnRoute || !booking?.id) {
            if (watchIdRef.current !== null) {
                navigator.geolocation?.clearWatch(watchIdRef.current);
            }
            watchIdRef.current = null;
            trackedBookingRef.current = null;
            lastSentAtRef.current = null;
            setStatus('idle');
            return;
        }

        // Duplicate-watcher guard: already tracking this exact booking.
        if (watchIdRef.current !== null && trackedBookingRef.current === booking.id) {
            return;
        }

        if (!('geolocation' in navigator)) {
            setStatus('unsupported');
            return;
        }

        // Defensive: clear any previous watcher before starting a new one.
        if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
        }

        trackedBookingRef.current = booking.id;
        lastSentAtRef.current = null;
        setStatus('starting');

        const handleSuccess = (position) => {
            setStatus('active');

            const now = Date.now();
            const isFirstPosition = lastSentAtRef.current === null;
            const intervalElapsed = !isFirstPosition && (now - lastSentAtRef.current) >= GPS_SEND_INTERVAL_MS;

            // Only send on the first valid position, or once the configured
            // interval has elapsed since the last SUCCESSFUL send — never on
            // every watchPosition() callback.
            if (!isFirstPosition && !intervalElapsed) return;
            if (sendingRef.current) return;

            const { latitude, longitude, accuracy, heading } = position.coords;

            sendingRef.current = true;
            postLocation(booking.id, {
                booking_id:      booking.id,
                latitude,
                longitude,
                accuracy_meters: accuracy,
                recorded_at:     new Date(position.timestamp).toISOString(),
                heading:         typeof heading === 'number' && !Number.isNaN(heading) ? heading : null,
            })
                .then(() => {
                    lastSentAtRef.current = Date.now();
                })
                .catch((err) => {
                    // Never crash the page and never stop the watcher on a
                    // failed send — leave lastSentAtRef untouched so the
                    // next valid position is still eligible to try again.
                    console.error('[useTherapistGps] location update failed', err);
                })
                .finally(() => {
                    sendingRef.current = false;
                });
        };

        const handleError = (err) => {
            switch (err.code) {
                case err.PERMISSION_DENIED:
                    setStatus('denied');
                    if (watchIdRef.current !== null) {
                        navigator.geolocation.clearWatch(watchIdRef.current);
                        watchIdRef.current = null;
                    }
                    break;
                case err.TIMEOUT:
                    setStatus('timeout');
                    break;
                case err.POSITION_UNAVAILABLE:
                default:
                    setStatus('unavailable');
                    break;
            }
        };

        watchIdRef.current = navigator.geolocation.watchPosition(handleSuccess, handleError, {
            enableHighAccuracy: true,
            maximumAge:         10_000,
            timeout:            20_000,
        });

        return () => {
            if (watchIdRef.current !== null) {
                navigator.geolocation.clearWatch(watchIdRef.current);
            }
            watchIdRef.current = null;
            trackedBookingRef.current = null;
            lastSentAtRef.current = null;
        };
    }, [booking?.id, booking?.status]);

    return {
        status,
        message:    STATUS_MESSAGES[status] ?? '',
        isTracking: status === 'starting' || status === 'active',
        permissionDenied: status === 'denied',
    };
}
