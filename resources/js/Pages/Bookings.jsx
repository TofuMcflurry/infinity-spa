import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { router } from '@inertiajs/react';
import {
    ChevronLeft, Star, Loader2, Check, Clock,
    Banknote, CreditCard, MapPin, Home, Building2, Hotel,
    AlertCircle
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Calendar } from '@/Components/ui/calendar';
import { cn } from '@/lib/utils';

// ── Payment Methods ────────────────────────────────────────────────────────────
const PAYMENT_METHODS = [
    {
        id:    'cash',
        label: 'Cash',
        sub:   'Pay on arrival',
        desc:  'Pay directly to the therapist in cash',
        icon:  Banknote,
    },
    {
        id:    'cashless',
        label: 'Cashless',
        sub:   'Card / App',
        desc:  'Pay by card or mobile app',
        icon:  CreditCard,
    },
];

// ── Location icon map ─────────────────────────────────────────────────────────
const LOCATION_ICONS = {
    Home:   Home,
    Office: Building2,
    Hotel:  Hotel,
};

// ── Fetch helper (session-based, no token needed) ─────────────────────────────
async function apiFetch(url) {
    const res = await fetch(url, {
        headers: {
            'Accept':           'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'same-origin',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

export default function Bookings() {
    const { t, locale } = useLanguage();

    // ── Step state ────────────────────────────────────────────────────────────
    const [step, setStep] = useState(1);

    // ── Selections ────────────────────────────────────────────────────────────
    const [selectedGroup, setSelectedGroup] = useState(null);
    const [selectedService,   setSelectedService]   = useState(null);
    const [selectedAddress,   setSelectedAddress]   = useState(null);
    const [selectedDate,      setSelectedDate]      = useState(undefined);
    const [selectedTime,      setSelectedTime]      = useState(null);
    const [selectedTherapist, setSelectedTherapist] = useState(null);
    const [selectedPayment,   setSelectedPayment]   = useState(null);

    // ── API data ──────────────────────────────────────────────────────────────
    const [services,            setServices]           = useState([]);
    const [addresses,           setAddresses]          = useState([]);
    const [availableSlots,      setAvailableSlots]     = useState([]);
    const [availableTherapists, setAvailableTherapists] = useState([]);

    // ── Loading & error states ────────────────────────────────────────────────
    const [loadingServices,    setLoadingServices]    = useState(false);
    const [loadingAddresses,   setLoadingAddresses]   = useState(false);
    const [loadingSlots,       setLoadingSlots]       = useState(false);
    const [loadingTherapists,  setLoadingTherapists]  = useState(false);
    const [isSubmitting,       setIsSubmitting]       = useState(false);
    const [isConfirmed,        setIsConfirmed]        = useState(false);
    const [error,              setError]              = useState(null);

    // ── Gender filter (Step 4) ────────────────────────────────────────────────
    const [genderFilter, setGenderFilter] = useState('all');

    // ── Step labels ───────────────────────────────────────────────────────────
    const TOTAL_STEPS  = 5;
    const stepLabels   = [
        locale === 'ar' ? 'الخدمة'      : 'Service',
        locale === 'ar' ? 'التاريخ'     : 'Date & Location',
        locale === 'ar' ? 'الوقت'       : 'Time',
        locale === 'ar' ? 'المعالج'     : 'Therapist',
        locale === 'ar' ? 'الدفع'       : 'Payment',
    ];

    // ── Fetch services on mount ───────────────────────────────────────────────
    useEffect(() => {
        setLoadingServices(true);
        apiFetch('/api/services')
            .then(setServices)
            .catch(() => setError('Failed to load services.'))
            .finally(() => setLoadingServices(false));
    }, []);

    // ── Fetch addresses on mount ──────────────────────────────────────────────
    useEffect(() => {
        setLoadingAddresses(true);
        apiFetch('/api/addresses')
            .then((data) => {
                setAddresses(data);
                // Auto-select default address
                const def = data.find(a => a.is_default);
                if (def) setSelectedAddress(def);
            })
            .catch(() => setError('Failed to load addresses.'))
            .finally(() => setLoadingAddresses(false));
    }, []);

    // ── Fetch available slots when entering Step 3 ────────────────────────────
    useEffect(() => {
        if (step !== 3 || !selectedService || !selectedAddress || !selectedDate) return;

        const date = selectedDate.toISOString().split('T')[0];
        setLoadingSlots(true);
        setAvailableSlots([]);
        setSelectedTime(null);

        apiFetch(`/api/available-slots?service_id=${selectedService.id}&zone_name=${encodeURIComponent(selectedAddress.zone_name)}&date=${date}`)
            .then(data => {
                if (data.day_off) {
                    setError('No therapists available on this day — Tuesday is their day off.');
                    setAvailableSlots([]);
                } else {
                    setAvailableSlots(data.slots ?? []);
                }
            })
            .catch(() => setError('Failed to load available slots.'))
            .finally(() => setLoadingSlots(false));
    }, [step]);

    // ── Fetch available therapists when entering Step 4 ───────────────────────
    useEffect(() => {
        if (step !== 4 || !selectedService || !selectedAddress || !selectedDate || !selectedTime) return;

        const date = selectedDate.toISOString().split('T')[0];
        setLoadingTherapists(true);
        setAvailableTherapists([]);
        setSelectedTherapist(null);

        apiFetch(`/api/available-therapists?service_id=${selectedService.id}&zone_name=${encodeURIComponent(selectedAddress.zone_name)}&datetime=${encodeURIComponent(selectedTime)}`)
            .then(setAvailableTherapists)
            .catch(() => setError('Failed to load therapists.'))
            .finally(() => setLoadingTherapists(false));
    }, [step]);

    // ── canProceed guard ──────────────────────────────────────────────────────
    const canProceed = () => {
        if (step === 1) return !!selectedService;
        if (step === 2) return !!selectedAddress && !!selectedDate;
        if (step === 3) return !!selectedTime;
        if (step === 4) return !!selectedTherapist;
        if (step === 5) return !!selectedPayment;
        return false;
    };

    // ── Submit booking ────────────────────────────────────────────────────────
    const handleConfirm = useCallback(async () => {
        setIsSubmitting(true);
        setError(null);

        try {
            const csrfToken = document.cookie
                .split('; ')
                .find(row => row.startsWith('XSRF-TOKEN='))
                ?.split('=')[1];

            const res = await fetch('/api/bookings', {
                method:      'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type':     'application/json',
                    'Accept':           'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-XSRF-TOKEN':     decodeURIComponent(csrfToken ?? ''),
                },
                body: JSON.stringify({
                    service_id:     selectedService.id,
                    therapist_id:   selectedTherapist.id,
                    zone_name:      selectedAddress.zone_name,
                    location:       `${selectedAddress.label} - ${selectedAddress.address}`,
                    datetime:       selectedTime,  // ← now stores full datetime string
                    payment_method: selectedPayment,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.message ?? 'Booking failed.');
            }

            setIsConfirmed(true);
        } catch (err) {
            setError(err.message);
        } finally {
            setIsSubmitting(false);
        }
    }, [selectedService, selectedTherapist, selectedAddress, selectedDate, selectedTime, selectedPayment]);

    // ── Formatted date display ────────────────────────────────────────────────
    const formattedDate = selectedDate
        ? selectedDate.toLocaleDateString('en-GB', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
          })
        : null;

    // ── Filtered therapists by gender ─────────────────────────────────────────
    const filteredTherapists = availableTherapists.filter(t =>
        genderFilter === 'all' || t.gender === genderFilter
    );

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <AuthenticatedLayout>
            <div className="min-h-screen bg-background">

                {/* ── Header / Stepper ── */}
                <header className="sticky top-0 z-40 glass-card-strong rounded-none border-x-0 border-t-0 px-5 pt-[env(safe-area-inset-top)] pb-4">
                    <div className="pt-3 max-w-4xl mx-auto">
                        <motion.h1
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="font-display text-xl font-bold"
                        >
                            {t.booking.title}
                        </motion.h1>

                        <div className="flex items-center gap-1.5 mt-3 overflow-x-auto scrollbar-hide">
                            {stepLabels.map((label, i) => (
                                <div key={i} className="flex items-center gap-1.5 flex-shrink-0">
                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                                        step > i + 1  ? 'gold-gradient text-primary-foreground' :
                                        step === i + 1 ? 'border-2 border-gold text-gold' :
                                                         'bg-secondary text-muted-foreground'
                                    }`}>
                                        {step > i + 1 ? <Check className="w-3.5 h-3.5" /> : i + 1}
                                    </div>
                                    <span className={`text-xs hidden sm:inline whitespace-nowrap ${
                                        step === i + 1 ? 'text-gold font-medium' : 'text-muted-foreground'
                                    }`}>
                                        {label}
                                    </span>
                                    {i < TOTAL_STEPS - 1 && (
                                        <div className={`w-5 sm:w-8 h-px transition-all ${
                                            step > i + 1 ? 'bg-gold/60' : 'bg-border'
                                        }`} />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </header>

                {/* ── Main ── */}
                <main className="px-6 pt-5 pb-10 max-w-6xl mx-auto">

                    {/* Error banner */}
                    {error && (
                        <div className="flex items-center gap-3 p-4 mb-4 bg-destructive/10 border border-destructive/30 rounded-xl text-sm text-destructive">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            {error}
                            <button onClick={() => setError(null)} className="ml-auto text-xs underline">Dismiss</button>
                        </div>
                    )}

                    <AnimatePresence mode="wait">

                        {/* ── Confirmed ── */}
                        {isConfirmed ? (
                            <motion.div
                                key="confirmed"
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="glass-card p-8 text-center mt-8"
                            >
                                <div className="w-16 h-16 rounded-full gold-gradient flex items-center justify-center mx-auto mb-4">
                                    <Check className="w-8 h-8 text-primary-foreground" />
                                </div>
                                <h2 className="font-display text-xl font-bold mb-2">{t.booking.bookingConfirmed}</h2>
                                <p className="text-muted-foreground text-sm mb-1">
                                    {selectedService?.name} • {selectedTherapist?.name}
                                </p>
                                <p className="text-muted-foreground text-xs">
                                    {formattedDate} • {selectedTime && new Date(selectedTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                                </p>
                                <p className="text-xs text-gold mt-2">
                                    {selectedAddress?.label} — {selectedAddress?.address}
                                </p>
                                <p className="text-xs text-muted-foreground mt-4">
                                    Waiting for therapist confirmation...
                                </p>
                            </motion.div>

                        ) : (
                            <motion.div
                                key={step}
                                initial={{ opacity: 0, x: 30 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -30 }}
                                transition={{ duration: 0.25 }}
                            >

                                {/* ════════════════ STEP 1: Select Service ════════════════ */}
                                {step === 1 && (
                                    <div className="space-y-6">
                                        <p className="text-sm mb-2" style={{ color: '#94a3b8' }}>
                                            {t.booking.selectService}
                                        </p>

                                        {loadingServices ? (
                                            <div className="flex items-center justify-center py-16">
                                                <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#e2b764' }} />
                                            </div>
                                        ) : (
                                            <>
                                                {/* Level 1 — Service Groups */}
                                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                                    {services.map((group) => {
                                                        const isActive   = selectedGroup?.group_name === group.group_name;
                                                        const groupLabel = locale === 'ar' ? group.group_name_ar : group.group_name;
                                                        return (
                                                            <button
                                                                key={group.group_name}
                                                                onClick={() => {
                                                                    setSelectedGroup(isActive ? null : group);
                                                                    setSelectedService(null);
                                                                }}
                                                                className="relative p-5 rounded-2xl border text-start transition-all"
                                                                style={{
                                                                    borderColor: isActive ? '#e2b764' : '#1e2740',
                                                                    background:  isActive ? 'rgba(226,183,100,0.08)' : '#0f1629',
                                                                }}
                                                                onMouseEnter={e => {
                                                                    if (!isActive) {
                                                                        e.currentTarget.style.borderColor = '#2a3a5c';
                                                                        e.currentTarget.style.background  = '#141d33';
                                                                    }
                                                                }}
                                                                onMouseLeave={e => {
                                                                    if (!isActive) {
                                                                        e.currentTarget.style.borderColor = '#1e2740';
                                                                        e.currentTarget.style.background  = '#0f1629';
                                                                    }
                                                                }}
                                                            >
                                                                {/* Active check */}
                                                                {isActive && (
                                                                    <div className="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center"
                                                                        style={{ background: '#e2b764' }}>
                                                                        <Check className="w-3 h-3" style={{ color: '#0b1120' }} />
                                                                    </div>
                                                                )}

                                                                {/* Group name */}
                                                                <h4 className="font-display font-semibold text-base text-white mb-3 pr-6">
                                                                    {groupLabel}
                                                                </h4>

                                                                {/* Duration chips */}
                                                                <div className="flex flex-wrap gap-1.5 mb-4">
                                                                    {group.durations.map(d => (
                                                                        <span key={d.id}
                                                                            className="text-[10px] px-2.5 py-1 rounded-full font-medium"
                                                                            style={{ background: '#141d33', color: '#94a3b8' }}>
                                                                            {d.duration_minutes} min
                                                                        </span>
                                                                    ))}
                                                                </div>

                                                                {/* Starting price */}
                                                                <div className="flex items-center justify-between">
                                                                    <span className="text-[11px]" style={{ color: '#64748b' }}>
                                                                        From
                                                                    </span>
                                                                    <span className="font-display font-bold text-base"
                                                                        style={{ color: '#e2b764' }}>
                                                                        AED {Number(group.min_price).toLocaleString()}
                                                                    </span>
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>

                                                {/* Level 2 — Duration Selection */}
                                                {selectedGroup && (
                                                    <motion.div
                                                        initial={{ opacity: 0, y: 10 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        className="rounded-2xl border p-5"
                                                        style={{ borderColor: '#1e2740', background: '#080d1a' }}
                                                    >
                                                        <p className="text-sm font-medium text-white mb-4">
                                                            Choose duration —{' '}
                                                            <span style={{ color: '#e2b764' }}>
                                                                {locale === 'ar' ? selectedGroup.group_name_ar : selectedGroup.group_name}
                                                            </span>
                                                        </p>

                                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                                            {selectedGroup.durations.map(duration => {
                                                                const isSelected = selectedService?.id === duration.id;
                                                                return (
                                                                    <button
                                                                        key={duration.id}
                                                                        onClick={() => setSelectedService({
                                                                            ...duration,
                                                                            name:       `${selectedGroup.group_name} ${duration.duration_minutes} min`,
                                                                            name_ar:    `${selectedGroup.group_name_ar} ${duration.duration_minutes} دقيقة`,
                                                                            group_name: selectedGroup.group_name,
                                                                        })}
                                                                        className="relative p-4 rounded-xl border text-start transition-all"
                                                                        style={{
                                                                            borderColor: isSelected ? '#e2b764' : '#1e2740',
                                                                            background:  isSelected ? 'rgba(226,183,100,0.1)' : '#0f1629',
                                                                        }}
                                                                        onMouseEnter={e => {
                                                                            if (!isSelected) {
                                                                                e.currentTarget.style.borderColor = '#2a3a5c';
                                                                                e.currentTarget.style.background  = '#141d33';
                                                                            }
                                                                        }}
                                                                        onMouseLeave={e => {
                                                                            if (!isSelected) {
                                                                                e.currentTarget.style.borderColor = '#1e2740';
                                                                                e.currentTarget.style.background  = '#0f1629';
                                                                            }
                                                                        }}
                                                                    >
                                                                        {isSelected && (
                                                                            <div className="absolute top-3 right-3 w-4 h-4 rounded-full flex items-center justify-center"
                                                                                style={{ background: '#e2b764' }}>
                                                                                <Check className="w-2.5 h-2.5" style={{ color: '#0b1120' }} />
                                                                            </div>
                                                                        )}

                                                                        {/* Duration */}
                                                                        <div className="flex items-center gap-2 mb-2">
                                                                            <Clock className="w-4 h-4" style={{ color: '#e2b764' }} />
                                                                            <span className="text-base font-display font-bold text-white">
                                                                                {duration.duration_minutes} min
                                                                            </span>
                                                                        </div>

                                                                        {/* Price */}
                                                                        <p className="text-lg font-display font-bold"
                                                                            style={{ color: '#e2b764' }}>
                                                                            AED {Number(duration.price).toLocaleString()}
                                                                        </p>

                                                                        {/* Rating — placeholder for now */}
                                                                        <div className="flex items-center gap-1 mt-2">
                                                                            {[1,2,3,4,5].map(s => (
                                                                                <Star key={s} size={10}
                                                                                    style={{
                                                                                        color: Number(duration.rating) > 0 ? '#e2b764' : '#1e2740',
                                                                                        fill:  Number(duration.rating) > 0 ? '#e2b764' : '#1e2740',
                                                                                    }}
                                                                                />
                                                                            ))}
                                                                            <span className="text-[10px] ml-1" style={{ color: '#64748b' }}>
                                                                                {Number(duration.rating) > 0 ? duration.rating : 'New'}
                                                                            </span>
                                                                        </div>
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                )}

                                {/* ════════════════ STEP 2: Date & Location ════════════════ */}
                                {step === 2 && (
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5" style={{ alignItems: 'stretch' }}>

                                        {/* LEFT — Calendar */}
                                        <div className="glass-card p-5 flex flex-col">
                                            <h4 className="font-display font-semibold text-base mb-2">{t.booking.chooseDate}</h4>
                                            <Calendar
                                                mode="single"
                                                selected={selectedDate}
                                                onSelect={setSelectedDate}
                                                disabled={(date) => {
                                                    const today = new Date();
                                                    today.setHours(0, 0, 0, 0);
                                                    return date <= today;
                                                }}
                                                className={cn('pointer-events-auto w-full')}
                                            />
                                        </div>

                                        {/* RIGHT — Address Book */}
                                        <div className="glass-card p-5 flex flex-col">
                                            <h4 className="font-display font-semibold text-base mb-4">{t.booking.location}</h4>

                                            {loadingAddresses ? (
                                                <div className="flex items-center justify-center py-10">
                                                    <Loader2 className="w-5 h-5 animate-spin text-gold" />
                                                </div>
                                            ) : addresses.length === 0 ? (
                                                <div className="flex flex-col items-center justify-center py-10 gap-3">
                                                    <MapPin className="w-8 h-8 text-muted-foreground" />
                                                    <p className="text-sm text-muted-foreground text-center">
                                                        No addresses found.<br />Add one in your profile.
                                                    </p>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col gap-3 flex-1 justify-around">
                                                    {addresses.map((addr) => {
                                                        const isActive = selectedAddress?.id === addr.id;
                                                        const Icon = LOCATION_ICONS[addr.label] ?? MapPin;
                                                        return (
                                                            <button
                                                                key={addr.id}
                                                                onClick={() => setSelectedAddress(addr)}
                                                                className={`w-full flex items-center gap-4 p-4 rounded-xl text-start transition-all border ${
                                                                    isActive
                                                                        ? 'bg-gold/10 border-gold/40'
                                                                        : 'bg-secondary border-transparent hover:bg-secondary/80'
                                                                }`}
                                                            >
                                                                {/* Radio */}
                                                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                                                                    isActive ? 'border-gold' : 'border-muted-foreground/40'
                                                                }`}>
                                                                    {isActive && <div className="w-2.5 h-2.5 rounded-full gold-gradient" />}
                                                                </div>
                                                                <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-gold' : 'text-muted-foreground'}`} />
                                                                <div className="flex-1 min-w-0">
                                                                    <p className={`text-sm font-semibold ${isActive ? 'gold-text' : ''}`}>
                                                                        {addr.label}
                                                                        {addr.is_default && (
                                                                            <span className="ml-2 text-[10px] text-muted-foreground font-normal">Default</span>
                                                                        )}
                                                                    </p>
                                                                    <p className="text-xs text-muted-foreground truncate">{addr.address}</p>
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* ════════════════ STEP 3: Time ════════════════ */}
                                {step === 3 && (
                                    <div className="glass-card p-7">
                                        <h4 className="font-display font-semibold text-lg mb-2">{t.booking.chooseTime}</h4>
                                        <p className="text-xs text-muted-foreground mb-5">
                                            {formattedDate} • {selectedAddress?.label}
                                        </p>

                                        {loadingSlots ? (
                                            <div className="flex items-center justify-center py-16">
                                                <Loader2 className="w-6 h-6 animate-spin text-gold" />
                                                <span className="ml-3 text-sm text-muted-foreground">Checking availability...</span>
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-4 gap-3">
                                                {availableSlots.map((slot) => {
                                                    const isSelected  = selectedTime === slot.time;
                                                    const isAvailable = slot.available;
                                                    return (
                                                        <button
                                                            key={slot.time}
                                                            onClick={() => isAvailable && setSelectedTime(slot.datetime)}
                                                            disabled={!isAvailable}
                                                            className={`py-3.5 rounded-xl text-sm font-medium transition-all relative ${
                                                                !isAvailable
                                                                    ? 'bg-secondary/30 text-muted-foreground/40 cursor-not-allowed line-through'
                                                                    : isSelected
                                                                        ? 'gold-gradient text-primary-foreground'
                                                                        : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                                                            }`}
                                                        >
                                                            {slot.label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* ════════════════ STEP 4: Therapist ════════════════ */}
                                {step === 4 && (
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-3 mb-2">
                                            <p className="text-sm text-muted-foreground flex-1">{t.booking.selectTherapist}</p>
                                            {/* Gender filter */}
                                            <div className="flex gap-1.5">
                                                {['all', 'male', 'female'].map((g) => (
                                                    <button
                                                        key={g}
                                                        onClick={() => setGenderFilter(g)}
                                                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                                            genderFilter === g
                                                                ? 'gold-gradient text-primary-foreground'
                                                                : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                                                        }`}
                                                    >
                                                        {g === 'all' ? 'All' : g === 'male' ? 'Male' : 'Female'}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {loadingTherapists ? (
                                            <div className="flex items-center justify-center py-16">
                                                <Loader2 className="w-6 h-6 animate-spin text-gold" />
                                                <span className="ml-3 text-sm text-muted-foreground">Finding available therapists...</span>
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                {filteredTherapists.map((therapist) => {
                                                    const isSelected  = selectedTherapist?.id === therapist.id;
                                                    const isAvailable = therapist.available;
                                                    return (
                                                        <button
                                                            key={therapist.id}
                                                            onClick={() => isAvailable && setSelectedTherapist(therapist)}
                                                            disabled={!isAvailable}
                                                            className={`glass-card p-4 text-start transition-all ${
                                                                !isAvailable
                                                                    ? 'opacity-50 cursor-not-allowed'
                                                                    : isSelected
                                                                        ? 'ring-2 ring-gold'
                                                                        : 'hover:bg-secondary/40'
                                                            }`}
                                                        >
                                                            <div className="flex items-start gap-3">
                                                                {/* Avatar */}
                                                                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                                                                    isAvailable ? 'gold-gradient text-primary-foreground' : 'bg-secondary text-muted-foreground'
                                                                }`}>
                                                                    {therapist.avatar}
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <h4 className="font-display font-semibold text-sm">{therapist.name}</h4>
                                                                    <p className="text-xs text-muted-foreground truncate">{therapist.specialty}</p>
                                                                    <div className="flex items-center gap-2 mt-1">
                                                                        <Star className="w-3 h-3 text-gold fill-gold" />
                                                                        <span className="text-xs font-medium">{therapist.rating}</span>
                                                                        <span className="text-[10px] text-muted-foreground">{therapist.experience} yrs</span>
                                                                        <span className="text-[10px] text-muted-foreground">
                                                                            {therapist.gender === 'male' ? '♂' : '♀'}
                                                                        </span>
                                                                    </div>
                                                                    {/* Availability indicator */}
                                                                    {isAvailable ? (
                                                                        <span className="text-[10px] text-emerald-400 font-medium mt-1 block">● Available</span>
                                                                    ) : (
                                                                        <span className="text-[10px] text-destructive font-medium mt-1 block">
                                                                            ● Booked
                                                                            {therapist.next_available && ` · Next: ${therapist.next_available}`}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* ════════════════ STEP 5: Payment ════════════════ */}
                                {step === 5 && (
                                    <div className="space-y-4">

                                        {/* Booking Summary */}
                                        <div className="glass-card p-5">
                                            <h4 className="font-display font-semibold text-sm mb-4 gold-text">
                                                {locale === 'ar' ? 'ملخص الحجز' : 'Booking Summary'}
                                            </h4>
                                            <div className="space-y-3">
                                                {[
                                                    {
                                                        label: locale === 'ar' ? 'الخدمة'          : 'Service',
                                                        value: selectedService?.name,
                                                        sub:   `${selectedService?.duration_minutes} min`,
                                                    },
                                                    {
                                                        label: locale === 'ar' ? 'المعالج'         : 'Therapist',
                                                        value: selectedTherapist?.name,
                                                        sub:   selectedTherapist?.specialty,
                                                    },
                                                    {
                                                        label: locale === 'ar' ? 'التاريخ والوقت' : 'Date & Time',
                                                        value: formattedDate,
                                                        sub:   selectedTime ? new Date(`2000-01-01T${selectedTime}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : null,
                                                    },
                                                    {
                                                        label: locale === 'ar' ? 'الموقع'          : 'Location',
                                                        value: selectedAddress?.label,
                                                        sub:   selectedAddress?.address,
                                                    },
                                                ].map(({ label, value, sub }) => (
                                                    <div key={label} className="flex justify-between items-start gap-4 text-sm">
                                                        <span className="text-muted-foreground flex-shrink-0">{label}</span>
                                                        <div className="text-right">
                                                            <p className="font-medium">{value ?? '—'}</p>
                                                            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
                                                        </div>
                                                    </div>
                                                ))}
                                                <div className="border-t border-white/8 pt-3 flex justify-between items-center">
                                                    <span className="text-sm text-muted-foreground">
                                                        {locale === 'ar' ? 'الإجمالي' : 'Total'}
                                                    </span>
                                                    <span className="font-display font-bold gold-text text-lg">
                                                        AED {selectedService?.price}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Payment Methods */}
                                        <div className="space-y-3">
                                            {PAYMENT_METHODS.map((method) => {
                                                const Icon     = method.icon;
                                                const isActive = selectedPayment === method.id;
                                                return (
                                                    <button
                                                        key={method.id}
                                                        onClick={() => setSelectedPayment(method.id)}
                                                        className={`w-full glass-card p-4 flex items-center gap-4 text-start transition-all ${
                                                            isActive ? 'ring-2 ring-gold' : 'hover:bg-secondary/40'
                                                        }`}
                                                    >
                                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                                                            isActive ? 'gold-gradient' : 'bg-secondary'
                                                        }`}>
                                                            <Icon className={`w-5 h-5 ${isActive ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-sm font-semibold font-display">{method.label}</span>
                                                                <span className="text-xs text-muted-foreground">{method.sub}</span>
                                                            </div>
                                                            <p className="text-xs text-muted-foreground mt-0.5">{method.desc}</p>
                                                        </div>
                                                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                                                            isActive ? 'border-gold' : 'border-white/20'
                                                        }`}>
                                                            {isActive && <div className="w-2.5 h-2.5 rounded-full gold-gradient" />}
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* ── Nav Buttons ── */}
                    {!isConfirmed && (
                        <div className="flex items-center gap-3 mt-6 mb-8">
                            {step > 1 && (
                                <button
                                    onClick={() => setStep(step - 1)}
                                    className="btn-ghost-gold flex items-center gap-1"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                    {t.booking.back}
                                </button>
                            )}
                            <div className="flex-1" />
                            {step < TOTAL_STEPS ? (
                                <button
                                    onClick={() => setStep(step + 1)}
                                    disabled={!canProceed()}
                                    className="btn-gold disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    {t.booking.next}
                                </button>
                            ) : (
                                <button
                                    onClick={handleConfirm}
                                    disabled={!canProceed() || isSubmitting}
                                    className="btn-gold flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                                    {isSubmitting ? t.booking.confirmingBooking : t.booking.confirm}
                                </button>
                            )}
                        </div>
                    )}
                </main>
            </div>
        </AuthenticatedLayout>
    );
}