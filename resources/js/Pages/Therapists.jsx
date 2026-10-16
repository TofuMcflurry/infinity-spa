import AuthenticatedLayout from '@/Layouts/CustomerLayout';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { router } from '@inertiajs/react';
import {
    Star, MapPin, Clock, Sparkles,
    Loader2, Users, X, Calendar, Shield
} from 'lucide-react';

// ── API helper ────────────────────────────────────────────────────────────────
async function apiFetch(url) {
    const res = await fetch(url, {
        headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'same-origin',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

// ── Star Display ──────────────────────────────────────────────────────────────
function StarDisplay({ rating, reviewCount, size = 12 }) {
    const MIN_DISPLAY_RATING = 3.5;
    const actualStars = Number(rating) || 0;
    const hasRating = actualStars > 0 && reviewCount > 0;
    
    // SYSTEM RULE: Minimum display rating is 3.5 stars
    const displayStars = hasRating 
        ? Math.max(MIN_DISPLAY_RATING, actualStars)
        : MIN_DISPLAY_RATING;
    
    // Check if should show "New" badge (no reviews)
    if (!hasRating) {
        return (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(226,183,100,0.15)', color: 'var(--theme-link)' }}>
                ✨ New
            </span>
        );
    }

    // Optional: You can still pass actual rating to admin via data attribute
    // Or just show the display rating to customers
    const needsAdminFlag = actualStars <= 3.5;

    return (
        <div className="flex items-center gap-1">
            <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map(s => (
                    <Star key={s} size={size}
                        style={{
                            color: s <= Math.round(displayStars) ? '#e2b764' : 'var(--theme-border)',
                            fill:  s <= Math.round(displayStars) ? '#e2b764' : 'transparent',
                        }}
                    />
                ))}
            </div>
            <span className="text-xs font-bold" style={{ color: 'var(--theme-link)' }}>
                {displayStars.toFixed(1)}
            </span>
            {reviewCount > 0 && (
                <span className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>
                    ({reviewCount})
                </span>
            )}
            {/* Optional: Hidden badge for admin (only visible to admins) */}
            {needsAdminFlag && window.userRole === 'admin' && (
                <span className="text-[8px] ml-1 px-1 py-0.5 rounded" style={{ background: '#ef444420', color: '#ef4444' }}>
                    ⚠️ Actual: {actualStars.toFixed(1)}
                </span>
            )}
        </div>
    );
}

// ── Therapist Modal ───────────────────────────────────────────────────────────
function TherapistModal({ therapist, onClose }) {
    const initials = therapist.name
        .split(' ')
        .map(w => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 backdrop-blur-sm"
                style={{ background: 'rgba(0,0,0,0.7)' }}
                onClick={onClose}
            />

            {/* Modal */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1,    y: 0  }}
                exit={{ opacity: 0,  scale: 0.95, y: 20  }}
                className="relative w-full max-w-md rounded-2xl shadow-2xl z-10 overflow-hidden"
                style={{ background: 'var(--theme-card)', border: '1px solid var(--theme-border)' }}
            >
                {/* ── Modal Header ── */}
                <div className="flex items-start gap-4 p-5 border-b"
                    style={{ borderColor: 'var(--theme-border)', background: 'linear-gradient(135deg, var(--theme-btn-bg) 0%, var(--theme-bg) 100%)' }}>

                    {/* Avatar */}
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-lg font-display font-black flex-shrink-0"
                        style={{
                            background: 'linear-gradient(135deg, #b7882a 0%, #e2b764 50%, #f0c97a 100%)',
                            color: 'var(--theme-cta-ink)',
                            boxShadow: '0 8px 24px rgba(226,183,100,0.25)',
                        }}>
                        {initials}
                    </div>

                    <div className="flex-1 min-w-0">
                        <h3 className="font-display font-bold text-lg leading-tight" style={{ color: 'var(--theme-text-head)' }}>
                            {therapist.name}
                        </h3>
                        <p className="text-sm font-medium mb-2" style={{ color: 'var(--theme-link)' }}>
                            {therapist.specialty}
                        </p>
                        <StarDisplay
                            rating={therapist.rating}
                            reviewCount={therapist.review_count ?? 0}
                            size={13}
                        />
                    </div>

                    {/* Close */}
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg transition-colors flex-shrink-0"
                        style={{ color: 'var(--theme-text-muted)' }}
                        onMouseEnter={e => e.currentTarget.style.color = 'var(--theme-text-head)'}
                        onMouseLeave={e => e.currentTarget.style.color = 'var(--theme-text-muted)'}
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* ── Modal Body ── */}
                <div className="p-5 space-y-4">

                    {/* Bio */}
                    {therapist.bio && (
                        <p className="text-sm leading-relaxed" style={{ color: 'var(--theme-text-2)' }}>
                            {therapist.bio}
                        </p>
                    )}

                    {/* Divider */}
                    <div className="border-t" style={{ borderColor: 'var(--theme-border)' }} />

                    {/* Details grid */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 rounded-xl" style={{ background: 'var(--theme-btn-bg)' }}>
                            <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--theme-text-muted)' }}>
                                Experience
                            </p>
                            <p className="text-sm font-semibold" style={{ color: 'var(--theme-text-head)' }}>
                                {therapist.experience_years > 0
                                    ? `${therapist.experience_years} years`
                                    : 'New therapist'}
                            </p>
                        </div>

                        <div className="p-3 rounded-xl" style={{ background: 'var(--theme-btn-bg)' }}>
                            <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--theme-text-muted)' }}>
                                Gender
                            </p>
                            <p className="text-sm font-semibold" style={{ color: 'var(--theme-text-head)' }}>
                                {therapist.gender === 'female' ? '♀ Female' : '♂ Male'}
                            </p>
                        </div>

                        <div className="p-3 rounded-xl" style={{ background: 'var(--theme-btn-bg)' }}>
                            <div className="flex items-center gap-1.5 mb-1">
                                <Calendar size={10} style={{ color: 'var(--theme-text-muted)' }} />
                                <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--theme-text-muted)' }}>
                                    Day Off
                                </p>
                            </div>
                            <p className="text-sm font-semibold" style={{ color: 'var(--theme-text-head)' }}>
                                {therapist.day_off}
                            </p>
                        </div>

                        <div className="p-3 rounded-xl" style={{ background: 'var(--theme-btn-bg)' }}>
                            <div className="flex items-center gap-1.5 mb-1">
                                <Clock size={10} style={{ color: 'var(--theme-text-muted)' }} />
                                <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--theme-text-muted)' }}>
                                    Shift
                                </p>
                            </div>
                            <p className="text-sm font-semibold" style={{ color: 'var(--theme-text-head)' }}>
                                4:00 PM – 4:00 AM
                            </p>
                        </div>
                    </div>

                    {/* Service Areas */}
                    {therapist.zones?.length > 0 && (
                        <div>
                            <div className="flex items-center gap-1.5 mb-2">
                                <MapPin size={12} style={{ color: 'var(--theme-text-muted)' }} />
                                <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--theme-text-muted)' }}>
                                    Service Areas
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {therapist.zones.map(zone => (
                                    <span key={zone}
                                        className="text-[11px] px-2.5 py-1 rounded-lg font-medium"
                                        style={{
                                            background: 'rgba(226,183,100,0.08)',
                                            color:      'var(--theme-link)',
                                            border:     '1px solid rgba(226,183,100,0.15)',
                                        }}>
                                        {zone}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Modal Footer ── */}
                <div className="px-5 pb-5">
                    <button
                        onClick={() => { onClose(); router.visit(route('bookings')); }}
                        className="w-full py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2"
                        style={{
                            background: 'linear-gradient(135deg, #b7882a, #e2b764)',
                            color:      'var(--theme-cta-ink)',
                            boxShadow:  '0 4px 15px rgba(226,183,100,0.25)',
                        }}
                        onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 20px rgba(226,183,100,0.4)'}
                        onMouseLeave={e => e.currentTarget.style.boxShadow = '0 4px 15px rgba(226,183,100,0.25)'}
                    >
                        <Sparkles size={15} />
                        Book with {therapist.name.split(' ')[0]}
                    </button>
                </div>
            </motion.div>
        </div>
    );
}

// ── Compact Therapist Card ────────────────────────────────────────────────────
function TherapistCard({ therapist, index, onClick }) {
    const initials = therapist.name
        .split(' ')
        .map(w => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();

    return (
        <motion.button
            layout
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.25, delay: index * 0.05 }}
            onClick={onClick}
            className="w-full text-left rounded-2xl border p-4 transition-all group"
            style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-card)' }}
            onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'rgba(226,183,100,0.3)';
                e.currentTarget.style.background  = 'var(--theme-btn-bg)';
            }}
            onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--theme-border)';
                e.currentTarget.style.background  = 'var(--theme-card)';
            }}
        >
            {/* Avatar */}
            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-base font-display font-black mb-3 transition-transform group-hover:scale-105"
                style={{
                    background: 'linear-gradient(135deg, #b7882a 0%, #e2b764 50%, #f0c97a 100%)',
                    color:      'var(--theme-cta-ink)',
                    boxShadow:  '0 4px 12px rgba(226,183,100,0.2)',
                }}>
                {initials}
            </div>

            {/* Name */}
            <h3 className="font-display font-bold text-sm leading-tight mb-0.5 truncate" style={{ color: 'var(--theme-text-head)' }}>
                {therapist.name}
            </h3>

            {/* Specialty */}
            <p className="text-[11px] mb-2 truncate" style={{ color: 'var(--theme-link)' }}>
                {therapist.specialty}
            </p>

            {/* Rating */}
            <StarDisplay
                rating={therapist.rating}
                reviewCount={therapist.review_count ?? 0}
            />

            {/* Experience */}
            <p className="text-[11px] mt-2" style={{ color: 'var(--theme-text-muted)' }}>
                {therapist.experience_years > 0
                    ? `${therapist.experience_years} yrs experience`
                    : 'New therapist'}
            </p>

            {/* Tap hint */}
            <p className="text-[10px] mt-2 opacity-0 group-hover:opacity-100 transition-opacity font-medium"
                style={{ color: 'var(--theme-link)' }}>
                Tap to view details →
            </p>
        </motion.button>
    );
}

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────
export default function Therapists() {
    const [therapists,      setTherapists]      = useState([]);
    const [loading,         setLoading]         = useState(true);
    const [error,           setError]           = useState(null);
    const [genderFilter,    setGenderFilter]    = useState('all');
    const [selectedTherapist, setSelectedTherapist] = useState(null);

    useEffect(() => {
        apiFetch('/api/therapists')
            .then(setTherapists)
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }, []);

    const filtered = genderFilter === 'all'
        ? therapists
        : therapists.filter(t => t.gender === genderFilter);

    const FILTERS = [
        { key: 'all',    label: 'All'      },
        { key: 'female', label: '♀ Female' },
        { key: 'male',   label: '♂ Male'   },
    ];

    return (
        <AuthenticatedLayout>
            <div className="min-h-screen" style={{ background: 'var(--theme-bg)', color: 'var(--theme-text)' }}>

                {/* ── Header ── */}
                <header className="sticky top-0 z-30 border-b backdrop-blur-xl"
                    style={{ background: 'var(--theme-header-bg)', borderColor: 'var(--theme-border)' }}>
                    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
                        <div className="flex items-end justify-between gap-4">
                            <div>
                                <motion.h1
                                    initial={{ opacity: 0, y: -8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="font-display text-xl font-bold"
                                    style={{ color: 'var(--theme-text-head)' }}
                                >
                                    Our Therapists
                                </motion.h1>
                                <p className="text-xs mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>
                                    Tap a card to view full profile
                                </p>
                            </div>

                            {!loading && (
                                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium flex-shrink-0"
                                    style={{ background: 'var(--theme-btn-bg)', color: 'var(--theme-text-2)', border: '1px solid var(--theme-border)' }}>
                                    <Users size={12} />
                                    {filtered.length} therapist{filtered.length !== 1 ? 's' : ''}
                                </div>
                            )}
                        </div>
                    </div>
                </header>

                <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

                    {/* ── Gender Filter ── */}
                    <div className="flex gap-2 mb-6">
                        {FILTERS.map(f => {
                            const isActive = genderFilter === f.key;
                            return (
                                <button
                                    key={f.key}
                                    onClick={() => setGenderFilter(f.key)}
                                    className="px-4 py-2 rounded-full text-sm font-medium transition-all flex-shrink-0"
                                    style={{
                                        background: isActive
                                            ? 'linear-gradient(135deg, #b7882a, #e2b764)'
                                            : 'var(--theme-btn-bg)',
                                        color:  isActive ? 'var(--theme-cta-ink)' : 'var(--theme-text-2)',
                                        border: isActive ? 'none' : '1px solid var(--theme-border)',
                                    }}
                                >
                                    {f.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* ── Content ── */}
                    {loading ? (
                        <div className="flex items-center justify-center py-24">
                            <Loader2 className="w-7 h-7 animate-spin" style={{ color: 'var(--theme-cta)' }} />
                        </div>
                    ) : error ? (
                        <div className="flex items-center justify-center py-24">
                            <p className="text-sm text-destructive">{error}</p>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-24 gap-3">
                            <Users size={32} style={{ color: 'var(--theme-border)' }} />
                            <p className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>No therapists found.</p>
                        </div>
                    ) : (
                        <motion.div
                            layout
                            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3"
                        >
                            <AnimatePresence mode="popLayout">
                                {filtered.map((therapist, i) => (
                                    <TherapistCard
                                        key={therapist.id}
                                        therapist={therapist}
                                        index={i}
                                        onClick={() => setSelectedTherapist(therapist)}
                                    />
                                ))}
                            </AnimatePresence>
                        </motion.div>
                    )}
                </main>

                {/* ── Therapist Modal ── */}
                <AnimatePresence>
                    {selectedTherapist && (
                        <TherapistModal
                            therapist={selectedTherapist}
                            onClose={() => setSelectedTherapist(null)}
                        />
                    )}
                </AnimatePresence>

            </div>
        </AuthenticatedLayout>
    );
}