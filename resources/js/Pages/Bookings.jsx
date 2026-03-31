import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ChevronLeft, Star, Loader2, Check, Clock,
    Banknote, CreditCard, MapPin, Home, Building2, Hotel,
    AlertCircle, Upload
} from 'lucide-react';
import { Calendar } from '@/Components/ui/calendar';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';

const PAYMENT_METHODS = [
    { id: 'cash',     label: 'Cash',     sub: 'Pay on arrival', desc: 'Pay directly to the therapist in cash', icon: Banknote  },
    { id: 'cashless', label: 'Cashless', sub: 'Card / App',     desc: 'Pay by card or mobile app',            icon: CreditCard },
];

const LOCATION_ICONS = { Home, Office: Building2, Hotel };

async function apiFetch(url) {
    const res = await fetch(url, {
        headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'same-origin',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

// ── Fix timezone issue — get local date string YYYY-MM-DD ─────────────────────
function toLocalDateString(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export default function Bookings() {
    const { t: translations } = useLanguage();
    const t = translations.booking;

    const [step, setStep] = useState(1);

    const [selectedGroup,     setSelectedGroup]     = useState(null);
    const [selectedService,   setSelectedService]   = useState(null);
    const [selectedTherapist, setSelectedTherapist] = useState(null);
    const [selectedAddress,   setSelectedAddress]   = useState(null);
    const [selectedDate,      setSelectedDate]      = useState(undefined);
    const [selectedTime,      setSelectedTime]      = useState(null);
    const [selectedPayment,   setSelectedPayment]   = useState(null);

    const [services,       setServices]       = useState([]);
    const [addresses,      setAddresses]      = useState([]);
    const [therapists,     setTherapists]     = useState([]);
    const [availableSlots, setAvailableSlots] = useState([]);

    const [loadingServices,   setLoadingServices]   = useState(false);
    const [loadingAddresses,  setLoadingAddresses]  = useState(false);
    const [loadingTherapists, setLoadingTherapists] = useState(false);
    const [loadingSlots,      setLoadingSlots]      = useState(false);
    const [isSubmitting,      setIsSubmitting]      = useState(false);
    const [isConfirmed,       setIsConfirmed]       = useState(false);
    const [error,             setError]             = useState(null);
    const [proofFile,         setProofFile]         = useState(null);
    const [genderFilter,      setGenderFilter]      = useState('all');

    const TOTAL_STEPS = 5;
    const stepLabels  = [t.stepService, t.stepTherapist, t.stepDateLocation, t.stepTime, t.stepPayment];

    useEffect(() => {
        setLoadingServices(true);
        apiFetch('/api/services')
            .then(setServices)
            .catch(() => setError('Failed to load services.'))
            .finally(() => setLoadingServices(false));
    }, []);

    useEffect(() => {
        setLoadingAddresses(true);
        apiFetch('/api/addresses')
            .then((data) => {
                setAddresses(data);
                const def = data.find(a => a.is_default);
                if (def) setSelectedAddress(def);
            })
            .catch(() => setError('Failed to load addresses.'))
            .finally(() => setLoadingAddresses(false));
    }, []);

    useEffect(() => {
        if (step !== 2) return;
        setLoadingTherapists(true);
        setTherapists([]);
        setSelectedTherapist(null);
        apiFetch('/api/therapists')
            .then(setTherapists)
            .catch(() => setError('Failed to load therapists.'))
            .finally(() => setLoadingTherapists(false));
    }, [step]);

    // ── Step 4: Fetch available slots ─────────────────────────────────────────
    useEffect(() => {
        if (step !== 4 || !selectedService || !selectedAddress || !selectedDate || !selectedTherapist) return;

        // ── FIX: Use local date string to avoid timezone offset ───────────────
        const date = toLocalDateString(selectedDate);

        setLoadingSlots(true);
        setAvailableSlots([]);
        setSelectedTime(null);

        apiFetch(
            `/api/available-slots` +
            `?service_id=${selectedService.id}` +
            `&zone_name=${encodeURIComponent(selectedAddress.zone_name)}` +
            `&date=${date}` +
            `&therapist_id=${selectedTherapist.id}`
        )
            .then(data => {
                if (data.day_off) {
                    setError(t.slotUnavailable);
                    setAvailableSlots([]);
                } else {
                    setAvailableSlots(data.slots ?? []);
                }
            })
            .catch(() => setError('Failed to load available slots.'))
            .finally(() => setLoadingSlots(false));
    }, [step, selectedTherapist?.id, selectedDate?.toDateString(), selectedAddress?.id, selectedAddress?.zone_name]);

    const canProceed = () => {
        if (step === 1) return !!selectedService;
        if (step === 2) return !!selectedTherapist;
        if (step === 3) return !!selectedAddress && !!selectedDate;
        if (step === 4) return !!selectedTime;
        if (step === 5) return !!selectedPayment && !!proofFile;
        return false;
    };

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
                    datetime:       selectedTime,
                    payment_method: selectedPayment,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.message ?? 'Booking failed.');
            }

            const bookingData = await res.json();

            const formData = new FormData();
            formData.append('booking_id', bookingData.booking.id);
            formData.append('proof', proofFile);

            const proofRes = await fetch('/api/downpayment/upload-proof', {
                method:      'POST',
                credentials: 'same-origin',
                headers: {
                    'Accept':           'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-XSRF-TOKEN':     decodeURIComponent(csrfToken ?? ''),
                },
                body: formData,
            });

            if (!proofRes.ok) throw new Error('Failed to upload payment proof.');

            setIsConfirmed(true);
        } catch (err) {
            setError(err.message);
        } finally {
            setIsSubmitting(false);
        }
    }, [selectedService, selectedTherapist, selectedAddress, selectedTime, selectedPayment, proofFile]);

    const formattedDate = selectedDate
        ? selectedDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
        : null;

    const filteredTherapists = therapists.filter(th =>
        genderFilter === 'all' || th.gender === genderFilter
    );

    return (
        <AuthenticatedLayout>
            <div className="min-h-screen bg-background">

                {/* ── Header / Stepper ── */}
                <header className="sticky top-0 z-40 glass-card-strong rounded-none border-x-0 border-t-0 px-5 pt-[env(safe-area-inset-top)] pb-4">
                    <div className="pt-3 max-w-4xl mx-auto">
                        <motion.h1 initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="font-display text-xl font-bold">
                            {t.title}
                        </motion.h1>
                        <div className="flex items-center gap-1.5 mt-3 overflow-x-auto scrollbar-hide">
                            {stepLabels.map((label, i) => (
                                <div key={i} className="flex items-center gap-1.5 flex-shrink-0">
                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                                        step > i + 1   ? 'gold-gradient text-primary-foreground' :
                                        step === i + 1 ? 'border-2 border-gold text-gold' :
                                                         'bg-secondary text-muted-foreground'
                                    }`}>
                                        {step > i + 1 ? <Check className="w-3.5 h-3.5" /> : i + 1}
                                    </div>
                                    <span className={`text-xs hidden sm:inline whitespace-nowrap ${step === i + 1 ? 'text-gold font-medium' : 'text-muted-foreground'}`}>
                                        {label}
                                    </span>
                                    {i < TOTAL_STEPS - 1 && (
                                        <div className={`w-5 sm:w-8 h-px transition-all ${step > i + 1 ? 'bg-gold/60' : 'bg-border'}`} />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </header>

                <main className="px-6 pt-5 pb-10 max-w-6xl mx-auto">

                    {error && (
                        <div className="flex items-center gap-3 p-4 mb-4 bg-destructive/10 border border-destructive/30 rounded-xl text-sm text-destructive">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            {error}
                            <button onClick={() => setError(null)} className="ml-auto text-xs underline">{t.dismiss}</button>
                        </div>
                    )}

                    <AnimatePresence mode="wait">
                        {isConfirmed ? (
                            <motion.div key="confirmed" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="glass-card p-8 text-center mt-8">
                                <div className="w-16 h-16 rounded-full gold-gradient flex items-center justify-center mx-auto mb-4">
                                    <Check className="w-8 h-8 text-primary-foreground" />
                                </div>
                                <h2 className="font-display text-xl font-bold mb-2">{t.bookingConfirmed}</h2>
                                <p className="text-muted-foreground text-sm mb-1">{selectedService?.name} • {selectedTherapist?.name}</p>
                                <p className="text-muted-foreground text-xs">
                                    {formattedDate} •{' '}
                                    {selectedTime && new Date(selectedTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                                </p>
                                <p className="text-xs text-gold mt-2">{selectedAddress?.label} — {selectedAddress?.address}</p>
                                <p className="text-xs text-muted-foreground mt-4">{t.waitingConfirm}</p>
                            </motion.div>
                        ) : (
                            <motion.div key={step} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.25 }}>

                                {/* ════════ STEP 1: Service ════════ */}
                                {step === 1 && (
                                    <div className="space-y-6">
                                        <p className="text-sm mb-2" style={{ color: '#94a3b8' }}>{t.selectService}</p>
                                        {loadingServices ? (
                                            <div className="flex items-center justify-center py-16">
                                                <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#e2b764' }} />
                                            </div>
                                        ) : (
                                            <>
                                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                                    {services.map((group) => {
                                                        const isActive = selectedGroup?.group_name === group.group_name;
                                                        return (
                                                            <button key={group.group_name}
                                                                onClick={() => { setSelectedGroup(isActive ? null : group); setSelectedService(null); }}
                                                                className="relative p-5 rounded-2xl border text-start transition-all"
                                                                style={{ borderColor: isActive ? '#e2b764' : '#1e2740', background: isActive ? 'rgba(226,183,100,0.08)' : '#0f1629' }}
                                                                onMouseEnter={e => { if (!isActive) { e.currentTarget.style.borderColor = '#2a3a5c'; e.currentTarget.style.background = '#141d33'; }}}
                                                                onMouseLeave={e => { if (!isActive) { e.currentTarget.style.borderColor = '#1e2740'; e.currentTarget.style.background = '#0f1629'; }}}
                                                            >
                                                                {isActive && (
                                                                    <div className="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: '#e2b764' }}>
                                                                        <Check className="w-3 h-3" style={{ color: '#0b1120' }} />
                                                                    </div>
                                                                )}
                                                                <h4 className="font-display font-semibold text-base text-white mb-3 pr-6">{group.group_name}</h4>
                                                                <div className="flex flex-wrap gap-1.5 mb-4">
                                                                    {group.durations.map(d => (
                                                                        <span key={d.id} className="text-[10px] px-2.5 py-1 rounded-full font-medium" style={{ background: '#141d33', color: '#94a3b8' }}>
                                                                            {d.duration_minutes} {t.minutes_suffix}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                                <div className="flex items-center justify-between">
                                                                    <span className="text-[11px]" style={{ color: '#64748b' }}>{t.from}</span>
                                                                    <span className="font-display font-bold text-base" style={{ color: '#e2b764' }}>AED {Number(group.min_price).toLocaleString()}</span>
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>

                                                {selectedGroup && (
                                                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border p-5" style={{ borderColor: '#1e2740', background: '#080d1a' }}>
                                                        <p className="text-sm font-medium text-white mb-4">Choose duration — <span style={{ color: '#e2b764' }}>{selectedGroup.group_name}</span></p>
                                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                                            {selectedGroup.durations.map(duration => {
                                                                const isSelected = selectedService?.id === duration.id;
                                                                return (
                                                                    <button key={duration.id}
                                                                        onClick={() => setSelectedService({ ...duration, name: `${selectedGroup.group_name} ${duration.duration_minutes} min`, group_name: selectedGroup.group_name })}
                                                                        className="relative p-4 rounded-xl border text-start transition-all"
                                                                        style={{ borderColor: isSelected ? '#e2b764' : '#1e2740', background: isSelected ? 'rgba(226,183,100,0.1)' : '#0f1629' }}
                                                                        onMouseEnter={e => { if (!isSelected) { e.currentTarget.style.borderColor = '#2a3a5c'; e.currentTarget.style.background = '#141d33'; }}}
                                                                        onMouseLeave={e => { if (!isSelected) { e.currentTarget.style.borderColor = '#1e2740'; e.currentTarget.style.background = '#0f1629'; }}}
                                                                    >
                                                                        {isSelected && (
                                                                            <div className="absolute top-3 right-3 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: '#e2b764' }}>
                                                                                <Check className="w-2.5 h-2.5" style={{ color: '#0b1120' }} />
                                                                            </div>
                                                                        )}
                                                                        <div className="flex items-center gap-2 mb-2">
                                                                            <Clock className="w-4 h-4" style={{ color: '#e2b764' }} />
                                                                            <span className="text-base font-display font-bold text-white">{duration.duration_minutes} {t.minutes_suffix}</span>
                                                                        </div>
                                                                        <p className="text-lg font-display font-bold" style={{ color: '#e2b764' }}>AED {Number(duration.price).toLocaleString()}</p>
                                                                        <div className="flex items-center gap-1 mt-2">
                                                                            {[1,2,3,4,5].map(s => (
                                                                                <Star key={s} size={10} style={{ color: Number(duration.rating) > 0 ? '#e2b764' : '#1e2740', fill: Number(duration.rating) > 0 ? '#e2b764' : '#1e2740' }} />
                                                                            ))}
                                                                            <span className="text-[10px] ml-1" style={{ color: '#64748b' }}>{Number(duration.rating) > 0 ? duration.rating : t.new_rating}</span>
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

                                {/* ════════ STEP 2: Therapist ════════ */}
                                {step === 2 && (
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-3 mb-2">
                                            <p className="text-sm text-muted-foreground flex-1">{t.selectTherapist}</p>
                                            <div className="flex gap-1.5">
                                                {['all', 'male', 'female'].map((g) => (
                                                    <button key={g} onClick={() => setGenderFilter(g)}
                                                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${genderFilter === g ? 'gold-gradient text-primary-foreground' : 'bg-secondary text-muted-foreground hover:bg-secondary/80'}`}>
                                                        {g === 'all' ? t.genderAll : g === 'male' ? t.genderMale : t.genderFemale}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        {loadingTherapists ? (
                                            <div className="flex items-center justify-center py-16">
                                                <Loader2 className="w-6 h-6 animate-spin text-gold" />
                                                <span className="ml-3 text-sm text-muted-foreground">{t.findingTherapists}</span>
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                {filteredTherapists.map((therapist) => {
                                                    const isSelected = selectedTherapist?.id === therapist.id;
                                                    return (
                                                        <button key={therapist.id} onClick={() => setSelectedTherapist(therapist)}
                                                            className={`glass-card p-4 text-start transition-all ${isSelected ? 'ring-2 ring-gold' : 'hover:bg-secondary/40'}`}>
                                                            <div className="flex items-start gap-3">
                                                                <div className="w-12 h-12 rounded-full gold-gradient flex items-center justify-center text-sm font-bold flex-shrink-0 text-primary-foreground">
                                                                    {therapist.avatar ?? therapist.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <h4 className="font-display font-semibold text-sm">{therapist.name}</h4>
                                                                    <p className="text-xs text-muted-foreground truncate">{therapist.specialty}</p>
                                                                    <div className="flex items-center gap-2 mt-1">
                                                                        <Star className="w-3 h-3 text-gold fill-gold" />
                                                                        <span className="text-xs font-medium">{therapist.rating}</span>
                                                                        <span className="text-[10px] text-muted-foreground">{therapist.experience_years} yrs</span>
                                                                        <span className="text-[10px] text-muted-foreground">{therapist.gender === 'male' ? '♂' : '♀'}</span>
                                                                    </div>
                                                                    {therapist.day_off && <p className="text-[10px] text-muted-foreground mt-1">Day off: {therapist.day_off}</p>}
                                                                </div>
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* ════════ STEP 3: Date & Location ════════ */}
                                {step === 3 && (
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5" style={{ alignItems: 'stretch' }}>
                                        <div className="glass-card p-5 flex flex-col">
                                            <h4 className="font-display font-semibold text-base mb-2">{t.chooseDate}</h4>
                                            <Calendar mode="single" selected={selectedDate} onSelect={setSelectedDate}
                                                disabled={(date) => {
                                                    const today = new Date(); today.setHours(0, 0, 0, 0);
                                                    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
                                                    return date < today || dayName === selectedTherapist?.day_off;
                                                }}
                                                className={cn('pointer-events-auto w-full')} />
                                        </div>
                                        <div className="glass-card p-5 flex flex-col">
                                            <h4 className="font-display font-semibold text-base mb-4">{t.location}</h4>
                                            {loadingAddresses ? (
                                                <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-gold" /></div>
                                            ) : addresses.length === 0 ? (
                                                <div className="flex flex-col items-center justify-center py-10 gap-3">
                                                    <MapPin className="w-8 h-8 text-muted-foreground" />
                                                    <p className="text-sm text-muted-foreground text-center">{t.noAddresses}</p>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col gap-3 flex-1 justify-around">
                                                    {addresses.map((addr) => {
                                                        const isActive = selectedAddress?.id === addr.id;
                                                        const Icon = LOCATION_ICONS[addr.label] ?? MapPin;
                                                        return (
                                                            <button key={addr.id} onClick={() => setSelectedAddress(addr)}
                                                                className={`w-full flex items-center gap-4 p-4 rounded-xl text-start transition-all border ${isActive ? 'bg-gold/10 border-gold/40' : 'bg-secondary border-transparent hover:bg-secondary/80'}`}>
                                                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${isActive ? 'border-gold' : 'border-muted-foreground/40'}`}>
                                                                    {isActive && <div className="w-2.5 h-2.5 rounded-full gold-gradient" />}
                                                                </div>
                                                                <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-gold' : 'text-muted-foreground'}`} />
                                                                <div className="flex-1 min-w-0">
                                                                    <p className={`text-sm font-semibold ${isActive ? 'gold-text' : ''}`}>
                                                                        {addr.label}
                                                                        {addr.is_default && <span className="ml-2 text-[10px] text-muted-foreground font-normal">Default</span>}
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

                                {/* ════════ STEP 4: Time ════════ */}
                                {step === 4 && (
                                    <div className="glass-card p-7">
                                        <p className="text-xs text-muted-foreground mb-1">
                                            {formattedDate} • {selectedAddress?.label} • {selectedTherapist?.name}
                                        </p>
                                        <h4 className="font-display font-semibold text-lg mb-6">When would you like your session?</h4>

                                        {loadingSlots ? (
                                            <div className="flex items-center justify-center py-16">
                                                <Loader2 className="w-6 h-6 animate-spin text-gold" />
                                                <span className="ml-3 text-sm text-muted-foreground">{t.checkingAvail}</span>
                                            </div>
                                        ) : (() => {
                                            // ── Use s.time (HH:MM) to avoid timezone issues ───────
                                            const evening   = availableSlots.filter(s => parseInt(s.time.split(':')[0]) >= 16);
                                            const lateNight = availableSlots.filter(s => parseInt(s.time.split(':')[0]) < 16);

                                            const SlotButton = ({ slot }) => {
                                                const isSelected  = selectedTime === slot.datetime;
                                                const isAvailable = slot.available;
                                                let btnClass = 'rounded-xl transition-all flex flex-col items-center justify-center gap-1.5 py-3 px-2 text-sm font-medium';
                                                let btnStyle = {};
                                                if (isSelected) {
                                                    btnClass += ' cursor-pointer';
                                                    btnStyle = { background: 'linear-gradient(135deg,#e2b764,#c9963f)', border: '1.5px solid transparent', color: '#0b1120' };
                                                } else if (isAvailable) {
                                                    btnClass += ' cursor-pointer';
                                                    btnStyle = { background: '#111827', border: '1.5px solid #1e293b', color: '#94a3b8' };
                                                } else {
                                                    btnClass += ' cursor-not-allowed';
                                                    btnStyle = { background: '#0a0e1a', border: '1.5px solid #0f172a', color: '#1e293b' };
                                                }
                                                const dotColor = isSelected ? '#92400e' : isAvailable ? '#1d4ed8' : '#0f172a';
                                                return (
                                                    <button key={slot.datetime} onClick={() => isAvailable && setSelectedTime(slot.datetime)} disabled={!isAvailable}
                                                        className={btnClass} style={btnStyle}
                                                        onMouseEnter={e => { if (isAvailable && !isSelected) { e.currentTarget.style.borderColor = '#e2b764'; e.currentTarget.style.color = '#e2b764'; }}}
                                                        onMouseLeave={e => { if (isAvailable && !isSelected) { e.currentTarget.style.borderColor = '#1e293b'; e.currentTarget.style.color = '#94a3b8'; }}}
                                                    >
                                                        <span>{slot.label}</span>
                                                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: dotColor }} />
                                                    </button>
                                                );
                                            };

                                            return (
                                                <div className="space-y-6">
                                                    {evening.length > 0 && (
                                                        <div>
                                                            <p className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: '#334155' }}>Evening</p>
                                                            <div className="grid grid-cols-4 gap-2">
                                                                {evening.map(slot => <SlotButton key={slot.datetime} slot={slot} />)}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {lateNight.length > 0 && (
                                                        <div>
                                                            <p className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: '#334155' }}>Late night</p>
                                                            <div className="grid grid-cols-4 gap-2">
                                                                {lateNight.map(slot => <SlotButton key={slot.datetime} slot={slot} />)}
                                                            </div>
                                                        </div>
                                                    )}
                                                    <div className="flex items-center gap-5 pt-4 flex-wrap" style={{ borderTop: '1px solid #0f172a' }}>
                                                        {[
                                                            { dot: '#1d4ed8', label: 'Available' },
                                                            { dot: '#0f172a', label: 'Unavailable', border: '1px solid #1e293b' },
                                                            { dot: '#92400e', label: 'Selected' },
                                                        ].map(({ dot, label, border }) => (
                                                            <div key={label} className="flex items-center gap-2">
                                                                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dot, border }} />
                                                                <span className="text-[11px] text-muted-foreground">{label}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                )}

                                {/* ════════ STEP 5: Payment ════════ */}
                                {step === 5 && (
                                    <div className="space-y-4">
                                        <div className="glass-card p-5">
                                            <h4 className="font-display font-semibold text-sm mb-4 gold-text">{t.summary}</h4>
                                            <div className="space-y-3">
                                                {[
                                                    { label: t.summaryService,   value: selectedService?.name,      sub: selectedService?.duration_minutes ? `${selectedService.duration_minutes} ${t.minutes_suffix}` : null },
                                                    { label: t.summaryTherapist, value: selectedTherapist?.name,    sub: selectedTherapist?.specialty },
                                                    { label: t.summaryDateTime,  value: formattedDate,              sub: selectedTime ? new Date(selectedTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : null },
                                                    { label: t.summaryLocation,  value: selectedAddress?.label,     sub: selectedAddress?.address },
                                                ].map(({ label, value, sub }) => (
                                                    <div key={label} className="flex justify-between items-start gap-4 text-sm">
                                                        <span className="text-muted-foreground flex-shrink-0">{label}</span>
                                                        <div className="text-right">
                                                            <p className="font-medium">{value ?? '—'}</p>
                                                            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
                                                        </div>
                                                    </div>
                                                ))}
                                                <div className="border-t border-white/8 pt-3 space-y-2">
                                                    <div className="flex justify-between items-center text-sm">
                                                        <span className="text-muted-foreground">{t.summaryTotal}</span>
                                                        <span className="font-medium">AED {Number(selectedService?.price).toLocaleString()}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-sm">
                                                        <span className="flex items-center gap-1.5 text-muted-foreground">
                                                            20% Downpayment
                                                            <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(226,183,100,0.15)', color: '#e2b764' }}>Required</span>
                                                        </span>
                                                        <span className="font-display font-bold gold-text">AED {(Number(selectedService?.price) * 0.20).toFixed(2)}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-sm">
                                                        <span className="text-muted-foreground">Remaining (pay on session)</span>
                                                        <span className="font-medium">AED {(Number(selectedService?.price) * 0.80).toFixed(2)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="rounded-2xl border p-5 space-y-4" style={{ borderColor: 'rgba(226,183,100,0.2)', background: 'rgba(226,183,100,0.04)' }}>
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#e2b764' }}>
                                                    <span className="text-[10px] font-black" style={{ color: '#0b1120' }}>!</span>
                                                </div>
                                                <h4 className="font-display font-semibold text-sm text-white">Downpayment Required</h4>
                                            </div>
                                            <p className="text-xs leading-relaxed" style={{ color: '#94a3b8' }}>
                                                A 20% downpayment is required to confirm your booking. Please transfer <span className="font-bold text-white">AED {(Number(selectedService?.price) * 0.20).toFixed(2)}</span> to the account below and upload your payment screenshot.
                                            </p>
                                            <div className="rounded-xl p-4 space-y-2.5" style={{ background: '#0a0f1e', border: '1px solid #1e2740' }}>
                                                <p className="text-[10px] uppercase tracking-wider font-semibold mb-3" style={{ color: '#64748b' }}>Bank Transfer Details</p>
                                                {[
                                                    { label: 'Bank',         value: 'Emirates NBD' },
                                                    { label: 'Account Name', value: 'Infinity Home Spa' },
                                                    { label: 'Account No.',  value: 'XXXX-XXXX-XXXX' },
                                                    { label: 'IBAN',         value: 'AE00 0000 0000 0000 0000 000' },
                                                    { label: 'Reference',    value: 'IHS-[your booking ID]' },
                                                ].map(({ label, value }) => (
                                                    <div key={label} className="flex justify-between items-start gap-4">
                                                        <span className="text-[11px] flex-shrink-0" style={{ color: '#64748b' }}>{label}</span>
                                                        <span className="text-[11px] font-semibold text-right" style={{ color: label === 'Reference' ? '#e2b764' : '#e2e8f0' }}>{value}</span>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="rounded-xl p-3 space-y-1.5" style={{ background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.15)' }}>
                                                <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: '#f87171' }}>Cancellation Policy</p>
                                                <p className="text-[11px]" style={{ color: '#94a3b8' }}>• Cancel <span className="text-white font-medium">before 24hrs</span> → Full refund ✅</p>
                                                <p className="text-[11px]" style={{ color: '#94a3b8' }}>• Cancel <span className="text-white font-medium">within 24hrs</span> → Downpayment forfeited ❌</p>
                                                <p className="text-[11px]" style={{ color: '#94a3b8' }}>• No-show → Downpayment forfeited ❌</p>
                                            </div>
                                        </div>

                                        <div className="glass-card p-5">
                                            <h4 className="font-display font-semibold text-sm mb-1 text-white">Upload Payment Screenshot</h4>
                                            <p className="text-xs mb-4" style={{ color: '#64748b' }}>JPG, JPEG, or PNG only • Max 5MB</p>
                                            <label className="flex flex-col items-center justify-center gap-3 p-6 rounded-xl border-2 border-dashed cursor-pointer transition-all"
                                                style={{ borderColor: proofFile ? '#e2b764' : '#1e2740', background: proofFile ? 'rgba(226,183,100,0.05)' : 'transparent' }}
                                                onMouseEnter={e => { if (!proofFile) e.currentTarget.style.borderColor = '#2a3a5c'; }}
                                                onMouseLeave={e => { if (!proofFile) e.currentTarget.style.borderColor = '#1e2740'; }}
                                            >
                                                <input type="file" accept="image/jpg,image/jpeg,image/png" className="hidden" onChange={e => setProofFile(e.target.files?.[0] ?? null)} />
                                                {proofFile ? (
                                                    <>
                                                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(226,183,100,0.15)' }}>
                                                            <Check className="w-5 h-5" style={{ color: '#e2b764' }} />
                                                        </div>
                                                        <div className="text-center">
                                                            <p className="text-sm font-medium text-white">{proofFile.name}</p>
                                                            <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>{(proofFile.size / 1024 / 1024).toFixed(2)} MB</p>
                                                        </div>
                                                        <button type="button" onClick={e => { e.preventDefault(); setProofFile(null); }} className="text-xs px-3 py-1 rounded-lg" style={{ background: 'rgba(248,113,113,0.1)', color: '#f87171' }}>Remove</button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#141d33' }}>
                                                            <Upload className="w-5 h-5" style={{ color: '#64748b' }} />
                                                        </div>
                                                        <div className="text-center">
                                                            <p className="text-sm font-medium" style={{ color: '#94a3b8' }}>Click to upload screenshot</p>
                                                            <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>JPG, JPEG, PNG up to 5MB</p>
                                                        </div>
                                                    </>
                                                )}
                                            </label>
                                        </div>

                                        <div className="glass-card p-5">
                                            <h4 className="font-display font-semibold text-sm mb-1 text-white">Session Payment</h4>
                                            <p className="text-xs mb-4" style={{ color: '#64748b' }}>How will you pay the remaining AED {(Number(selectedService?.price) * 0.80).toFixed(2)} on session day?</p>
                                            <div className="space-y-3">
                                                {PAYMENT_METHODS.map((method) => {
                                                    const Icon = method.icon;
                                                    const isActive = selectedPayment === method.id;
                                                    return (
                                                        <button key={method.id} onClick={() => setSelectedPayment(method.id)}
                                                            className={`w-full glass-card p-4 flex items-center gap-4 text-start transition-all ${isActive ? 'ring-2 ring-gold' : 'hover:bg-secondary/40'}`}>
                                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${isActive ? 'gold-gradient' : 'bg-secondary'}`}>
                                                                <Icon className={`w-5 h-5 ${isActive ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-sm font-semibold font-display">{method.label}</span>
                                                                    <span className="text-xs text-muted-foreground">{method.sub}</span>
                                                                </div>
                                                                <p className="text-xs text-muted-foreground mt-0.5">{method.desc}</p>
                                                            </div>
                                                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${isActive ? 'border-gold' : 'border-white/20'}`}>
                                                                {isActive && <div className="w-2.5 h-2.5 rounded-full gold-gradient" />}
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                )}

                            </motion.div>
                        )}
                    </AnimatePresence>

                    {!isConfirmed && (
                        <div className="flex items-center gap-3 mt-6 mb-8">
                            {step > 1 && (
                                <button onClick={() => setStep(step - 1)} className="btn-ghost-gold flex items-center gap-1">
                                    <ChevronLeft className="w-4 h-4" /> {t.back}
                                </button>
                            )}
                            <div className="flex-1" />
                            {step < TOTAL_STEPS ? (
                                <button onClick={() => setStep(step + 1)} disabled={!canProceed()} className="btn-gold disabled:opacity-40 disabled:cursor-not-allowed">
                                    {t.next}
                                </button>
                            ) : (
                                <button onClick={handleConfirm} disabled={!canProceed() || isSubmitting} className="btn-gold flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
                                    {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                                    {isSubmitting ? t.confirmingBooking : t.confirm}
                                </button>
                            )}
                        </div>
                    )}
                </main>
            </div>
        </AuthenticatedLayout>
    );
}