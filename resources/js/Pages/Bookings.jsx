import AuthenticatedLayout from '@/Layouts/CustomerLayout';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { router } from '@inertiajs/react';
import {
    ChevronLeft, Star, Loader2, Check, Clock,
    Banknote, CreditCard, MapPin, Home, Building2, Hotel,
    AlertCircle, X, Plus
} from 'lucide-react';
import { Calendar } from '@/Components/ui/calendar';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import SuccessScreen from '@/Components/SuccessScreen';

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
    const [selectedPaymentType, setSelectedPaymentType] = useState('downpayment');

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
    const [createdBookingId,  setCreatedBookingId]  = useState(null);
    const [error,             setError]             = useState(null);
    const [genderFilter,      setGenderFilter]      = useState('all');
    const [showAddAddressModal, setShowAddAddressModal] = useState(false);
    const [newAddress, setNewAddress] = useState({ label: '', address: '', zone_name: '' });
    const [submittingAddress, setSubmittingAddress] = useState(false);

    const [voucherCode,       setVoucherCode]       = useState('');
    const [appliedVoucher,    setAppliedVoucher]    = useState(null);
    const [voucherError,      setVoucherError]      = useState(null);
    const [validatingVoucher, setValidatingVoucher]  = useState(false);

    const TOTAL_STEPS = 5;
    const stepLabels  = [t.stepService, t.stepTherapist, t.stepDateLocation, t.stepTime, t.stepPayment];

     const handleAddAddress = async () => {
        if (!newAddress.label || !newAddress.address || !newAddress.zone_name) {
            setError('Please fill all address fields');
            return;
        }

        setSubmittingAddress(true);
        setError(null);

        try {
            const csrfToken = getCsrf();
            
            const response = await fetch('/api/addresses', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-XSRF-TOKEN': csrfToken,
                },
                body: JSON.stringify(newAddress),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.message || 'Failed to add address');
            }

            const addedAddress = await response.json();
            
            // Refresh addresses list
            const addressesResponse = await apiFetch('/api/addresses');
            setAddresses(addressesResponse);
            
            // Auto-select the new address
            setSelectedAddress(addedAddress.address || addedAddress);
            
            // Close modal
            setShowAddAddressModal(false);
            
            // Reset form
            setNewAddress({ label: '', address: '', zone_name: '' });
            
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmittingAddress(false);
        }
    };

    const handleApplyVoucher = async () => {
        setVoucherError(null);

        if (!voucherCode.trim()) return;

        if (Number(selectedService?.duration_minutes) !== 60) {
            setVoucherError('This voucher only covers 60-minute services. Go back to Step 1 and choose a 60-min option to use it.');
            return;
        }

        setValidatingVoucher(true);
        try {
            const csrfToken = getCsrf();
            const res = await fetch('/api/loyalty/validate', {
                method:      'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type':     'application/json',
                    'Accept':           'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-XSRF-TOKEN':     csrfToken,
                },
                body: JSON.stringify({ code: voucherCode.trim() }),
            });

            const data = await res.json();

            if (data.valid) {
                setAppliedVoucher(data.voucher);
            } else {
                setVoucherError(data.message || 'Invalid voucher code.');
            }
        } catch (err) {
            setVoucherError('Failed to validate voucher. Please try again.');
        } finally {
            setValidatingVoucher(false);
        }
    };

    const handleRemoveVoucher = () => {
        setAppliedVoucher(null);
        setVoucherError(null);
        setVoucherCode('');
    };

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

    const canProceed = () => {
        if (step === 1) return !!selectedService;
        if (step === 2) return !!selectedTherapist;
        if (step === 3) return !!selectedAddress && !!selectedDate;
        if (step === 4) return !!selectedTime;
        if (step === 5) {
            if (appliedVoucher) return true;
            if (!selectedPaymentType) return false;
            return selectedPaymentType === 'downpayment' ? !!selectedPayment : true;
        }
        return false;
    };

    // Creates the booking (once) then immediately starts a Stripe Checkout
    // session for it and redirects — a single "Confirm Booking" click does
    // both, so createdBookingId doubles as a guard against re-creating the
    // booking if the Stripe call needs to be retried after a failure.
    const handleConfirm = useCallback(async () => {
        setIsSubmitting(true);
        setError(null);
        try {
            const csrfToken = getCsrf();
            let bookingId = createdBookingId;

            if (!bookingId) {
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
                        payment_type:   selectedPaymentType,
                        ...(appliedVoucher ? {
                            voucher_code:       appliedVoucher.code,
                            is_voucher_covered: true,
                        } : {}),
                    }),
                });

                if (!res.ok) {
                    const data = await res.json();
                    throw new Error(data.message ?? 'Booking failed.');
                }

                const bookingData = await res.json();
                bookingId = bookingData.booking.id;
                setCreatedBookingId(bookingId);
            }

            // Voucher-covered booking: nothing to pay, so skip Stripe entirely.
            if (appliedVoucher) {
                const useRes = await fetch('/api/loyalty/use', {
                    method:      'POST',
                    credentials: 'same-origin',
                    headers: {
                        'Content-Type':     'application/json',
                        'Accept':           'application/json',
                        'X-Requested-With': 'XMLHttpRequest',
                        'X-XSRF-TOKEN':     csrfToken,
                    },
                    body: JSON.stringify({
                        code:       appliedVoucher.code,
                        booking_id: bookingId,
                    }),
                });

                const useData = await useRes.json();

                if (!useRes.ok || !useData.success) {
                    // The booking exists but the voucher didn't get marked used —
                    // this must surface as an error, not a silent success.
                    throw new Error(
                        `Your booking was created, but we couldn't mark the voucher as used (${useData.message ?? 'unknown error'}). Please contact support with your booking reference before assuming this session is confirmed.`
                    );
                }

                setIsConfirmed(true);
                setIsSubmitting(false);
                return;
            }

            const checkoutRes = await fetch('/api/stripe/checkout', {
                method:      'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type':     'application/json',
                    'Accept':           'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-XSRF-TOKEN':     csrfToken,
                },
                body: JSON.stringify({
                    booking_id:   bookingId,
                    payment_type: selectedPaymentType,
                }),
            });

            if (!checkoutRes.ok) {
                const data = await checkoutRes.json();
                throw new Error(data.message ?? 'Failed to start payment.');
            }

            const { checkout_url } = await checkoutRes.json();
            window.location.href = checkout_url;
            // Left isSubmitting=true intentionally — the tab is navigating
            // away to Stripe, so there's no "done" state to reset to.
        } catch (err) {
            setError(err.message);
            setIsSubmitting(false);
        }
    }, [createdBookingId, selectedService, selectedTherapist, selectedAddress, selectedTime, selectedPayment, selectedPaymentType, appliedVoucher]);

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
    const fullAmt        = selectedService ? Number(selectedService.price).toFixed(2) : '0.00';
    const payAmount      = selectedPaymentType === 'full' ? fullAmt : downpaymentAmt;
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
                                                 <div className="flex flex-col items-center justify-center py-6 gap-4">
                                                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                                                        style={{ background: 'rgba(226,183,100,0.08)' }}>
                                                        <MapPin size={28} style={{ color: '#64748b' }} />
                                                    </div>
                                                    
                                                    <div className="text-center">
                                                        <p className="text-sm font-medium text-white mb-1">No addresses yet</p>
                                                        <p className="text-xs" style={{ color: '#64748b' }}>
                                                            Add your location to continue booking
                                                        </p>
                                                    </div>

                                                    {/* Option 1: Add address inline (opens modal) */}
                                                    <button
                                                        onClick={() => setShowAddAddressModal(true)}
                                                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all"
                                                        style={{
                                                            background: 'rgba(226,183,100,0.1)',
                                                            border: '1px solid rgba(226,183,100,0.25)',
                                                            color: '#e2b764'
                                                        }}
                                                    >
                                                        <Plus size={16} />
                                                        Add new address
                                                    </button>

                                                    {/* Option 2: Go to profile page to manage addresses */}
                                                    <button
                                                        onClick={() => router.visit(route('my.profile'))}
                                                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all"
                                                        style={{
                                                            background: '#141d33',
                                                            border: '1px solid #1e2740',
                                                            color: '#94a3b8'
                                                        }}
                                                    >
                                                        <Building2 size={14} />
                                                        Manage addresses in profile
                                                    </button>
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
                                                    {appliedVoucher ? (
                                                        <>
                                                            <div className="flex justify-between text-sm">
                                                                <span style={{ color: '#64748b' }}>Total</span>
                                                                <span className="font-medium line-through" style={{ color: '#64748b' }}>AED {Number(selectedService?.price).toLocaleString()}</span>
                                                            </div>
                                                            <div className="flex justify-between text-sm">
                                                                <span style={{ color: '#64748b' }}>Voucher Applied</span>
                                                                <span className="font-medium" style={{ color: '#4ade80' }}>-AED {Number(selectedService?.price).toLocaleString()}</span>
                                                            </div>
                                                            <div className="flex justify-between items-center pt-1">
                                                                <span className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>You Pay</span>
                                                                <span className="font-display font-bold text-lg" style={{ color: '#4ade80' }}>AED 0.00</span>
                                                            </div>
                                                        </>
                                                    ) : selectedPaymentType === 'full' ? (
                                                        <>
                                                            <div className="flex justify-between text-sm">
                                                                <span style={{ color: '#64748b' }}>Total</span>
                                                                <span className="font-medium text-white">AED {Number(selectedService?.price).toLocaleString()}</span>
                                                            </div>
                                                            <div className="flex justify-between items-center">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-sm" style={{ color: '#64748b' }}>You Pay Now</span>
                                                                    <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider" style={{ background: 'rgba(226,183,100,0.15)', color: '#e2b764' }}>100% · Due now</span>
                                                                </div>
                                                                <span className="font-display font-bold text-lg" style={{ color: '#e2b764' }}>AED {fullAmt}</span>
                                                            </div>
                                                            <div className="flex justify-between text-sm">
                                                                <span style={{ color: '#64748b' }}>Remaining</span>
                                                                <span className="font-medium" style={{ color: '#4ade80' }}>AED 0.00 <span className="text-xs">— Fully Paid</span></span>
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <>
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
                                                        </>
                                                    )}
                                                </div>

                                                {/* ── Voucher code ── */}
                                                <div className="mt-4 pt-4 border-t" style={{ borderColor: '#1e2740' }}>
                                                    {appliedVoucher ? (
                                                        <div className="flex items-center justify-between gap-3 p-3 rounded-xl"
                                                            style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.3)' }}>
                                                            <div className="flex items-center gap-2 min-w-0">
                                                                <Check size={15} className="flex-shrink-0" style={{ color: '#4ade80' }} />
                                                                <div className="min-w-0">
                                                                    <p className="text-xs font-semibold" style={{ color: '#4ade80' }}>Voucher Applied</p>
                                                                    <p className="text-[11px] truncate" style={{ color: '#94a3b8' }}>{appliedVoucher.code}</p>
                                                                </div>
                                                            </div>
                                                            <button onClick={handleRemoveVoucher} className="text-xs font-medium underline flex-shrink-0" style={{ color: '#64748b' }}>
                                                                Remove
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <p className="text-xs font-medium mb-2" style={{ color: '#94a3b8' }}>Have a voucher code?</p>
                                                            <div className="flex gap-2">
                                                                <input
                                                                    type="text"
                                                                    value={voucherCode}
                                                                    onChange={(e) => { setVoucherCode(e.target.value); setVoucherError(null); }}
                                                                    placeholder="IHS-FREE-XXXX"
                                                                    className="flex-1 px-3 py-2.5 rounded-xl border text-sm transition-all focus:outline-none"
                                                                    style={{ background: '#141d33', borderColor: '#1e2740', color: '#e2e8f0' }}
                                                                />
                                                                <button
                                                                    onClick={handleApplyVoucher}
                                                                    disabled={validatingVoucher || !voucherCode.trim()}
                                                                    className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 flex-shrink-0"
                                                                    style={{
                                                                        background: 'linear-gradient(135deg, #b7882a, #e2b764)',
                                                                        color: '#0b1120',
                                                                        opacity: (validatingVoucher || !voucherCode.trim()) ? 0.5 : 1,
                                                                        cursor: (validatingVoucher || !voucherCode.trim()) ? 'not-allowed' : 'pointer',
                                                                    }}
                                                                >
                                                                    {validatingVoucher && <Loader2 size={14} className="animate-spin" />}
                                                                    Apply
                                                                </button>
                                                            </div>
                                                            {voucherError && (
                                                                <p className="text-xs mt-2 flex items-center gap-1.5" style={{ color: '#f87171' }}>
                                                                    <AlertCircle size={12} className="flex-shrink-0" /> {voucherError}
                                                                </p>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </motion.div>

                                        {/* ── Payment Type ── */}
                                        {!appliedVoucher && (
                                        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                                            className="rounded-2xl border overflow-hidden"
                                            style={{ borderColor: 'rgba(226,183,100,0.25)', background: 'linear-gradient(135deg, #0d1528 0%, #0a0f1e 100%)' }}>

                                            {/* Header */}
                                            <div className="px-5 py-4 border-b flex items-center gap-3" style={{ borderColor: 'rgba(226,183,100,0.1)' }}>
                                                <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                                                    style={{ background: 'rgba(226,183,100,0.12)', color: '#e2b764' }}>
                                                    <CreditCard size={15} />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-display font-semibold text-white">Pay with Stripe</p>
                                                    <p className="text-[11px]" style={{ color: '#64748b' }}>Choose how much to pay now to confirm your booking</p>
                                                </div>
                                            </div>

                                            <div className="p-5 space-y-3">
                                                {[
                                                    { id: 'downpayment', label: 'Downpayment (20%)', amount: downpaymentAmt, sub: `Pay remaining AED ${remainingAmt} on session day` },
                                                    { id: 'full',        label: 'Full Payment',       amount: fullAmt,       sub: 'No balance due on session day' },
                                                ].map((type) => {
                                                    const isActive = selectedPaymentType === type.id;
                                                    return (
                                                        <button key={type.id} onClick={() => setSelectedPaymentType(type.id)}
                                                            className="w-full flex items-center gap-4 p-4 rounded-xl border text-start transition-all"
                                                            style={{
                                                                borderColor: isActive ? '#e2b764' : '#1e2740',
                                                                background:  isActive ? 'rgba(226,183,100,0.08)' : 'transparent',
                                                            }}
                                                            onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                                                            onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                                                        >
                                                            <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all"
                                                                style={{ borderColor: isActive ? '#e2b764' : '#2a3555' }}>
                                                                {isActive && <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#e2b764' }} />}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <span className="text-sm font-semibold font-display text-white">{type.label}</span>
                                                                <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>{type.sub}</p>
                                                            </div>
                                                            <span className="font-display font-bold text-base flex-shrink-0" style={{ color: '#e2b764' }}>AED {type.amount}</span>
                                                        </button>
                                                    );
                                                })}

                                                <div className="flex items-start gap-2 p-3 rounded-xl"
                                                    style={{ background: 'rgba(226,183,100,0.05)', border: '1px solid rgba(226,183,100,0.12)' }}>
                                                    <AlertCircle size={13} className="flex-shrink-0 mt-0.5" style={{ color: '#e2b764' }} />
                                                    <p className="text-[11px] leading-relaxed" style={{ color: '#94a3b8' }}>
                                                        Cancel <span className="text-white font-medium">before 24hrs</span> for a full refund. Cancelling within 24hrs or a no-show forfeits the amount paid.
                                                    </p>
                                                </div>
                                            </div>
                                        </motion.div>
                                        )}

                                        {/* ── Session Payment Method ── */}
                                        {!appliedVoucher && selectedPaymentType === 'downpayment' && (
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
                                        )}

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
                                    {appliedVoucher
                                        ? (isSubmitting ? 'Confirming Booking…' : 'Confirm Free Booking')
                                        : (isSubmitting ? 'Redirecting to Stripe…' : `Pay AED ${payAmount} with Stripe`)}
                                </button>
                            )}
                        </div>
                    )}
                </main>
            </div>

            {/* Add Address Modal */}
            <AnimatePresence>
                {showAddAddressModal && (
                    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 backdrop-blur-sm"
                            style={{ background: 'rgba(0,0,0,0.7)' }}
                            onClick={() => setShowAddAddressModal(false)}
                        />

                        {/* Modal */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="relative w-full max-w-md rounded-2xl shadow-2xl z-10 overflow-y-auto max-h-[90vh]"
                            style={{ background: '#0f1629', border: '1px solid #1e2740' }}
                        >
                            {/* Header */}
                            <div className="sticky top-0 p-5 border-b flex items-center justify-between"
                                style={{ borderColor: '#1e2740', background: '#0f1629' }}>
                                <div>
                                    <h3 className="font-display font-semibold text-lg text-white">
                                        Add New Address
                                    </h3>
                                    <p className="text-[11px] mt-0.5" style={{ color: '#64748b' }}>
                                        Fill in your location details
                                    </p>
                                </div>
                                <button
                                    onClick={() => setShowAddAddressModal(false)}
                                    className="p-1.5 rounded-lg transition-colors"
                                    style={{ color: '#64748b' }}
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Form Body */}
                            <div className="p-5 space-y-5">
                                
                                {/* 1. Address Type / Label */}
                                <div>
                                    <label className="text-xs font-medium mb-2 block" style={{ color: '#94a3b8' }}>
                                        Address Type *
                                    </label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {[
                                            { value: 'Home', icon: '🏠', label: 'Home' },
                                            { value: 'Office', icon: '🏢', label: 'Office' },
                                            { value: 'Hotel', icon: '🏨', label: 'Hotel' },
                                        ].map((type) => (
                                            <button
                                                key={type.value}
                                                type="button"
                                                onClick={() => setNewAddress({ ...newAddress, label: type.value })}
                                                className={`flex flex-col items-center gap-1.5 py-3 rounded-xl text-sm font-medium transition-all ${
                                                    newAddress.label === type.value
                                                        ? 'gold-gradient text-primary-foreground'
                                                        : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                                                }`}
                                            >
                                                <span className="text-lg">{type.icon}</span>
                                                <span>{type.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* 2. Service Area (Zone) */}
                                <div>
                                    <label className="text-xs font-medium mb-2 block" style={{ color: '#94a3b8' }}>
                                        Service Area / Zone *
                                    </label>
                                    <p className="text-[10px] mb-3" style={{ color: '#64748b' }}>
                                        We currently serve these areas in Dubai
                                    </p>
                                    <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1 scrollbar-gold">
                                        {[
                                            { name: 'JAFZA', location: 'Dubai, UAE' },
                                            { name: 'DAFZ', location: 'Dubai, UAE' },
                                            { name: 'DMCC / JLT', location: 'Dubai, UAE' },
                                            { name: 'Dubai South', location: 'Dubai, UAE' },
                                            { name: 'Dubai Silicon Oasis', location: 'Dubai, UAE' },
                                            { name: 'Dubai Internet City', location: 'Dubai, UAE' },
                                            { name: 'Dubai Design District', location: 'Dubai, UAE' },
                                            { name: 'DIFC', location: 'Dubai, UAE' },
                                        ].map((zone) => (
                                            <button
                                                key={zone.name}
                                                type="button"
                                                onClick={() => {
                                                    console.log('✅ Selected zone:', zone.name);
                                                    setNewAddress({ ...newAddress, zone_name: zone.name });
                                                }}
                                                className={`text-left p-3 rounded-xl border transition-all ${
                                                    newAddress.zone_name === zone.name
                                                        ? 'border-gold bg-gold/10'
                                                        : 'border-secondary bg-secondary hover:border-gold/30'
                                                }`}
                                            >
                                                <p className="text-sm font-semibold" style={{ color: newAddress.zone_name === zone.name ? '#e2b764' : '#e2e8f0' }}>
                                                    {zone.name}
                                                </p>
                                                <p className="text-[10px] mt-0.5" style={{ color: '#64748b' }}>
                                                    {zone.location}
                                                </p>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* 3. Full Address Details */}
                                <div>
                                    <label className="text-xs font-medium mb-2 block" style={{ color: '#94a3b8' }}>
                                        Complete Address *
                                    </label>
                                    <textarea
                                        value={newAddress.address}
                                        onChange={(e) => setNewAddress({ ...newAddress, address: e.target.value })}
                                        placeholder="Building name, street, apartment/villa number, landmark..."
                                        rows={3}
                                        className="w-full px-4 py-2.5 rounded-xl border text-sm transition-all focus:outline-none resize-none"
                                        style={{
                                            background: '#141d33',
                                            borderColor: '#1e2740',
                                            color: '#e2e8f0',
                                        }}
                                    />
                                    <p className="text-[10px] mt-1.5" style={{ color: '#64748b' }}>
                                        Example: "Boulevard Plaza Tower 1, Sheikh Mohammed Boulevard, Downtown Dubai"
                                    </p>
                                </div>

                                {/* Preview Section */}
                                {(newAddress.label || newAddress.zone_name || newAddress.address) && (
                                    <div className="mt-2 p-3 rounded-xl" style={{ background: 'rgba(226,183,100,0.05)', border: '1px solid rgba(226,183,100,0.1)' }}>
                                        <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: '#e2b764' }}>
                                            Address Preview
                                        </p>
                                        <div className="flex items-start gap-2">
                                            <MapPin size={14} style={{ color: '#e2b764' }} />
                                            <div>
                                                <p className="text-sm font-medium text-white">
                                                    {newAddress.label || '___'} {newAddress.zone_name ? `· ${newAddress.zone_name}` : ''}
                                                </p>
                                                <p className="text-xs mt-1" style={{ color: '#94a3b8' }}>
                                                    {newAddress.address || 'Your complete address will appear here'}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Footer */}
                            <div className="sticky bottom-0 p-5 border-t flex gap-3"
                                style={{ borderColor: '#1e2740', background: '#0f1629' }}>
                                <button
                                    onClick={() => {
                                        setShowAddAddressModal(false);
                                        setNewAddress({ label: '', address: '', zone_name: '' });
                                    }}
                                    className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all"
                                    style={{ background: '#141d33', color: '#94a3b8' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleAddAddress}
                                    disabled={submittingAddress || !newAddress.label || !newAddress.zone_name || !newAddress.address}
                                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2"
                                    style={{
                                        background: 'linear-gradient(135deg, #b7882a, #e2b764)',
                                        color: '#0b1120',
                                        opacity: (!newAddress.label || !newAddress.zone_name || !newAddress.address) ? 0.5 : 1,
                                        cursor: (!newAddress.label || !newAddress.zone_name || !newAddress.address) ? 'not-allowed' : 'pointer',
                                    }}
                                >
                                    {submittingAddress ? (
                                        <Loader2 size={16} className="animate-spin" />
                                    ) : (
                                        <Check size={16} />
                                    )}
                                    {submittingAddress ? 'Saving...' : 'Save Address'}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </AuthenticatedLayout>
    );
}