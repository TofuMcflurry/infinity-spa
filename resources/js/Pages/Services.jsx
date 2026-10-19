import AuthenticatedLayout from '@/Layouts/CustomerLayout';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { router } from '@inertiajs/react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Clock, Star, ChevronRight, Loader2, Sparkles, Heart, AlertCircle } from 'lucide-react';
import MobileMenuSheet from '@/Components/Customer/MobileMenuSheet';
import MobileMenuTrigger from '@/Components/Customer/MobileMenuTrigger';

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
            // bg-[var(--theme-card)] moved from the always-on inline `style`
            // to this lg:-only class: the inline style painted a square
            // theme-card rectangle at every breakpoint, but radius/border/
            // overflow-hidden on this wrapper were already lg:-scoped (so the
            // mobile card below can own its own rounded chrome) — the result
            // was a square white box behind a rounded one, bleeding past the
            // corners. At mobile this wrapper is now fully transparent; the
            // mobile card's own `background: var(--theme-card)` (in its own
            // style prop, inside its own rounded-[20px] border) is the only
            // surface painted there.
            className="lg:rounded-2xl lg:border lg:overflow-hidden lg:bg-[var(--theme-card)] transition-all"
            style={{ borderColor: 'var(--theme-border)' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--theme-link)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--theme-border)'}
        >
            {/* ── Mobile: exact Wishlist.jsx card parity (same component used
                for both — resources/js/Pages/Wishlist.jsx:73-179 is the literal
                source this was built from). Services has no image field, so
                the thumbnail slot is omitted entirely (no placeholder); every
                other value — card padding/radius, p-3→-mx-3/px-3 duration-pill
                bleed, flex-col gap-1 title/rating/description stack, 44px
                favorite hit area with its 32px inner circle, footer divider +
                stacked price-label-then-AED-price + far-right Book Now — is
                copied from that file, not re-derived. Same selectedDuration
                state, same handleWishlistClick/handleBook handlers as the
                desktop block below; only the JSX layout differs. ── */}
            <div className="lg:hidden rounded-[20px] border p-3 flex flex-col gap-3 transition-all"
                style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-card)' }}>

                <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0 flex flex-col gap-1">
                        <h3 className="font-display font-bold text-[21px] leading-tight truncate" style={{ color: 'var(--theme-text-head)' }}>
                            {groupLabel}
                        </h3>
                        {avgRating ? (
                            <span className="self-start text-xs font-bold flex items-center gap-1" style={{ color: 'var(--theme-link)' }}>
                                <Star size={12} style={{ color: 'var(--theme-link)', fill: 'var(--theme-link)' }} />
                                {avgRating}
                            </span>
                        ) : (
                            <span className="self-start text-[10px] font-bold px-2 py-0.5 rounded-full"
                                style={{ background: 'rgba(226,183,100,0.15)', color: 'var(--theme-link)' }}>
                                NEW
                            </span>
                        )}
                        <p className="text-[13px] leading-snug line-clamp-2" style={{ color: 'var(--theme-text-2)' }}>
                            {group.durations[0]?.description ?? 'Premium spa service delivered to your location.'}
                        </p>
                    </div>

                    {serviceId && (
                        <button
                            type="button"
                            onClick={handleWishlistClick}
                            disabled={isTogglingWishlist}
                            aria-label={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
                            aria-pressed={isWishlisted}
                            className="flex-none w-11 h-11 -mt-1.5 -mr-1.5 rounded-full flex items-center justify-center transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            <span className="w-8 h-8 rounded-full border flex items-center justify-center"
                                style={{
                                    borderColor: isWishlisted ? '#e2b764' : 'var(--theme-border)',
                                    background:  isWishlisted ? 'rgba(226,183,100,0.15)' : 'transparent',
                                }}>
                                {isTogglingWishlist ? (
                                    <Loader2 size={15} className="animate-spin" style={{ color: 'var(--theme-link)' }} />
                                ) : (
                                    <Heart size={15} fill={isWishlisted ? '#e2b764' : 'none'} style={{ color: isWishlisted ? '#e2b764' : 'var(--theme-text-muted)' }} />
                                )}
                            </span>
                        </button>
                    )}
                </div>

                <div className="flex gap-2 overflow-x-auto -mx-3 px-3 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                    {group.durations.map(d => {
                        const isSelected = selectedDuration?.id === d.id;
                        return (
                            <button
                                key={d.id}
                                onClick={() => setSelectedDuration(isSelected ? null : d)}
                                className="flex-none h-10 px-3 rounded-xl text-[13px] font-semibold border whitespace-nowrap transition-all"
                                style={{
                                    borderColor: isSelected ? '#e2b764' : 'var(--theme-border)',
                                    background:  isSelected ? 'rgba(226,183,100,0.12)' : 'var(--theme-btn-bg)',
                                    color:       isSelected ? 'var(--theme-link)' : 'var(--theme-text-2)',
                                }}
                            >
                                {d.duration_minutes} min · AED {Number(d.price).toLocaleString()}
                            </button>
                        );
                    })}
                </div>

                <div className="flex items-center justify-between gap-3 pt-2.5 border-t" style={{ borderColor: 'var(--theme-border)' }}>
                    <div>
                        <p className="text-[11px]" style={{ color: 'var(--theme-text-muted)' }}>
                            {selectedDuration ? `${selectedDuration.duration_minutes} min selected` : 'Starting from'}
                        </p>
                        <p className="text-base font-extrabold" style={{ color: 'var(--theme-link)' }}>
                            AED {(selectedDuration ? Number(selectedDuration.price) : minPrice).toLocaleString()}
                        </p>
                    </div>
                    <button
                        onClick={handleBook}
                        className="flex-none h-11 px-[18px] rounded-xl text-sm font-bold flex items-center gap-1.5 transition-all"
                        style={{ background: 'var(--theme-cta)', color: 'var(--theme-cta-ink)' }}
                    >
                        Book Now
                        <ChevronRight size={14} />
                    </button>
                </div>
            </div>

            {/* ── Desktop (lg+): unchanged from before this rebuild — same
                markup, byte-for-byte, now just explicitly scoped to lg+
                instead of sharing elements with mobile via inline lg:
                prefixes. Any mobile-only utility classes still visible below
                (e.g. stray mr-14/lg:mr-0 pairs) are inert leftovers that
                already resolved to their lg: value in the original code; they
                render identically whether or not they're cleaned up, so they
                were left as-is to minimize the diff on a block that isn't
                supposed to change. ── */}
            <div className="hidden lg:block">
            <div className="p-5 pb-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                    <h3 className="font-display font-bold text-[22px] lg:text-lg leading-tight" style={{ color: 'var(--theme-text-head)' }}>
                        {groupLabel}
                    </h3>
                    {avgRating ? (
                        <div className="flex items-center gap-1 flex-shrink-0 mt-0.5 mr-14 lg:mr-0">
                            <Star size={13} style={{ color: 'var(--theme-link)', fill: 'var(--theme-link)' }} />
                            <span className="text-sm font-semibold" style={{ color: 'var(--theme-link)' }}>
                                {avgRating}
                            </span>
                        </div>
                    ) : (
                        <span className="flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full mr-14 lg:mr-0"
                            style={{ background: 'rgba(226,183,100,0.15)', color: 'var(--theme-link)' }}>
                            NEW
                        </span>
                    )}

                    {/* Wishlist heart toggle — 44px tap target on mobile (prototype
                        spec: "the heart has a 44px tap target, it was 28px"),
                        unchanged 28px on desktop. mr-14 (56px) below lg keeps
                        it clear of FloatingConcierge (fixed bottom-right,
                        right-5 w-14) whenever this row's scroll position
                        lands in that zone — see the matching note on the
                        duration-chip grid and footer button below for why
                        this is a per-element reserve rather than narrowing
                        the whole page/card (keeps title/description at full
                        width; only the three actual tap targets pay the
                        clearance cost). */}
                    {serviceId && (
                        <button
                            type="button"
                            onClick={handleWishlistClick}
                            disabled={isTogglingWishlist}
                            aria-label={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
                            aria-pressed={isWishlisted}
                            className="flex-shrink-0 flex items-center justify-center w-11 h-11 lg:w-7 lg:h-7 mr-14 lg:mr-0 rounded-full transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                            style={{
                                background: isWishlisted ? 'rgba(226,183,100,0.15)' : 'var(--theme-btn-bg)',
                                border: `1px solid ${isWishlisted ? '#e2b764' : 'var(--theme-border)'}`,
                            }}
                        >
                            {isTogglingWishlist ? (
                                <Loader2 size={13} className="animate-spin" style={{ color: 'var(--theme-link)' }} />
                            ) : (
                                <Heart
                                    size={13}
                                    fill={isWishlisted ? '#e2b764' : 'none'}
                                    style={{ color: isWishlisted ? '#e2b764' : 'var(--theme-text-muted)' }}
                                />
                            )}
                        </button>
                    )}
                </div>

                {/* Description */}
                <p className="text-sm leading-relaxed mb-4" style={{ color: 'var(--theme-text-muted)' }}>
                    {group.durations[0]?.description ?? 'Premium spa service delivered to your location.'}
                </p>

                {/* Duration chips (lg+ only here — mobile has its own block
                    above). Unchanged markup from before this rebuild. */}
                <div className="hidden lg:flex lg:flex-wrap gap-2 mb-4">
                    {group.durations.map(d => {
                        const isSelected = selectedDuration?.id === d.id;
                        return (
                            <button
                                key={d.id}
                                onClick={() => setSelectedDuration(isSelected ? null : d)}
                                className="flex lg:flex-row lg:items-center gap-0.5 lg:gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border text-left"
                                style={{
                                    borderColor: isSelected ? '#e2b764' : 'var(--theme-border)',
                                    background:  isSelected ? 'rgba(226,183,100,0.12)' : 'var(--theme-btn-bg)',
                                    color:       isSelected ? 'var(--theme-link)' : 'var(--theme-text-2)',
                                }}
                            >
                                <span className="flex items-center gap-1">
                                    <Clock size={11} />
                                    {d.duration_minutes} min
                                </span>
                                <span className="font-bold lg:ml-0.5">
                                    <span className="lg:inline">· </span>AED {Number(d.price).toLocaleString()}
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

            {/* Card Footer (lg+ only here — mobile has its own footer in the
                block above). Unchanged markup from before this rebuild. */}
            <div className="px-5 pb-5 flex items-center justify-between flex-wrap gap-3">
                {!selectedDuration ? (
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
                    onClick={handleBook}
                    className="flex-none h-11 lg:h-auto flex items-center gap-2 px-[18px] lg:px-4 lg:py-2.5 rounded-xl text-sm font-bold transition-all"
                    style={{
                        background:  'var(--theme-cta)',
                        color:       'var(--theme-cta-ink)',
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
    const [menuOpen,        setMenuOpen]        = useState(false);

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
            <div className="min-h-screen" style={{ background: 'var(--theme-bg)', color: 'var(--theme-text)' }}>

                {/* ── Header ── */}
                <header className="sticky top-0 z-30 border-b backdrop-blur-xl"
                    style={{ background: 'var(--theme-header-bg)', borderColor: 'var(--theme-border)' }}>
                    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex items-center justify-between gap-3">
                        <div>
                            <motion.h1
                                initial={{ opacity: 0, y: -8 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="font-display text-xl font-bold"
                                style={{ color: 'var(--theme-text-head)' }}
                            >
                                {t.services?.title ?? 'Our Services'}
                            </motion.h1>
                            <p className="text-xs mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>
                                {t.services?.subtitle ?? 'Premium spa services delivered to your location'}
                            </p>
                        </div>
                        <MobileMenuTrigger onClick={() => setMenuOpen(true)} />
                    </div>
                </header>

                <MobileMenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />

                <main className="max-w-5xl mx-auto px-4 md:px-6 lg:px-8 py-6">

                    {/* ── Wishlist error banner ── */}
                    {wishlistError && (
                        <div className="flex items-center gap-3 p-3 mb-4 rounded-xl text-sm bg-destructive/10 border border-destructive/25 text-destructive">
                            <AlertCircle size={16} className="flex-shrink-0" />
                            <span className="flex-1">{wishlistError}</span>
                            <button onClick={() => setWishlistError(null)} className="text-xs underline flex-shrink-0">
                                Dismiss
                            </button>
                        </div>
                    )}

                    {/* ── Category Filters ──────────────────────────────────────
                        Mobile: sticky just below the header (prototype spec:
                        filter rows live in the sticky header), now that
                        CustomerLayout's scroll-container bug (commit eda9677)
                        no longer breaks sticky positioning for page content.
                        top-[87px] matches the header's measured rendered
                        height (py-5 wrapping a fixed-size title/subtitle
                        stack) — stable regardless of locale. lg:static
                        restores the exact original in-flow desktop behavior.
                        z-20 keeps it under the header (z-30) and
                        MobileMenuSheet (z-[60]), above plain content below.
                        background matches the page so scrolled-under cards
                        don't show through. `scrollbar-hide` was already a
                        dead class (no such Tailwind utility/plugin exists in
                        this project) — swapped for the working arbitrary-value
                        technique already used elsewhere in this codebase. */}
                    <div className="sticky top-[87px] z-20 lg:static lg:top-auto flex gap-2 mb-6 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                        style={{ background: 'var(--theme-bg)' }}>
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
                                            : 'var(--theme-btn-bg)',
                                        color:      isActive ? 'var(--theme-cta-ink)' : 'var(--theme-text-2)',
                                        border:     isActive ? 'none' : '1px solid var(--theme-border)',
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
                            <Loader2 className="w-7 h-7 animate-spin" style={{ color: 'var(--theme-cta)' }} />
                        </div>
                    ) : error ? (
                        <div className="flex items-center justify-center py-24">
                            <p className="text-sm text-destructive">{error}</p>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-24 gap-3">
                            <Sparkles size={32} style={{ color: 'var(--theme-border)' }} />
                            <p className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>
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