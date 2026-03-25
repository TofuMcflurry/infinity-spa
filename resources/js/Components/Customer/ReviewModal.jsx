import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, X, Loader2, Check, Clock, MessageSquare } from 'lucide-react';

// ── API helper ────────────────────────────────────────────────────────────────
function getCsrf() {
    const cookie = document.cookie.split('; ').find(r => r.startsWith('XSRF-TOKEN='));
    return cookie ? decodeURIComponent(cookie.split('=')[1]) : '';
}

async function apiFetch(url, options = {}) {
    const res = await fetch(url, {
        ...options,
        credentials: 'same-origin',
        headers: {
            'Accept':           'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-XSRF-TOKEN':     getCsrf(),
            ...(options.headers ?? {}),
        },
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? `HTTP ${res.status}`);
    }
    return res.json();
}

// ── Star Rating Input ─────────────────────────────────────────────────────────
function StarInput({ value, onChange, disabled = false }) {
    const [hovered, setHovered] = useState(0);

    const labels = {
        1: 'Poor',
        2: 'Fair',
        3: 'Good',
        4: 'Very Good',
        5: 'Excellent',
    };

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map(star => {
                    const filled = star <= (hovered || value);
                    return (
                        <button
                            key={star}
                            type="button"
                            disabled={disabled}
                            onClick={() => !disabled && onChange(star)}
                            onMouseEnter={() => !disabled && setHovered(star)}
                            onMouseLeave={() => !disabled && setHovered(0)}
                            className="transition-all duration-100 disabled:cursor-not-allowed"
                            style={{ transform: filled ? 'scale(1.15)' : 'scale(1)' }}
                        >
                            <Star
                                size={28}
                                style={{
                                    color: filled ? '#e2b764' : '#1e2740',
                                    fill:  filled ? '#e2b764' : 'transparent',
                                    transition: 'all 0.1s',
                                }}
                            />
                        </button>
                    );
                })}
            </div>
            {/* Label */}
            <AnimatePresence mode="wait">
                {(hovered || value) > 0 && (
                    <motion.p
                        key={hovered || value}
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="text-xs font-semibold"
                        style={{ color: '#e2b764' }}
                    >
                        {labels[hovered || value]}
                    </motion.p>
                )}
            </AnimatePresence>
        </div>
    );
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function ReviewModal({ bookingId, onClose, onSubmitted }) {
    const [eligibility,      setEligibility]      = useState(null);
    const [loadingCheck,     setLoadingCheck]      = useState(true);
    const [serviceRating,    setServiceRating]     = useState(0);
    const [therapistRating,  setTherapistRating]   = useState(0);
    const [comment,          setComment]           = useState('');
    const [submitting,       setSubmitting]        = useState(false);
    const [submitted,        setSubmitted]         = useState(false);
    const [error,            setError]             = useState(null);

    // ── Check eligibility on mount ────────────────────────────────────────────
    useEffect(() => {
        apiFetch(`/api/reviews/check?booking_id=${bookingId}`)
            .then(data => {
                if (!data.eligible) {
                    onClose?.();
                    return;
                }
                setEligibility(data);
            })
            .catch(() => onClose?.())
            .finally(() => setLoadingCheck(false));
    }, [bookingId]);

    // ── Submit review ─────────────────────────────────────────────────────────
    const handleSubmit = async () => {
        if (submitting) return;

        // At least one rating required
        if (
            (eligibility.can_service_rate   && serviceRating   === 0) ||
            (eligibility.can_therapist_rate && therapistRating === 0)
        ) {
            setError('Please provide a rating before submitting.');
            return;
        }

        setSubmitting(true);
        setError(null);

        try {
            await apiFetch('/api/reviews', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({
                    booking_id:       bookingId,
                    service_rating:   eligibility.can_service_rate   ? serviceRating   : null,
                    therapist_rating: eligibility.can_therapist_rate ? therapistRating : null,
                    comment:          comment.trim() || null,
                }),
            });

            setSubmitted(true);
            setTimeout(() => {
                onSubmitted?.();
                onClose?.();
            }, 2000);
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    // ── Loading ───────────────────────────────────────────────────────────────
    if (loadingCheck) return null;
    if (!eligibility) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 backdrop-blur-sm"
                style={{ background: 'rgba(0,0,0,0.7)' }}
                onClick={() => !submitting && onClose?.()}
            />

            {/* Modal */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1,    y: 0  }}
                exit={{ opacity: 0,  scale: 0.95, y: 20  }}
                className="relative w-full max-w-md rounded-2xl shadow-2xl z-10 overflow-hidden"
                style={{ background: '#0f1629', border: '1px solid #1e2740' }}
            >
                {/* ── Success state ── */}
                {submitted ? (
                    <div className="p-8 flex flex-col items-center justify-center text-center gap-4">
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: 'spring', stiffness: 200 }}
                            className="w-16 h-16 rounded-full flex items-center justify-center"
                            style={{ background: 'linear-gradient(135deg, #b7882a, #e2b764)' }}
                        >
                            <Check size={28} style={{ color: '#0b1120' }} />
                        </motion.div>
                        <div>
                            <h3 className="font-display font-bold text-lg text-white mb-1">
                                Thank you!
                            </h3>
                            <p className="text-sm" style={{ color: '#94a3b8' }}>
                                Your review has been submitted.
                            </p>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* ── Header ── */}
                        <div className="flex items-center justify-between p-5 border-b"
                            style={{ borderColor: '#1e2740' }}>
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                                    style={{ background: 'linear-gradient(135deg, #b7882a, #e2b764)' }}>
                                    <Star size={16} style={{ color: '#0b1120', fill: '#0b1120' }} />
                                </div>
                                <h3 className="font-display font-bold text-base text-white">
                                    Rate Your Experience
                                </h3>
                            </div>
                            <button
                                onClick={() => !submitting && onClose?.()}
                                className="p-1.5 rounded-lg transition-colors"
                                style={{ color: '#64748b' }}
                                onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                                onMouseLeave={e => e.currentTarget.style.color = '#64748b'}
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {/* ── Booking info ── */}
                        <div className="px-5 pt-4 pb-3">
                            <div className="p-3.5 rounded-xl"
                                style={{ background: '#141d33', border: '1px solid #1e2740' }}>
                                <p className="text-sm font-semibold text-white">
                                    {eligibility.booking.service}
                                </p>
                                <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>
                                    {eligibility.booking.therapist} • {eligibility.booking.date} • {eligibility.booking.time}
                                </p>
                            </div>
                        </div>

                        {/* ── Ratings ── */}
                        <div className="px-5 py-3 space-y-5">

                            {/* Service rating */}
                            {eligibility.can_service_rate && (
                                <div>
                                    <div className="flex items-center gap-2 mb-3">
                                        <div className="w-1.5 h-1.5 rounded-full"
                                            style={{ background: '#e2b764' }} />
                                        <p className="text-sm font-medium text-white">
                                            How was the service?
                                        </p>
                                    </div>
                                    <p className="text-xs mb-2.5" style={{ color: '#64748b' }}>
                                        {eligibility.booking.service_group}
                                    </p>
                                    <StarInput
                                        value={serviceRating}
                                        onChange={setServiceRating}
                                    />
                                </div>
                            )}

                            {/* Divider */}
                            {eligibility.can_service_rate && eligibility.can_therapist_rate && (
                                <div className="border-t" style={{ borderColor: '#1e2740' }} />
                            )}

                            {/* Therapist rating */}
                            {eligibility.can_therapist_rate && (
                                <div>
                                    <div className="flex items-center gap-2 mb-3">
                                        <div className="w-1.5 h-1.5 rounded-full"
                                            style={{ background: '#e2b764' }} />
                                        <p className="text-sm font-medium text-white">
                                            How was your therapist?
                                        </p>
                                    </div>
                                    <p className="text-xs mb-2.5" style={{ color: '#64748b' }}>
                                        {eligibility.booking.therapist}
                                    </p>
                                    <StarInput
                                        value={therapistRating}
                                        onChange={setTherapistRating}
                                    />
                                </div>
                            )}

                            {/* Comment */}
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <MessageSquare size={13} style={{ color: '#64748b' }} />
                                    <p className="text-xs" style={{ color: '#64748b' }}>
                                        Leave a comment (optional)
                                    </p>
                                </div>
                                <textarea
                                    value={comment}
                                    onChange={e => setComment(e.target.value)}
                                    placeholder="Share your experience..."
                                    rows={3}
                                    maxLength={500}
                                    className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none resize-none transition-colors"
                                    style={{
                                        background:   '#141d33',
                                        border:       '1px solid #1e2740',
                                        color:        '#e2e8f0',
                                    }}
                                    onFocus={e => e.target.style.borderColor = '#e2b764'}
                                    onBlur={e  => e.target.style.borderColor = '#1e2740'}
                                />
                                <p className="text-[10px] text-right mt-1"
                                    style={{ color: '#64748b' }}>
                                    {comment.length}/500
                                </p>
                            </div>

                            {/* Hours remaining */}
                            <div className="flex items-center gap-1.5 text-xs"
                                style={{ color: '#64748b' }}>
                                <Clock size={12} />
                                <span>
                                    {Math.floor(eligibility.hours_remaining)} hours remaining to review
                                </span>
                            </div>

                            {/* Error */}
                            {error && (
                                <p className="text-xs px-3 py-2 rounded-lg"
                                    style={{ background: 'rgba(248,113,113,0.1)', color: '#f87171' }}>
                                    {error}
                                </p>
                            )}
                        </div>

                        {/* ── Actions ── */}
                        <div className="flex items-center gap-3 px-5 py-4 border-t"
                            style={{ borderColor: '#1e2740' }}>
                            <button
                                onClick={() => !submitting && onClose?.()}
                                disabled={submitting}
                                className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors"
                                style={{
                                    background: '#141d33',
                                    color:      '#94a3b8',
                                    border:     '1px solid #1e2740',
                                }}
                            >
                                Skip for now
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={submitting}
                                className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                style={{
                                    background: 'linear-gradient(135deg, #b7882a, #e2b764)',
                                    color:      '#0b1120',
                                }}
                            >
                                {submitting
                                    ? <><Loader2 size={14} className="animate-spin" /> Submitting...</>
                                    : <><Star size={14} /> Submit Review</>
                                }
                            </button>
                        </div>
                    </>
                )}
            </motion.div>
        </div>
    );
}