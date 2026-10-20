import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { router } from '@inertiajs/react';
import { Check, ShieldCheck, Clock, Bell } from 'lucide-react';

// ── Success screen ────────────────────────────────────────────────────────────
// Shared between Bookings.jsx and PaymentSuccess.jsx — same visual design,
// fed real booking data by whichever caller renders it.
//
// Batch #29: previously hardcoded a fixed navy/dark card (literal hex
// colors, text-white) regardless of the Customer Portal's own light/dark
// setting — now uses the same .glass-card-strong class + --theme-* tokens
// every other customer-facing card in this app already uses, so it
// correctly renders ivory/gold in light mode and navy/gold in dark mode
// (the dark-mode values below are numerically the same as the old hardcoded
// ones, so dark mode is visually unchanged).
//
// Also corrected the lifecycle claim: this screen fires right after Stripe
// confirms payment, which is NOT the same moment the therapist accepts the
// booking (status is still 'pending' here — see MyBookings' own "Awaiting
// Therapist" state). The copy no longer says "your booking is confirmed" /
// "Therapist assigned & on the way" as settled fact; only the payment step
// is shown as done, with the therapist-acceptance step shown as pending.
export default function SuccessScreen({ bookingId, serviceName, therapistName, datetime }) {
    const [countdown, setCountdown] = useState(3);
    const bookingRef = bookingId ? `IHS-${String(bookingId).padStart(5, '0')}` : '—';

    useEffect(() => {
        const interval = setInterval(() => setCountdown(c => c - 1), 1000);
        const timeout  = setTimeout(() => router.visit(route('dashboard')), 3000);
        return () => { clearInterval(interval); clearTimeout(timeout); };
    }, []);

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="glass-card-strong relative overflow-hidden rounded-3xl p-8 text-center mt-6"
            style={{ border: '1px solid rgba(226,183,100,0.25)' }}
        >
            {/* Ambient glow — gold accent is theme-invariant by design (see
                --theme-cta in dashboard.css), left as-is for both themes. */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 rounded-full blur-3xl pointer-events-none"
                style={{ background: 'rgba(226,183,100,0.08)' }} />

            <div className="relative z-10">
                {/* Check icon */}
                <motion.div
                    initial={{ scale: 0, rotate: -20 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ delay: 0.15, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    className="w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, #b7882a, #e2b764, #f0c97a)', boxShadow: '0 0 40px rgba(226,183,100,0.3)' }}
                >
                    <Check size={36} style={{ color: 'var(--theme-cta-ink)' }} strokeWidth={3} />
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                    <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--theme-link)' }}>
                        Payment Confirmed
                    </p>
                    <h2 className="text-2xl font-display font-semibold mb-2" style={{ color: 'var(--theme-text-head)' }}>
                        Payment received!
                    </h2>
                    <p className="text-sm mb-6 leading-relaxed" style={{ color: 'var(--theme-text-muted)' }}>
                        Your payment went through. We've notified {therapistName || 'your therapist'} — you'll hear back as soon as they accept your booking.
                    </p>
                </motion.div>

                {/* Booking ref pill */}
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                    className="inline-flex items-center gap-3 px-5 py-3 rounded-2xl mb-6"
                    style={{ background: 'rgba(226,183,100,0.08)', border: '1px solid rgba(226,183,100,0.2)' }}>
                    <div className="text-left">
                        <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--theme-text-muted)' }}>Booking Reference</p>
                        <p className="text-xl font-display font-bold" style={{ color: 'var(--theme-link)' }}>{bookingRef}</p>
                    </div>
                </motion.div>

                {/* Booking details */}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
                    className="rounded-2xl p-4 mb-6 text-left space-y-2"
                    style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)' }}>
                    <div className="flex justify-between text-sm">
                        <span style={{ color: 'var(--theme-text-muted)' }}>Service</span>
                        <span className="font-medium" style={{ color: 'var(--theme-text-head)' }}>{serviceName}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span style={{ color: 'var(--theme-text-muted)' }}>Therapist</span>
                        <span className="font-medium" style={{ color: 'var(--theme-text-head)' }}>{therapistName}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span style={{ color: 'var(--theme-text-muted)' }}>Schedule</span>
                        <span className="font-medium" style={{ color: 'var(--theme-text-head)' }}>{datetime}</span>
                    </div>
                </motion.div>

                {/* What happens next — only the payment step is actually done;
                    therapist acceptance is still pending at this point, so it
                    gets a distinct "pending" treatment, not a checkmark. */}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
                    className="flex flex-col gap-2 mb-8">
                    {[
                        { icon: ShieldCheck, color: '#3b82f6', text: 'Payment confirmed via Stripe' },
                        { icon: Clock,       color: '#e2b764', text: 'Awaiting therapist confirmation' },
                        { icon: Bell,        color: '#a855f7', text: "We'll notify you the moment they accept" },
                    ].map((item, i) => (
                        <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                            style={{ background: 'var(--theme-btn-bg)' }}>
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                                style={{ background: `${item.color}15`, color: item.color }}>
                                <item.icon size={13} />
                            </div>
                            <p className="text-xs text-left" style={{ color: 'var(--theme-text-2)' }}>{item.text}</p>
                        </div>
                    ))}
                </motion.div>

                {/* Redirect countdown */}
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
                    className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>
                    Redirecting to dashboard in <span className="font-bold" style={{ color: 'var(--theme-text-head)' }}>{countdown}</span>s...
                </motion.p>
            </div>
        </motion.div>
    );
}
