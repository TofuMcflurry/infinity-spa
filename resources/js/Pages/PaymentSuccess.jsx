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

// ── Waiting / fallback card — shares the frame style used elsewhere in the booking flow ──
function StatusCard({ icon: Icon, iconColor, title, message, children }) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="relative overflow-hidden rounded-3xl p-8 text-center mt-6"
            style={{ background: 'linear-gradient(135deg, #0d1528 0%, #0a0f1e 100%)', border: '1px solid rgba(226,183,100,0.2)' }}
        >
            <div className="relative z-10">
                <div className="w-16 h-16 rounded-full mx-auto mb-5 flex items-center justify-center"
                    style={{ background: `${iconColor}15` }}>
                    <Icon size={28} style={{ color: iconColor }} />
                </div>
                <h2 className="text-xl font-display font-semibold text-white mb-2">{title}</h2>
                <p className="text-sm leading-relaxed" style={{ color: '#94a3b8' }}>{message}</p>
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
                <main className="px-6 pt-10 pb-10 max-w-2xl mx-auto">

                    {phase === 'loading' && (
                        <StatusCard
                            icon={Loader2}
                            iconColor="#e2b764"
                            title="Confirming your payment…"
                            message="Stripe has your payment — we're just waiting for the confirmation to land. This usually takes a few seconds."
                        >
                            <div className="mt-5 flex items-center justify-center gap-2">
                                <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#e2b764' }} />
                                <span className="text-xs" style={{ color: '#64748b' }}>Checking status…</span>
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
