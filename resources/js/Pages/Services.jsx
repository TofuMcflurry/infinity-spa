import AuthenticatedLayout from '@/Layouts/CustomerLayout';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { router } from '@inertiajs/react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Clock, Star, ChevronRight, Loader2, Sparkles, Heart, AlertCircle } from 'lucide-react';

// ── API helpers ───────────────────────────────────────────────────────────────
function getCsrf() {
    const cookie = document.cookie.split('; ').find(r => r.startsWith('XSRF-TOKEN='));
    return cookie ? decodeURIComponent(cookie.split('=')[1]) : '';
}

async function apiFetch(url) {
    const res = await fetch(url, {
        headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'same-origin',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

async function apiWrite(url, method, body) {
    const res = await fetch(url, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-XSRF-TOKEN': getCsrf(),
        },
        credentials: 'same-origin',
        body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 401 || res.status === 419) {
            throw new Error('Your session has expired. Please log in again.');
        }
        throw new Error(data.message || 'Something went wrong. Please try again.');
    }

    return res.status === 204 ? null : res.json();
}

// ── Category config ───────────────────────────────────────────────────────────
const CATEGORIES = [
    { key: 'all',         label: 'All Services',  label_ar: 'كل الخدمات'    },
    { key: 'massage',     label: 'Massage',       label_ar: 'مساج'           },
    { key: 'homeRituals', label: 'Body Rituals',  label_ar: 'طقوس الجسم'    },
];

// ── Service Group Card ────────────────────────────────────────────────────────
function ServiceGroupCard({ group, locale, onBook, index, serviceId, isWishlisted, isTogglingWishlist, onToggleWishlist }) {
    const [selectedDuration, setSelectedDuration] = useState(null);

    const groupLabel = locale === 'ar' ? group.group_name_ar : group.group_name;
    const minPrice   = Math.min(...group.durations.map(d => Number(d.price)));
    const hasRating  = group.durations.some(d => Number(d.rating) > 0);
    const avgRating  = hasRating
        ? (group.durations.reduce((sum, d) => sum + Number(d.rating), 0) / group.durations.length).toFixed(1)
        : null;

    const handleWishlistClick = (e) => {
        e.stopPropagation();
        if (isTogglingWishlist || !serviceId) return;
        onToggleWishlist(serviceId);
    };

    const handleBook = () => {
        // Pass selected service to booking page
        router.visit(route('bookings'));
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.08 }}
            className="rounded-2xl border overflow-hidden transition-all"
            style={{ borderColor: '#1e2740', background: '#0f1629' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#2a3a5c'}
            onMouseLeave={e => e.currentTarget.style.borderColor = '#1e2740'}
        >
            {/* Card Header */}
            <div className="p-5 pb-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                    <h3 className="font-display font-bold text-lg text-white leading-tight">
                        {groupLabel}
                    </h3>
                    {/* Rating or New badge */}
                    {avgRating ? (
                        <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                            <Star size={13} style={{ color: '#e2b764', fill: '#e2b764' }} />
                            <span className="text-sm font-semibold" style={{ color: '#e2b764' }}>
                                {avgRating}
                            </span>
                        </div>
                    ) : (
                        <span className="flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full"
                            style={{ background: 'rgba(226,183,100,0.15)', color: '#e2b764' }}>
                            NEW
                        </span>
                    )}

                    {/* Wishlist heart toggle */}
                    {serviceId && (
                        <button
                            type="button"
                            onClick={handleWishlistClick}
                            disabled={isTogglingWishlist}
                            aria-label={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
                            aria-pressed={isWishlisted}
                            className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                            style={{
                                background: isWishlisted ? 'rgba(226,183,100,0.15)' : '#141d33',
                                border: `1px solid ${isWishlisted ? '#e2b764' : '#1e2740'}`,
                            }}
                        >
                            {isTogglingWishlist ? (
                                <Loader2 size={13} className="animate-spin" style={{ color: '#e2b764' }} />
                            ) : (
                                <Heart
                                    size={13}
                                    fill={isWishlisted ? '#e2b764' : 'none'}
                                    style={{ color: isWishlisted ? '#e2b764' : '#64748b' }}
                                />
                            )}
                        </button>
                    )}
                </div>

                {/* Description */}
                <p className="text-sm leading-relaxed mb-4" style={{ color: '#64748b' }}>
                    {group.durations[0]?.description ?? 'Premium spa service delivered to your location.'}
                </p>

                {/* Duration chips — selectable */}
                <div className="flex flex-wrap gap-2 mb-4">
                    {group.durations.map(d => {
                        const isSelected = selectedDuration?.id === d.id;
                        return (
                            <button
                                key={d.id}
                                onClick={() => setSelectedDuration(isSelected ? null : d)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border"
                                style={{
                                    borderColor: isSelected ? '#e2b764' : '#1e2740',
                                    background:  isSelected ? 'rgba(226,183,100,0.12)' : '#141d33',
                                    color:       isSelected ? '#e2b764' : '#94a3b8',
                                }}
                            >
                                <Clock size={11} />
                                {d.duration_minutes} min
                                <span className="font-bold ml-0.5">
                                    · AED {Number(d.price).toLocaleString()}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* Selected duration price highlight */}
                <AnimatePresence mode="wait">
                    {selectedDuration && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="flex items-center justify-between py-3 px-4 rounded-xl mb-3"
                                style={{ background: 'rgba(226,183,100,0.06)', border: '1px solid rgba(226,183,100,0.15)' }}>
                                <div>
                                    <p className="text-[11px] uppercase tracking-wider mb-0.5" style={{ color: '#64748b' }}>
                                        Selected
                                    </p>
                                    <p className="text-sm font-semibold text-white">
                                        {selectedDuration.duration_minutes} min session
                                    </p>
                                </div>
                                <p className="text-xl font-display font-bold" style={{ color: '#e2b764' }}>
                                    AED {Number(selectedDuration.price).toLocaleString()}
                                </p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Card Footer */}
            <div className="px-5 pb-5 flex items-center justify-between">
                {!selectedDuration ? (
                    <p className="text-xs" style={{ color: '#64748b' }}>
                        Starting from{' '}
                        <span className="font-bold" style={{ color: '#e2b764' }}>
                            AED {minPrice.toLocaleString()}
                        </span>
                    </p>
                ) : (
                    <div />
                )}

                <button
                    onClick={handleBook}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all"
                    style={{
                        background:  '#e2b764',
                        color:       '#0b1120',
                        boxShadow:   '0 4px 15px rgba(226,183,100,0.25)',
                    }}
                    onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 20px rgba(226,183,100,0.4)'}
                    onMouseLeave={e => e.currentTarget.style.boxShadow = '0 4px 15px rgba(226,183,100,0.25)'}
                >
                    <Sparkles size={14} />
                    Book Now
                    <ChevronRight size={14} />
                </button>
            </div>
        </motion.div>
    );
}

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────
export default function Services() {
    const { t, locale } = useLanguage();

    const [services,        setServices]        = useState([]);
    const [loading,         setLoading]         = useState(true);
    const [error,           setError]           = useState(null);
    const [activeCategory,  setActiveCategory]  = useState('all');

    // service_id -> wishlist row id, for services currently saved by this customer
    const [wishlistMap,        setWishlistMap]        = useState({});
    const [pendingWishlistIds, setPendingWishlistIds]  = useState(() => new Set());
    const [wishlistError,      setWishlistError]       = useState(null);

    // ── Fetch grouped services + current wishlist state (single request each) ──
    useEffect(() => {
        Promise.all([
            apiFetch('/api/services'),
            apiFetch('/api/wishlist').catch(() => []), // wishlist state is non-critical to the page
        ])
            .then(([servicesData, wishlistData]) => {
                setServices(servicesData);
                const map = {};
                wishlistData.forEach(row => { map[row.service_id] = row.id; });
                setWishlistMap(map);
            })
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }, []);

    // ── Toggle wishlist save/remove for a service ─────────────────────────────
    const handleToggleWishlist = async (serviceId) => {
        if (pendingWishlistIds.has(serviceId)) return; // guard against rapid repeated clicks

        setPendingWishlistIds(prev => new Set(prev).add(serviceId));
        setWishlistError(null);

        const wasWishlisted = wishlistMap[serviceId] != null;

        try {
            if (wasWishlisted) {
                await apiWrite(`/api/wishlist/${wishlistMap[serviceId]}`, 'DELETE');
                setWishlistMap(prev => {
                    const next = { ...prev };
                    delete next[serviceId];
                    return next;
                });
            } else {
                const data = await apiWrite('/api/wishlist', 'POST', { service_id: serviceId });
                setWishlistMap(prev => ({ ...prev, [serviceId]: data.wishlist.id }));
            }
        } catch (err) {
            // keep previous heart state on failure
            setWishlistError(err.message);
        } finally {
            setPendingWishlistIds(prev => {
                const next = new Set(prev);
                next.delete(serviceId);
                return next;
            });
        }
    };

    // ── Filter by category ────────────────────────────────────────────────────
    const filtered = activeCategory === 'all'
        ? services
        : services.filter(s => s.category === activeCategory);

    return (
        <AuthenticatedLayout>
            <div className="min-h-screen" style={{ background: '#0b1120', color: '#cbd5e1' }}>

                {/* ── Header ── */}
                <header className="sticky top-0 z-30 border-b backdrop-blur-xl"
                    style={{ background: 'rgba(11,17,32,0.8)', borderColor: '#1e2740' }}>
                    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
                        <motion.h1
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="font-display text-xl font-bold text-white"
                        >
                            {t.services?.title ?? 'Our Services'}
                        </motion.h1>
                        <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>
                            {t.services?.subtitle ?? 'Premium spa services delivered to your location'}
                        </p>
                    </div>
                </header>

                <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

                    {/* ── Wishlist error banner ── */}
                    {wishlistError && (
                        <div className="flex items-center gap-3 p-3 mb-4 rounded-xl text-sm"
                            style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', color: '#f87171' }}>
                            <AlertCircle size={16} className="flex-shrink-0" />
                            <span className="flex-1">{wishlistError}</span>
                            <button onClick={() => setWishlistError(null)} className="text-xs underline flex-shrink-0">
                                Dismiss
                            </button>
                        </div>
                    )}

                    {/* ── Category Filters ── */}
                    <div className="flex gap-2 mb-6 overflow-x-auto pb-1 scrollbar-hide">
                        {CATEGORIES.map(cat => {
                            const isActive = activeCategory === cat.key;
                            const label    = locale === 'ar' ? cat.label_ar : cat.label;
                            return (
                                <button
                                    key={cat.key}
                                    onClick={() => setActiveCategory(cat.key)}
                                    className="px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all flex-shrink-0"
                                    style={{
                                        background: isActive
                                            ? 'linear-gradient(135deg, #b7882a, #e2b764, #f0c97a)'
                                            : '#141d33',
                                        color:      isActive ? '#0b1120' : '#94a3b8',
                                        border:     isActive ? 'none' : '1px solid #1e2740',
                                    }}
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </div>

                    {/* ── Content ── */}
                    {loading ? (
                        <div className="flex items-center justify-center py-24">
                            <Loader2 className="w-7 h-7 animate-spin" style={{ color: '#e2b764' }} />
                        </div>
                    ) : error ? (
                        <div className="flex items-center justify-center py-24">
                            <p className="text-sm" style={{ color: '#f87171' }}>{error}</p>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-24 gap-3">
                            <Sparkles size={32} style={{ color: '#1e2740' }} />
                            <p className="text-sm" style={{ color: '#64748b' }}>
                                No services in this category yet.
                            </p>
                        </div>
                    ) : (
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={activeCategory}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="space-y-4"
                            >
                                {filtered.map((group, i) => {
                                    const serviceId = group.durations[0]?.service_id ?? null;
                                    return (
                                        <ServiceGroupCard
                                            key={group.group_name}
                                            group={group}
                                            locale={locale}
                                            index={i}
                                            onBook={() => router.visit(route('bookings'))}
                                            serviceId={serviceId}
                                            isWishlisted={serviceId != null && wishlistMap[serviceId] != null}
                                            isTogglingWishlist={serviceId != null && pendingWishlistIds.has(serviceId)}
                                            onToggleWishlist={handleToggleWishlist}
                                        />
                                    );
                                })}
                            </motion.div>
                        </AnimatePresence>
                    )}
                </main>
            </div>
        </AuthenticatedLayout>
    );
}