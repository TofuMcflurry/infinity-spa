import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import AuthenticatedLayout from '@/Layouts/CustomerLayout';
import SuccessScreen from '@/Components/SuccessScreen';
import { Loader2, AlertCircle, Clock } from 'lucide-react';

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS  = 15000;

async function apiFetch(url) {
    const res = await fetch(url, {
        headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'same-origin',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

// ── Waiting / fallback card — shares the frame style used elsewhere in the
// booking flow (Batch #29: now .glass-card-strong + --theme-* tokens
// instead of a hardcoded navy gradient, so it respects the customer's own
// light/dark setting like SuccessScreen does — see that component's
// docblock for the full reasoning). ──
function StatusCard({ icon: Icon, iconColor, title, message, children }) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="glass-card-strong relative overflow-hidden rounded-3xl p-8 text-center mt-6"
            style={{ border: '1px solid rgba(226,183,100,0.25)' }}
        >
            <div className="relative z-10">
                <div className="w-16 h-16 rounded-full mx-auto mb-5 flex items-center justify-center"
                    style={{ background: `${iconColor}15` }}>
                    <Icon size={28} style={{ color: iconColor }} />
                </div>
                <h2 className="text-xl font-display font-semibold mb-2" style={{ color: 'var(--theme-text-head)' }}>{title}</h2>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--theme-text-muted)' }}>{message}</p>
                {children}
            </div>
        </motion.div>
    );
}

export default function PaymentSuccess() {
    const params     = new URLSearchParams(window.location.search);
    const bookingId  = params.get('booking_id');
    const sessionId  = params.get('session_id');

    // 'loading' | 'confirmed' | 'timeout' | 'error'
    const [phase, setPhase]     = useState('loading');
    const [booking, setBooking] = useState(null);
    const [error, setError]     = useState(null);
    const cancelledRef = useRef(false);

    useEffect(() => {
        if (!bookingId) {
            setPhase('error');
            setError('Missing booking reference in the URL.');
            return;
        }

        cancelledRef.current = false;
        const startedAt = Date.now();

        const poll = async () => {
            try {
                const data = await apiFetch(`/api/bookings/${bookingId}/payment-status`);
                if (cancelledRef.current) return;

                setBooking(data);

                if (data.payment_status === 'paid') {
                    setPhase('confirmed');
                    return;
                }

                if (Date.now() - startedAt >= POLL_TIMEOUT_MS) {
                    setPhase('timeout');
                    return;
                }

                setTimeout(poll, POLL_INTERVAL_MS);
            } catch (err) {
                if (cancelledRef.current) return;
                setError(err.message);
                setPhase('error');
            }
        };

        poll();
        return () => { cancelledRef.current = true; };
    }, [bookingId]);

    return (
        <AuthenticatedLayout>
            <div className="min-h-screen bg-background">
                {/* Batch #29: explicit safe-area-aware bottom clearance on
                    top of CustomerLayout's own generic reservation — this
                    page's content is short (a single centered card, unlike
                    e.g. MyBookings' naturally long scroll), so on shorter
                    iPhone viewports the card's last lines could otherwise
                    sit right at the fixed BottomNav's covered zone. */}
                <main className="px-6 pt-10 pb-[calc(2.5rem+76px+env(safe-area-inset-bottom))] max-w-2xl mx-auto">

                    {phase === 'loading' && (
                        <StatusCard
                            icon={Loader2}
                            iconColor="#e2b764"
                            title="Confirming your payment…"
                            message="Stripe has your payment — we're just waiting for the confirmation to land. This usually takes a few seconds."
                        >
                            <div className="mt-5 flex items-center justify-center gap-2">
                                <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#e2b764' }} />
                                <span className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>Checking status…</span>
                            </div>
                        </StatusCard>
                    )}

                    {phase === 'confirmed' && booking && (
                        <SuccessScreen
                            bookingId={booking.id}
                            serviceName={booking.service_name}
                            therapistName={booking.therapist_name}
                            datetime={`${booking.date_formatted} · ${booking.time_formatted}`}
                        />
                    )}

                    {phase === 'timeout' && (
                        <StatusCard
                            icon={Clock}
                            iconColor="#e2b764"
                            title="Almost there"
                            message="Your payment is still being confirmed on our end — this can happen if Stripe is running a little behind. We'll notify you as soon as it's done, no need to try again."
                        >
                            <a href={route('my.bookings')}
                                className="btn-gold inline-flex items-center gap-2 mt-6">
                                View my bookings
                            </a>
                        </StatusCard>
                    )}

                    {phase === 'error' && (
                        <StatusCard
                            icon={AlertCircle}
                            iconColor="#ef4444"
                            title="Couldn't check payment status"
                            message={error ?? 'Something went wrong while confirming your payment.'}
                        >
                            <a href={route('my.bookings')}
                                className="btn-gold inline-flex items-center gap-2 mt-6">
                                View my bookings
                            </a>
                        </StatusCard>
                    )}

                </main>
            </div>
        </AuthenticatedLayout>
    );
}
