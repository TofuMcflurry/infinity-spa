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
        if (!initialBooking?.id || !window.Echo) {
            startPolling();
            return;
        }

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