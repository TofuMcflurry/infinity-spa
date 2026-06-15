import AuthenticatedLayout from '@/Layouts/CustomerLayout';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { router } from '@inertiajs/react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Clock, Star, ChevronRight, Loader2, Sparkles } from 'lucide-react';

// ── API helper ────────────────────────────────────────────────────────────────
async function apiFetch(url) {
    const res = await fetch(url, {
        headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'same-origin',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

// ── Category config ───────────────────────────────────────────────────────────
const CATEGORIES = [
    { key: 'all',         label: 'All Services',  label_ar: 'كل الخدمات'    },
    { key: 'massage',     label: 'Massage',       label_ar: 'مساج'           },
    { key: 'homeRituals', label: 'Body Rituals',  label_ar: 'طقوس الجسم'    },
];

// ── Service Group Card ────────────────────────────────────────────────────────
function ServiceGroupCard({ group, locale, onBook, index }) {
    const [selectedDuration, setSelectedDuration] = useState(null);

    const groupLabel = locale === 'ar' ? group.group_name_ar : group.group_name;
    const minPrice   = Math.min(...group.durations.map(d => Number(d.price)));
    const hasRating  = group.durations.some(d => Number(d.rating) > 0);
    const avgRating  = hasRating
        ? (group.durations.reduce((sum, d) => sum + Number(d.rating), 0) / group.durations.length).toFixed(1)
        : null;

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

    // ── Fetch grouped services ────────────────────────────────────────────────
    useEffect(() => {
        apiFetch('/api/services')
            .then(setServices)
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }, []);

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
                                {filtered.map((group, i) => (
                                    <ServiceGroupCard
                                        key={group.group_name}
                                        group={group}
                                        locale={locale}
                                        index={i}
                                        onBook={() => router.visit(route('bookings'))}
                                    />
                                ))}
                            </motion.div>
                        </AnimatePresence>
                    )}
                </main>
            </div>
        </AuthenticatedLayout>
    );
}