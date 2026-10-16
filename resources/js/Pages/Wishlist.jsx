import AuthenticatedLayout from '@/Layouts/CustomerLayout';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { router } from '@inertiajs/react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Clock, Star, ChevronRight, Loader2, Heart, HeartOff, AlertCircle, X, ShoppingBag } from 'lucide-react';

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

async function apiDelete(url) {
    const res = await fetch(url, {
        method: 'DELETE',
        headers: {
            'Accept': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-XSRF-TOKEN': getCsrf(),
        },
        credentials: 'same-origin',
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

// ── Wishlist Item Card ───────────────────────────────────────────────────────
function WishlistItemCard({ item, locale, index, isRemoving, onRemove, onBook }) {
    const [selectedDuration, setSelectedDuration] = useState(null);

    const service   = item.service;
    const name      = locale === 'ar' ? service?.name_ar : service?.name;
    const activeVariants = (service?.variants ?? []).filter(v => v.is_active);

    const isUnavailable = !service || !service.is_active || !!service.archived_at || activeVariants.length === 0;

    const minPrice  = activeVariants.length ? Math.min(...activeVariants.map(v => Number(v.price))) : null;
    const rating    = Number(service?.rating ?? 0);
    const imageUrl  = service?.image ? `/storage/${service.image}` : null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.3, delay: index * 0.05 }}
            className="rounded-2xl border overflow-hidden transition-all"
            style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-card)', opacity: isUnavailable ? 0.75 : 1 }}
        >
            {/* Image */}
            <div className="h-40 relative overflow-hidden" style={{ background: 'var(--theme-btn-bg)' }}>
                {imageUrl ? (
                    <img src={imageUrl} alt={name} className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <Heart size={28} style={{ color: 'var(--theme-border)' }} />
                    </div>
                )}

                {isUnavailable && (
                    <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(11,17,32,0.65)' }}>
                        <span className="text-[11px] font-bold px-3 py-1 rounded-full"
                            style={{ background: 'rgba(248,113,113,0.15)', color: '#f87171', border: '1px solid rgba(248,113,113,0.3)' }}>
                            Currently Unavailable
                        </span>
                    </div>
                )}

                {/* Remove button */}
                <button
                    type="button"
                    onClick={() => onRemove(item.id)}
                    disabled={isRemoving}
                    aria-label="Remove from wishlist"
                    className="absolute top-2.5 right-2.5 flex items-center justify-center w-8 h-8 rounded-full transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                    style={{ background: 'rgba(11,17,32,0.8)', border: '1px solid rgba(226,183,100,0.3)', backdropFilter: 'blur(4px)' }}
                >
                    {isRemoving ? (
                        <Loader2 size={14} className="animate-spin" style={{ color: '#e2b764' }} />
                    ) : (
                        <X size={14} style={{ color: '#e2b764' }} />
                    )}
                </button>
            </div>

            {/* Body */}
            <div className="p-5 pb-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                    <h3 className="font-display font-bold text-lg leading-tight" style={{ color: 'var(--theme-text-head)' }}>
                        {name ?? 'Service'}
                    </h3>
                    {rating > 0 && (
                        <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                            <Star size={13} style={{ color: 'var(--theme-link)', fill: 'var(--theme-link)' }} />
                            <span className="text-sm font-semibold" style={{ color: 'var(--theme-link)' }}>
                                {rating.toFixed(1)}
                            </span>
                        </div>
                    )}
                </div>

                <p className="text-sm leading-relaxed mb-4" style={{ color: 'var(--theme-text-muted)' }}>
                    {service?.description ?? 'Premium spa service delivered to your location.'}
                </p>

                {/* Duration chips */}
                {activeVariants.length > 0 ? (
                    <div className="flex flex-wrap gap-2 mb-4">
                        {activeVariants.map(v => {
                            const isSelected = selectedDuration?.id === v.id;
                            return (
                                <button
                                    key={v.id}
                                    onClick={() => setSelectedDuration(isSelected ? null : v)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border"
                                    style={{
                                        borderColor: isSelected ? '#e2b764' : 'var(--theme-border)',
                                        background:  isSelected ? 'rgba(226,183,100,0.12)' : 'var(--theme-btn-bg)',
                                        color:       isSelected ? 'var(--theme-link)' : 'var(--theme-text-2)',
                                    }}
                                >
                                    <Clock size={11} />
                                    {v.duration_minutes} min
                                    <span className="font-bold ml-0.5">
                                        · AED {Number(v.price).toLocaleString()}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <p className="text-xs mb-4" style={{ color: 'var(--theme-text-muted)' }}>
                        No durations currently available.
                    </p>
                )}

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
                                    <p className="text-[11px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--theme-text-muted)' }}>
                                        Selected
                                    </p>
                                    <p className="text-sm font-semibold" style={{ color: 'var(--theme-text-head)' }}>
                                        {selectedDuration.duration_minutes} min session
                                    </p>
                                </div>
                                <p className="text-xl font-display font-bold" style={{ color: 'var(--theme-link)' }}>
                                    AED {Number(selectedDuration.price).toLocaleString()}
                                </p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="px-5 pb-5 flex items-center justify-between gap-3">
                {minPrice !== null && !selectedDuration ? (
                    <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>
                        Starting from{' '}
                        <span className="font-bold" style={{ color: 'var(--theme-link)' }}>
                            AED {minPrice.toLocaleString()}
                        </span>
                    </p>
                ) : (
                    <div />
                )}

                <button
                    onClick={() => onBook(item)}
                    disabled={isUnavailable}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                        background:  isUnavailable ? 'var(--theme-btn-bg)' : 'var(--theme-cta)',
                        color:       isUnavailable ? 'var(--theme-text-muted)' : 'var(--theme-cta-ink)',
                        boxShadow:   isUnavailable ? 'none' : '0 4px 15px rgba(226,183,100,0.25)',
                    }}
                    onMouseEnter={e => { if (!isUnavailable) e.currentTarget.style.boxShadow = '0 4px 20px rgba(226,183,100,0.4)'; }}
                    onMouseLeave={e => { if (!isUnavailable) e.currentTarget.style.boxShadow = '0 4px 15px rgba(226,183,100,0.25)'; }}
                >
                    <ShoppingBag size={14} />
                    Book Now
                    <ChevronRight size={14} />
                </button>
            </div>
        </motion.div>
    );
}

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────
export default function Wishlist() {
    const { locale } = useLanguage();

    const [items,           setItems]           = useState([]);
    const [loading,         setLoading]         = useState(true);
    const [error,           setError]           = useState(null);
    const [removingIds,     setRemovingIds]     = useState(() => new Set());
    const [removeError,     setRemoveError]     = useState(null);

    // ── Fetch wishlist ─────────────────────────────────────────────────────────
    const loadWishlist = () => {
        setLoading(true);
        setError(null);
        apiFetch('/api/wishlist')
            .then(setItems)
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        loadWishlist();
    }, []);

    // ── Remove item ───────────────────────────────────────────────────────────
    const handleRemove = async (wishlistId) => {
        if (removingIds.has(wishlistId)) return; // guard against rapid repeated clicks

        setRemovingIds(prev => new Set(prev).add(wishlistId));
        setRemoveError(null);

        try {
            await apiDelete(`/api/wishlist/${wishlistId}`);
            setItems(prev => prev.filter(i => i.id !== wishlistId));
        } catch (err) {
            // keep the item in the list on failure
            setRemoveError(err.message);
        } finally {
            setRemovingIds(prev => {
                const next = new Set(prev);
                next.delete(wishlistId);
                return next;
            });
        }
    };

    // ── Book now — hand off to the existing booking flow, preselecting this
    // service via query param so the wizard can skip Step 1 (see Bookings.jsx).
    // Still no schedule pre-selection and no reservation created here. ────────
    const handleBook = (item) => {
        router.visit(`${route('bookings')}?service_id=${encodeURIComponent(item.service_id)}`);
    };

    return (
        <AuthenticatedLayout>
            <div className="min-h-screen" style={{ background: 'var(--theme-bg)', color: 'var(--theme-text)' }}>

                {/* ── Header ── */}
                <header className="sticky top-0 z-30 border-b backdrop-blur-xl"
                    style={{ background: 'var(--theme-header-bg)', borderColor: 'var(--theme-border)' }}>
                    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
                        <motion.h1
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="font-display text-xl font-bold flex items-center gap-2"
                            style={{ color: 'var(--theme-text-head)' }}
                        >
                            <Heart size={20} style={{ color: 'var(--theme-link)' }} fill="var(--theme-link)" />
                            My Wishlist
                        </motion.h1>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>
                            Services you've saved for later
                        </p>
                    </div>
                </header>

                <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

                    {/* ── Remove error banner ── */}
                    {removeError && (
                        <div className="flex items-center gap-3 p-3 mb-4 rounded-xl text-sm bg-destructive/10 border border-destructive/25 text-destructive">
                            <AlertCircle size={16} className="flex-shrink-0" />
                            <span className="flex-1">{removeError}</span>
                            <button onClick={() => setRemoveError(null)} className="text-xs underline flex-shrink-0">
                                Dismiss
                            </button>
                        </div>
                    )}

                    {/* ── Content ── */}
                    {loading ? (
                        <div className="flex items-center justify-center py-24">
                            <Loader2 className="w-7 h-7 animate-spin" style={{ color: 'var(--theme-cta)' }} />
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center py-24 gap-3">
                            <AlertCircle size={28} className="text-destructive" />
                            <p className="text-sm text-destructive">{error}</p>
                            <button
                                onClick={loadWishlist}
                                className="text-xs font-semibold px-4 py-2 rounded-xl transition-all"
                                style={{ background: 'var(--theme-btn-bg)', color: 'var(--theme-link)', border: '1px solid var(--theme-border)' }}
                            >
                                Try Again
                            </button>
                        </div>
                    ) : items.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
                            <HeartOff size={32} style={{ color: 'var(--theme-border)' }} />
                            <p className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>
                                No services in your wishlist yet.
                            </p>
                            <button
                                onClick={() => router.visit(route('services'))}
                                className="mt-1 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all"
                                style={{ background: 'var(--theme-cta)', color: 'var(--theme-cta-ink)', boxShadow: '0 4px 15px rgba(226,183,100,0.25)' }}
                            >
                                Browse Services
                                <ChevronRight size={14} />
                            </button>
                        </div>
                    ) : (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.2 }}
                            className="grid grid-cols-1 sm:grid-cols-2 gap-4"
                        >
                            <AnimatePresence>
                                {items.map((item, i) => (
                                    <WishlistItemCard
                                        key={item.id}
                                        item={item}
                                        locale={locale}
                                        index={i}
                                        isRemoving={removingIds.has(item.id)}
                                        onRemove={handleRemove}
                                        onBook={handleBook}
                                    />
                                ))}
                            </AnimatePresence>
                        </motion.div>
                    )}
                </main>
            </div>
        </AuthenticatedLayout>
    );
}
