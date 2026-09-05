import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { router } from '@inertiajs/react';
import { Check, ShieldCheck, CheckCircle2, Sparkles } from 'lucide-react';

// ── Success screen ────────────────────────────────────────────────────────────
// Shared between Bookings.jsx and PaymentSuccess.jsx — same visual design,
// fed real booking data by whichever caller renders it.
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
            className="relative overflow-hidden rounded-3xl p-8 text-center mt-6"
            style={{ background: 'linear-gradient(135deg, #0d1528 0%, #0a0f1e 100%)', border: '1px solid rgba(226,183,100,0.2)' }}
        >
            {/* Ambient glow */}
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
                    <Check size={36} style={{ color: '#0b1120', strokeWidth: 3 }} />
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                    <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: '#e2b764' }}>
                        Payment Confirmed
                    </p>
                    <h2 className="text-2xl font-display font-semibold text-white mb-2">
                        You're all set!
                    </h2>
                    <p className="text-sm mb-6 leading-relaxed" style={{ color: '#94a3b8' }}>
                        Your payment went through and your booking is confirmed. We can't wait to see you.
                    </p>
                </motion.div>

                {/* Booking ref pill */}
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                    className="inline-flex items-center gap-3 px-5 py-3 rounded-2xl mb-6"
                    style={{ background: 'rgba(226,183,100,0.08)', border: '1px solid rgba(226,183,100,0.2)' }}>
                    <div className="text-left">
                        <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: '#64748b' }}>Booking Reference</p>
                        <p className="text-xl font-display font-bold" style={{ color: '#e2b764' }}>{bookingRef}</p>
                    </div>
                </motion.div>

                {/* Booking details */}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
                    className="rounded-2xl p-4 mb-6 text-left space-y-2"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="flex justify-between text-sm">
                        <span style={{ color: '#64748b' }}>Service</span>
                        <span className="font-medium text-white">{serviceName}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span style={{ color: '#64748b' }}>Therapist</span>
                        <span className="font-medium text-white">{therapistName}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span style={{ color: '#64748b' }}>Schedule</span>
                        <span className="font-medium text-white">{datetime}</span>
                    </div>
                </motion.div>

                {/* What happens next */}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
                    className="flex flex-col gap-2 mb-8">
                    {[
                        { icon: ShieldCheck, color: '#3b82f6', text: 'Payment confirmed via Stripe' },
                        { icon: CheckCircle2, color: '#10b981', text: 'Booking confirmed via notification'    },
                        { icon: Sparkles,    color: '#a855f7', text: 'Therapist assigned & on the way'       },
                    ].map((item, i) => (
                        <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                            style={{ background: 'rgba(255,255,255,0.02)' }}>
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                                style={{ background: `${item.color}15`, color: item.color }}>
                                <item.icon size={13} />
                            </div>
                            <p className="text-xs text-left" style={{ color: '#94a3b8' }}>{item.text}</p>
                        </div>
                    ))}
                </motion.div>

                {/* Redirect countdown */}
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
                    className="text-xs" style={{ color: '#475569' }}>
                    Redirecting to dashboard in <span className="text-white font-bold">{countdown}</span>s...
                </motion.p>
            </div>
        </motion.div>
    );
}
