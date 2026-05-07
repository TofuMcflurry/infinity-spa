import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { router } from '@inertiajs/react';
import {
    ChevronLeft, Star, Loader2, Check, Clock,
    Banknote, CreditCard, MapPin, Home, Building2, Hotel,
    AlertCircle, Upload, Copy, CheckCircle2, QrCode,
    Sparkles, X, ShieldCheck
} from 'lucide-react';
import { Calendar } from '@/Components/ui/calendar';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';

const PAYMENT_METHODS = [
    { id: 'cash',     label: 'Cash',     sub: 'Pay on arrival', desc: 'Pay directly to the therapist in cash', icon: Banknote  },
    { id: 'cashless', label: 'Cashless', sub: 'Card / App',     desc: 'Pay by card or mobile app',            icon: CreditCard },
];

const LOCATION_ICONS = { Home, Office: Building2, Hotel };

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

function toLocalDateString(date) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai' }).format(date);
}

// ── Copyable row component ────────────────────────────────────────────────────
function CopyRow({ label, value, highlight }) {
    const [copied, setCopied] = useState(false);
    const copy = () => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <div className="flex items-center justify-between py-2.5 border-b last:border-0" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <span className="text-xs" style={{ color: '#64748b' }}>{label}</span>
            <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-semibold" style={{ color: highlight ? '#e2b764' : '#e2e8f0' }}>{value}</span>
                <button onClick={copy}
                    className="w-5 h-5 rounded flex items-center justify-center transition-all"
                    style={{ background: copied ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.05)', color: copied ? '#10b981' : '#64748b' }}>
                    {copied ? <CheckCircle2 size={10} /> : <Copy size={10} />}
                </button>
            </div>
        </div>
    );
}

// ── Upload zone component ─────────────────────────────────────────────────────
function UploadZone({ file, onFile, onRemove }) {
    return (
        <div>
            {file ? (
                <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
                    className="relative rounded-2xl overflow-hidden border"
                    style={{ borderColor: 'rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.04)' }}>
                    <img src={URL.createObjectURL(file)} alt="Proof" className="w-full max-h-48 object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <CheckCircle2 size={14} style={{ color: '#10b981' }} />
                            <span className="text-xs font-medium text-white truncate max-w-[180px]">{file.name}</span>
                        </div>
                        <button onClick={onRemove}
                            className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ background: 'rgba(239,68,68,0.25)', color: '#ef4444' }}>
                            <X size={11} />
                        </button>
                    </div>
                </motion.div>
            ) : (
                <label className="flex flex-col items-center justify-center gap-3 p-7 rounded-2xl border-2 border-dashed cursor-pointer transition-all group"
                    style={{ borderColor: '#1e2740' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(226,183,100,0.4)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = '#1e2740'}>
                    <input type="file" accept="image/jpg,image/jpeg,image/png" className="hidden"
                        onChange={e => onFile(e.target.files?.[0] ?? null)} />
                    <div className="w-11 h-11 rounded-2xl flex items-center justify-center transition-all"
                        style={{ background: '#141d33', color: '#64748b' }}>
                        <Upload size={20} />
                    </div>
                    <div className="text-center">
                        <p className="text-sm font-medium text-white mb-0.5">Drop your screenshot here</p>
                        <p className="text-xs" style={{ color: '#64748b' }}>JPG, PNG · max 5MB</p>
                    </div>
                </label>
            )}
        </div>
    );
}

// ── Success screen ────────────────────────────────────────────────────────────
function SuccessScreen({ bookingId, serviceName, therapistName, datetime }) {
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
                        Booking Received
                    </p>
                    <h2 className="text-2xl font-display font-semibold text-white mb-2">
                        You're all set!
                    </h2>
                    <p className="text-sm mb-6 leading-relaxed" style={{ color: '#94a3b8' }}>
                        We've received your payment proof. Our team will verify within <strong className="text-white">30 minutes</strong> and confirm your booking.
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
                        { icon: ShieldCheck, color: '#3b82f6', text: 'Payment verification — within 30 mins' },
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
    const [bankDetails,    setBankDetails]    = useState(null);

    const [loadingServices,   setLoadingServices]   = useState(false);
    const [loadingAddresses,  setLoadingAddresses]  = useState(false);
    const [loadingTherapists, setLoadingTherapists] = useState(false);
    const [loadingSlots,      setLoadingSlots]      = useState(false);
    const [loadingBank,       setLoadingBank]       = useState(false);
    const [isSubmitting,      setIsSubmitting]      = useState(false);
    const [isConfirmed,       setIsConfirmed]       = useState(false);
    const [createdBookingId,  setCreatedBookingId]  = useState(null);
    const [error,             setError]             = useState(null);
    const [proofFile,         setProofFile]         = useState(null);
    const [genderFilter,      setGenderFilter]      = useState('all');
    const [paymentTab,        setPaymentTab]        = useState('bank');

    const TOTAL_STEPS = 5;
    const stepLabels  = [t.stepService, t.stepTherapist, t.stepDateLocation, t.stepTime, t.stepPayment];

    // ── Fetch services ────────────────────────────────────────────────────────
    useEffect(() => {
        setLoadingServices(true);
        apiFetch('/api/services')
            .then(setServices)
            .catch(() => setError('Failed to load services.'))
            .finally(() => setLoadingServices(false));
    }, []);

    // ── Fetch addresses ───────────────────────────────────────────────────────
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

    // ── Fetch therapists on step 2 ────────────────────────────────────────────
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

    // ── Fetch available slots on step 4 ───────────────────────────────────────
    useEffect(() => {
        if (step !== 4 || !selectedService || !selectedAddress || !selectedDate || !selectedTherapist) return;

        setLoadingSlots(true);
        setAvailableSlots([]);
        setSelectedTime(null);

        apiFetch(
            `/api/available-slots` +
            `?service_id=${selectedService.id}` +
            `&zone_name=${encodeURIComponent(selectedAddress.zone_name)}` +
            `&date=${toLocalDateString(selectedDate)}` +
            `&therapist_id=${selectedTherapist.id}`
        )
            .then(data => {
                if (data.day_off) {
                    setError(t.slotUnavailable);
                    setAvailableSlots([]);
                } else {
                    const slots = data.slots ?? [];
                    const todayDubai = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' });
                    const selectedDateDubai = selectedDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' });
                    const isToday = selectedDateDubai === todayDubai;
                    let filteredSlots = slots;
                    if (isToday) {
                        const nowDubai = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Dubai' }));
                        const minTime = new Date(nowDubai.getTime() + 2 * 60 * 60 * 1000);
                        filteredSlots = slots.filter(slot => {
                            const slotDubai = new Date(new Date(slot.datetime).toLocaleString('en-US', { timeZone: 'Asia/Dubai' }));
                            return slotDubai >= minTime;
                        });
                    }
                    setAvailableSlots(filteredSlots);
                }
            })
            .catch(() => setError('Failed to load available slots.'))
            .finally(() => setLoadingSlots(false));
    }, [step, selectedTherapist?.id, selectedDate?.toDateString(), selectedAddress?.id, selectedAddress?.zone_name]);

    // ── Fetch bank details when entering step 5 ───────────────────────────────
    useEffect(() => {
        if (step !== 5) return;
        setLoadingBank(true);
        apiFetch('/api/downpayment/bank-details')
            .then(setBankDetails)
            .catch(() => setError('Failed to load bank details.'))
            .finally(() => setLoadingBank(false));
    }, [step]);

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
            const csrfToken = getCsrf();

            // Step 1 — Create booking
            const res = await fetch('/api/bookings', {
                method:      'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type':     'application/json',
                    'Accept':           'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-XSRF-TOKEN':     csrfToken,
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
            const bookingId   = bookingData.booking.id;
            setCreatedBookingId(bookingId);

            // Step 2 — Upload proof
            const formData = new FormData();
            formData.append('booking_id', bookingId);
            formData.append('proof', proofFile);

            const proofRes = await fetch('/api/downpayment/upload-proof', {
                method:      'POST',
                credentials: 'same-origin',
                headers: {
                    'Accept':           'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-XSRF-TOKEN':     csrfToken,
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

    const formattedTime = selectedTime
        ? new Date(selectedTime).toLocaleTimeString('en-US', { timeZone: 'Asia/Dubai', hour: 'numeric', minute: '2-digit', hour12: true })
        : null;

    const filteredTherapists = therapists.filter(th =>
        genderFilter === 'all' || th.gender === genderFilter
    );

    const downpaymentAmt = selectedService ? (Number(selectedService.price) * 0.20).toFixed(2) : '0.00';
    const remainingAmt   = selectedService ? (Number(selectedService.price) * 0.80).toFixed(2) : '0.00';
    const getDisplayRating = (rating) => {
    const MIN_DISPLAY = 3.5;
    const actual = Number(rating) || 0;
        if (actual === 0) return MIN_DISPLAY;
        return Math.max(MIN_DISPLAY, actual);
    };

    
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

                        {/* ── Success Screen ── */}
                        {isConfirmed ? (
                            <motion.div key="confirmed" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                <SuccessScreen
                                    bookingId={createdBookingId}
                                    serviceName={selectedService?.name}
                                    therapistName={selectedTherapist?.name}
                                    datetime={`${formattedDate} · ${formattedTime}`}
                                />
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
                                                                        <span className="text-xs font-medium">{getDisplayRating(therapist.rating).toFixed(1)}</span>
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
                                                    const today = new Date();
                                                    today.setHours(0, 0, 0, 0);
                                                    date.setHours(0, 0, 0, 0);
                                                    if (date < today) return true;
                                                    if (date.getDay() === 2) return true;
                                                    return false;
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
                                    <div className="space-y-5">

                                        {/* ── Booking Summary ── */}
                                        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
                                            className="rounded-2xl border overflow-hidden"
                                            style={{ borderColor: '#1e2740', background: '#080d1a' }}>
                                            <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: '#1e2740' }}>
                                                <span className="text-xs font-bold uppercase tracking-widest" style={{ color: '#64748b' }}>Booking Summary</span>
                                                <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(226,183,100,0.1)', color: '#e2b764' }}>
                                                    Review before paying
                                                </span>
                                            </div>
                                            <div className="p-5 space-y-3">
                                                {[
                                                    { label: t.summaryService,   value: selectedService?.name,   sub: selectedService?.duration_minutes ? `${selectedService.duration_minutes} ${t.minutes_suffix}` : null },
                                                    { label: t.summaryTherapist, value: selectedTherapist?.name, sub: selectedTherapist?.specialty },
                                                    { label: t.summaryDateTime,  value: formattedDate,           sub: formattedTime },
                                                    { label: t.summaryLocation,  value: selectedAddress?.label,  sub: selectedAddress?.address },
                                                ].map(({ label, value, sub }) => (
                                                    <div key={label} className="flex justify-between items-start gap-4 text-sm">
                                                        <span className="text-muted-foreground flex-shrink-0">{label}</span>
                                                        <div className="text-right">
                                                            <p className="font-medium text-white">{value ?? '—'}</p>
                                                            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
                                                        </div>
                                                    </div>
                                                ))}

                                                {/* ── Price breakdown ── */}
                                                <div className="mt-4 pt-4 border-t space-y-2" style={{ borderColor: '#1e2740' }}>
                                                    <div className="flex justify-between text-sm">
                                                        <span style={{ color: '#64748b' }}>Total</span>
                                                        <span className="font-medium text-white">AED {Number(selectedService?.price).toLocaleString()}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm" style={{ color: '#64748b' }}>Downpayment</span>
                                                            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider" style={{ background: 'rgba(226,183,100,0.15)', color: '#e2b764' }}>20% · Due now</span>
                                                        </div>
                                                        <span className="font-display font-bold text-lg" style={{ color: '#e2b764' }}>AED {downpaymentAmt}</span>
                                                    </div>
                                                    <div className="flex justify-between text-sm">
                                                        <span style={{ color: '#64748b' }}>Remaining</span>
                                                        <span className="font-medium" style={{ color: '#94a3b8' }}>AED {remainingAmt} <span className="text-xs">(on session day)</span></span>
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>

                                        {/* ── Bank Transfer / QR Details ── */}
                                        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                                            className="rounded-2xl border overflow-hidden"
                                            style={{ borderColor: 'rgba(226,183,100,0.25)', background: 'linear-gradient(135deg, #0d1528 0%, #0a0f1e 100%)' }}>

                                            {/* Header */}
                                            <div className="px-5 py-4 border-b flex items-center gap-3" style={{ borderColor: 'rgba(226,183,100,0.1)' }}>
                                                <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                                                    style={{ background: 'rgba(226,183,100,0.12)', color: '#e2b764' }}>
                                                    <Building2 size={15} />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-display font-semibold text-white">Downpayment</p>
                                                    <p className="text-[11px]" style={{ color: '#64748b' }}>Transfer AED {downpaymentAmt} to confirm your booking</p>
                                                </div>
                                            </div>

                                            {/* Tab toggle */}
                                            <div className="flex gap-2 px-5 pt-4">
                                                {[
                                                    { id: 'bank', label: 'Bank Transfer', Icon: Building2 },
                                                    { id: 'qr',   label: 'QR / InstaPay', Icon: QrCode   },
                                                ].map(({ id, label, Icon }) => {
                                                    const isActive = paymentTab === id;
                                                    return (
                                                        <button key={id} onClick={() => setPaymentTab(id)}
                                                            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-sm font-semibold transition-all"
                                                            style={{
                                                                borderColor: isActive ? '#e2b764' : '#1e2740',
                                                                background:  isActive ? 'rgba(226,183,100,0.08)' : 'transparent',
                                                                color:       isActive ? '#e2b764' : '#64748b',
                                                            }}>
                                                            <Icon size={14} /> {label}
                                                        </button>
                                                    );
                                                })}
                                            </div>

                                            <div className="p-5">

                                                {/* ── Bank Transfer Panel ── */}
                                                {paymentTab === 'bank' && (
                                                    <>
                                                        {loadingBank ? (
                                                            <div className="flex items-center justify-center py-6 gap-3">
                                                                <Loader2 size={16} className="animate-spin" style={{ color: '#e2b764' }} />
                                                                <span className="text-sm" style={{ color: '#64748b' }}>Loading bank details…</span>
                                                            </div>
                                                        ) : bankDetails ? (
                                                            <div className="space-y-0">
                                                                <CopyRow label="Bank"         value={bankDetails.bank_name}      />
                                                                <CopyRow label="Account Name" value={bankDetails.account_name}   />
                                                                <CopyRow label="Account No."  value={bankDetails.account_number} />
                                                                <CopyRow label="IBAN"         value={bankDetails.iban}           />
                                                                <CopyRow label="Reference"    value={`Use your name + IHS booking`} highlight />
                                                            </div>
                                                        ) : null}

                                                        <div className="mt-4 flex items-start gap-2 p-3 rounded-xl"
                                                            style={{ background: 'rgba(226,183,100,0.05)', border: '1px solid rgba(226,183,100,0.12)' }}>
                                                            <AlertCircle size={13} className="flex-shrink-0 mt-0.5" style={{ color: '#e2b764' }} />
                                                            <p className="text-[11px] leading-relaxed" style={{ color: '#94a3b8' }}>
                                                                After transferring, upload your screenshot below. We'll verify within <strong className="text-white">30 minutes.</strong>
                                                            </p>
                                                        </div>

                                                        <div className="mt-4 p-3 rounded-xl space-y-1.5"
                                                            style={{ background: 'rgba(248,113,113,0.04)', border: '1px solid rgba(248,113,113,0.12)' }}>
                                                            <p className="text-[10px] uppercase tracking-wider font-bold mb-2" style={{ color: 'rgba(248,113,113,0.7)' }}>Cancellation Policy</p>
                                                            <p className="text-[11px]" style={{ color: '#94a3b8' }}>• Cancel <span className="text-white font-medium">before 24hrs</span> → Full refund ✅</p>
                                                            <p className="text-[11px]" style={{ color: '#94a3b8' }}>• Cancel <span className="text-white font-medium">within 24hrs</span> → Downpayment forfeited ❌</p>
                                                            <p className="text-[11px]" style={{ color: '#94a3b8' }}>• No-show → Downpayment forfeited ❌</p>
                                                        </div>
                                                    </>
                                                )}

                                                {/* ── QR / InstaPay Panel ── */}
                                                {paymentTab === 'qr' && (
                                                    <div className="flex flex-col items-center gap-4">

                                                        {/* Verified badge */}
                                                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-semibold"
                                                            style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: '#10b981' }}>
                                                            <ShieldCheck size={12} /> Secure · Instant · Zero fees
                                                        </div>

                                                        {/* QR Frame */}
                                                        <div className="relative w-44 h-44 rounded-2xl flex items-center justify-center p-2.5"
                                                            style={{ border: '2px solid rgba(226,183,100,0.35)', background: '#fff' }}>
                                                            {/* Gold corner accents */}
                                                            {[
                                                                { top: 6, left: 6,   borderWidth: '3px 0 0 3px',   borderRadius: '4px 0 0 0'   },
                                                                { top: 6, right: 6,  borderWidth: '3px 3px 0 0',   borderRadius: '0 4px 0 0'   },
                                                                { bottom: 6, left: 6,  borderWidth: '0 0 3px 3px', borderRadius: '0 0 0 4px'   },
                                                                { bottom: 6, right: 6, borderWidth: '0 3px 3px 0', borderRadius: '0 0 4px 0'   },
                                                            ].map((s, i) => (
                                                                <div key={i} className="absolute w-5 h-5" style={{ ...s, borderColor: '#e2b764', borderStyle: 'solid' }} />
                                                            ))}
                                                            {/* QR Code image — replace src with your real QR URL */}
                                                            <img src="/qr-code-placeholder.png" alt="QR Code" className="w-full h-full object-contain" />
                                                        </div>

                                                        {/* Amount pill */}
                                                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-base font-bold font-display"
                                                            style={{ background: 'rgba(226,183,100,0.08)', border: '1px solid rgba(226,183,100,0.25)', color: '#e2b764' }}>
                                                            AED {downpaymentAmt} · Downpayment
                                                        </div>

                                                        {/* Label */}
                                                        <div className="text-center">
                                                            <p className="text-sm font-semibold text-white mb-1">IHS Wellness — InstaPay / AANI</p>
                                                            <p className="text-[11px] leading-relaxed" style={{ color: '#64748b' }}>
                                                                Scan with your banking app or any<br />UAE payment app that supports QR
                                                            </p>
                                                        </div>

                                                        {/* Steps */}
                                                        <div className="w-full flex flex-col gap-2">
                                                            {[
                                                                { n: 1, text: <>Open your banking app (ENBD, FAB, ADCB…) and tap <strong className="text-white">Scan QR / Pay</strong></> },
                                                                { n: 2, text: <>Point your camera at the QR above — enter <strong className="text-white">AED {downpaymentAmt}</strong> and your <strong className="text-white">name as reference</strong></> },
                                                                { n: 3, text: <>Take a screenshot of the confirmation and <strong className="text-white">upload it below</strong></> },
                                                            ].map(({ n, text }) => (
                                                                <div key={n} className="flex items-start gap-3 px-3 py-2.5 rounded-xl"
                                                                    style={{ background: 'rgba(255,255,255,0.02)' }}>
                                                                    <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold"
                                                                        style={{ background: 'rgba(226,183,100,0.12)', color: '#e2b764' }}>
                                                                        {n}
                                                                    </div>
                                                                    <p className="text-[11px] leading-relaxed" style={{ color: '#94a3b8' }}>{text}</p>
                                                                </div>
                                                            ))}
                                                        </div>

                                                        {/* Note */}
                                                        <div className="w-full flex items-start gap-2 p-3 rounded-xl"
                                                            style={{ background: 'rgba(226,183,100,0.05)', border: '1px solid rgba(226,183,100,0.12)' }}>
                                                            <AlertCircle size={13} className="flex-shrink-0 mt-0.5" style={{ color: '#e2b764' }} />
                                                            <p className="text-[11px] leading-relaxed" style={{ color: '#94a3b8' }}>
                                                                After paying, upload your screenshot below. We'll verify within <strong className="text-white">30 minutes.</strong>
                                                            </p>
                                                        </div>

                                                        {/* Cancellation policy */}
                                                        <div className="w-full p-3 rounded-xl space-y-1.5"
                                                            style={{ background: 'rgba(248,113,113,0.04)', border: '1px solid rgba(248,113,113,0.12)' }}>
                                                            <p className="text-[10px] uppercase tracking-wider font-bold mb-2" style={{ color: 'rgba(248,113,113,0.7)' }}>Cancellation Policy</p>
                                                            <p className="text-[11px]" style={{ color: '#94a3b8' }}>• Cancel <span className="text-white font-medium">before 24hrs</span> → Full refund ✅</p>
                                                            <p className="text-[11px]" style={{ color: '#94a3b8' }}>• Cancel <span className="text-white font-medium">within 24hrs</span> → Downpayment forfeited ❌</p>
                                                            <p className="text-[11px]" style={{ color: '#94a3b8' }}>• No-show → Downpayment forfeited ❌</p>
                                                        </div>

                                                    </div>
                                                )}

                                            </div>
                                        </motion.div>

                                        {/* ── Upload Screenshot ── */}
                                        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                                            className="rounded-2xl border overflow-hidden"
                                            style={{ borderColor: '#1e2740', background: '#080d1a' }}>
                                            <div className="px-5 py-4 border-b flex items-center gap-3" style={{ borderColor: '#1e2740' }}>
                                                <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                                                    style={{ background: 'rgba(255,255,255,0.04)', color: '#94a3b8' }}>
                                                    <Upload size={15} />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-display font-semibold text-white">Payment Screenshot</p>
                                                    <p className="text-[11px]" style={{ color: '#64748b' }}>Upload proof of your bank transfer</p>
                                                </div>
                                                {proofFile && (
                                                    <div className="ml-auto w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                                                        style={{ background: 'rgba(16,185,129,0.2)', color: '#10b981' }}>
                                                        <Check size={11} />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="p-5">
                                                <UploadZone file={proofFile} onFile={setProofFile} onRemove={() => setProofFile(null)} />
                                            </div>
                                        </motion.div>

                                        {/* ── Session Payment Method ── */}
                                        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                                            className="rounded-2xl border overflow-hidden"
                                            style={{ borderColor: '#1e2740', background: '#080d1a' }}>
                                            <div className="px-5 py-4 border-b" style={{ borderColor: '#1e2740' }}>
                                                <p className="text-sm font-display font-semibold text-white">Session Day Payment</p>
                                                <p className="text-[11px] mt-0.5" style={{ color: '#64748b' }}>How will you pay the remaining AED {remainingAmt}?</p>
                                            </div>
                                            <div className="p-5 space-y-3">
                                                {PAYMENT_METHODS.map((method) => {
                                                    const Icon = method.icon;
                                                    const isActive = selectedPayment === method.id;
                                                    return (
                                                        <button key={method.id} onClick={() => setSelectedPayment(method.id)}
                                                            className="w-full flex items-center gap-4 p-4 rounded-xl border text-start transition-all"
                                                            style={{
                                                                borderColor: isActive ? 'rgba(226,183,100,0.4)' : '#1e2740',
                                                                background:  isActive ? 'rgba(226,183,100,0.06)' : 'transparent',
                                                            }}
                                                            onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                                                            onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                                                        >
                                                            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all"
                                                                style={{ background: isActive ? 'rgba(226,183,100,0.15)' : '#141d33', color: isActive ? '#e2b764' : '#64748b' }}>
                                                                <Icon size={18} />
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-sm font-semibold font-display text-white">{method.label}</span>
                                                                    <span className="text-[10px]" style={{ color: '#64748b' }}>{method.sub}</span>
                                                                </div>
                                                                <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>{method.desc}</p>
                                                            </div>
                                                            <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all"
                                                                style={{ borderColor: isActive ? '#e2b764' : '#2a3555' }}>
                                                                {isActive && <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#e2b764' }} />}
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </motion.div>

                                    </div>
                                )}

                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* ── Navigation buttons ── */}
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
                                <button onClick={handleConfirm} disabled={!canProceed() || isSubmitting}
                                    className="btn-gold flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
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