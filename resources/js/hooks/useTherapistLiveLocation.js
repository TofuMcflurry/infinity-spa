import { useEffect, useRef, useState } from 'react';

// GPS v1 — see docs/architecture/GPS-ARCHITECTURE.md §10/§11/§20. Matches the
// backend's 60s sliding Redis TTL: once this long has passed with no fresh
// broadcast, the last known position must no longer be shown as live.
export const GPS_STALE_AFTER_MS = 60_000;

// Customer-side counterpart to the therapist's useTherapistGps — this hook
// only *listens*; it never submits a location and never decides whether a
// value is valid. That stays backend-authoritative (Step 3/4).
export function useTherapistLiveLocation(booking) {
    const [location, setLocation]           = useState(null);
    const [lastUpdatedAt, setLastUpdatedAt]  = useState(null);
    const [isStale, setIsStale]              = useState(false);
    const [wsReady, setWsReady]              = useState(false);

    const channelRef       = useRef(null);
    const lastUpdatedAtRef = useRef(null);
    const staleTimerRef    = useRef(null);

    useEffect(() => {
        const isEnRoute = booking?.status === 'en_route';
        const channelName = booking?.id ? `booking.${booking.id}.location` : null;

        const reset = () => {
            if (staleTimerRef.current) {
                clearInterval(staleTimerRef.current);
                staleTimerRef.current = null;
            }
            lastUpdatedAtRef.current = null;
            setLocation(null);
            setLastUpdatedAt(null);
            setIsStale(false);
            setWsReady(false);
        };

        // Booking left en_route (arrived/cancelled/completed/rejected/etc.)
        // or there's no booking at all — unsubscribe immediately and drop
        // any location we were holding, so a stale marker can never linger.
        if (!isEnRoute || !channelName || !window.Echo) {
            if (channelRef.current) {
                window.Echo.leave(channelRef.current);
                channelRef.current = null;
            }
            reset();
            return;
        }

        try {
            channelRef.current = channelName;
            window.Echo
                .private(channelName)
                .listen('.location.updated', (e) => {
                    // Freshness is anchored to the GPS fix's own server-
                    // validated recorded_at (when the position was actually
                    // captured), not Date.now() at receipt — so reconnecting
                    // can never make an old reading look freshly "just now"
                    // just because the WebSocket happened to redeliver
                    // around the same time. Falls back to receipt time only
                    // if recorded_at is ever missing or unparseable.
                    const parsed = e?.recorded_at ? new Date(e.recorded_at).getTime() : NaN;
                    const recordedAt = Number.isFinite(parsed) ? parsed : Date.now();

                    lastUpdatedAtRef.current = recordedAt;
                    setLocation(e);
                    setLastUpdatedAt(recordedAt);
                    setIsStale(false);
                });

            const pusherConnection = window.Echo.connector?.pusher?.connection;
            if (pusherConnection) {
                setWsReady(pusherConnection.state === 'connected');
                pusherConnection.bind('connected', () => setWsReady(true));
                pusherConnection.bind('disconnected', () => setWsReady(false));
                pusherConnection.bind('failed', () => setWsReady(false));
            }
        } catch (err) {
            console.error('[useTherapistLiveLocation] Echo error', err);
        }

        // Independent of any single broadcast — periodically checks whether
        // the last received update has aged past the TTL, so a connection
        // that goes quiet (not necessarily disconnected) still goes stale.
        staleTimerRef.current = setInterval(() => {
            if (lastUpdatedAtRef.current && Date.now() - lastUpdatedAtRef.current >= GPS_STALE_AFTER_MS) {
                setIsStale(true);
            }
        }, 5_000);

        return () => {
            if (channelRef.current) {
                window.Echo.leave(channelRef.current);
                channelRef.current = null;
            }
            reset();
        };
    }, [booking?.id, booking?.status]);

    const status = booking?.status !== 'en_route'
        ? 'idle'
        : isStale
            ? 'stale'
            : !wsReady
                ? 'disconnected'
                : location
                    ? 'live'
                    : 'connecting';

    return { location, lastUpdatedAt, isStale, wsReady, status };
}
