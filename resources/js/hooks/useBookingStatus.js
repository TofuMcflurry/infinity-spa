import { useState, useEffect, useRef, useCallback } from 'react';

const POLL_INTERVAL = 20_000; // 20s fallback polling

export function useBookingStatus(initialBooking) {
    const [booking, setBooking]   = useState(initialBooking);
    const [wsReady, setWsReady]   = useState(false);
    const pollRef                 = useRef(null);
    const channelRef              = useRef(null);

    // ── Fetch latest booking status from API ──────────────────────────────
    const fetchStatus = useCallback(async () => {
        if (!initialBooking?.id) return;
        try {
            const res  = await fetch('/api/dashboard-data', {
                credentials: 'same-origin',
                headers: {
                    'Accept':           'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                },
            });
            const data = await res.json();
            if (data?.upcoming_booking) {
                setBooking(data.upcoming_booking);
            }
        } catch (err) {
            console.error('[useBookingStatus] poll error', err);
        }
    }, [initialBooking?.id]);

    // ── Start polling fallback ────────────────────────────────────────────
    const startPolling = useCallback(() => {
        if (pollRef.current) return;
        pollRef.current = setInterval(fetchStatus, POLL_INTERVAL);
    }, [fetchStatus]);

    const stopPolling = useCallback(() => {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
    }, []);

    // ── WebSocket subscription ────────────────────────────────────────────
    useEffect(() => {
        // No booking to track — nothing to subscribe to or poll for. Needed
        // now that Dashboard calls this hook unconditionally (so the
        // subscription is active even before a booking reaches en_route),
        // which means it can legitimately be called with no booking at all.
        // Without this, the branch below would start an interval here and
        // never clean it up (no booking/no Echo returned early with no
        // cleanup function registered).
        if (!initialBooking?.id) {
            stopPolling();
            return;
        }

        if (!window.Echo) {
            startPolling();
            return () => stopPolling();
        }

        // Re-sync booking to the current, complete initialBooking right
        // before (re)subscribing — without this, a hook instance whose very
        // first render saw no booking yet (e.g. Dashboard calling this
        // before data has loaded) stays permanently seeded from that first
        // render's useState(initialBooking), and every subsequent
        // .status.updated spread (`{...prev, status: e.status}`) produces an
        // object with a status but no id — which callers that guard on
        // booking?.id (e.g. Dashboard's sync effect) then silently discard.
        setBooking(initialBooking);

        const channelName = `booking.${initialBooking.id}`;

        try {
            channelRef.current = window.Echo
                .private(channelName)
                .listen('.status.updated', (e) => {
                    setBooking(prev => ({ ...prev, status: e.status }));
                });

            // Echo connected — stop polling, use WS
            window.Echo.connector.pusher.connection.bind('connected', () => {
                setWsReady(true);
                stopPolling();
            });

            // Echo disconnected — fall back to polling
            window.Echo.connector.pusher.connection.bind('disconnected', () => {
                setWsReady(false);
                startPolling();
            });

            window.Echo.connector.pusher.connection.bind('failed', () => {
                setWsReady(false);
                startPolling();
            });

        } catch (err) {
            console.error('[useBookingStatus] Echo error', err);
            startPolling();
        }

        return () => {
            stopPolling();
            if (channelRef.current) {
                window.Echo.leave(channelName);
                channelRef.current = null;
            }
        };
    }, [initialBooking?.id]);

    return { booking, wsReady };
}