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
import BottomSheet from '@/Components/Customer/BottomSheet';

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

    const [preselectApplied, setPreselectApplied] = useState(false);

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

    // ── Preselect service + skip to Step 2 when arriving from the Wishlist
    // page's "Book Now" (?service_id=<Service.id> in the URL). Runs once,
    // after services finish loading, and defaults to that service's first
    // (shortest/cheapest) duration since steps 4-5 require a chosen variant.
    // Normal entry from the Services page (no query param) is untouched. ─────
    useEffect(() => {
        if (preselectApplied || services.length === 0) return;

        const wishlistServiceId = new URLSearchParams(window.location.search).get('service_id');
        if (!wishlistServiceId) {
            setPreselectApplied(true);
            return;
        }

        const targetId = Number(wishlistServiceId);
        const group = services.find(g => g.durations.some(d => d.service_id === targetId));

        if (group && group.durations.length > 0) {
            const duration = group.durations[0];
            setSelectedGroup(group);
            setSelectedService({ ...duration, name: `${group.group_name} ${duration.duration_minutes} min`, group_name: group.group_name });
            setStep(2);
        }

        setPreselectApplied(true);
    }, [services, preselectApplied]);

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

    // Mobile sticky-footer summary/total — same source values as the summary
    // card and price breakdown below, just condensed to one line per the
    // Claude Design mobile prototype (design_handoff_customer_portal_mobile/
    // Customer Portal Mobile.dc.html, bkSummary/bkTotal).
    const mobileSummaryText = !selectedService
        ? 'Select a treatment and duration'
        : step === 1
            ? `${selectedService.group_name} · ${selectedService.duration_minutes} ${t.minutes_suffix}`
            : [
                `${selectedService.duration_minutes} ${t.minutes_suffix}`,
                selectedTherapist?.name?.split(' ')[0] || null,
                selectedDate ? selectedDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : null,
                formattedTime,
              ].filter(Boolean).join(' · ');

    const mobileTotalText = !selectedService
        ? ''
        : step === 5
            ? (appliedVoucher ? 'AED 0.00' : `AED ${payAmount} now`)
            : `AED ${fullAmt}`;

    const nextButtonLabel = appliedVoucher
        ? (isSubmitting ? 'Confirming Booking…' : 'Confirm Free Booking')
        : (isSubmitting ? 'Redirecting to Stripe…' : `Pay AED ${payAmount} with Stripe`);

    return (
        <AuthenticatedLayout>
            <div className="min-h-screen" style={{ background: 'var(--theme-bg)' }}>

                {/* ── Header / Stepper ── */}
                <header className="sticky top-0 z-40 glass-card-strong rounded-none border-x-0 border-t-0 px-5 pt-[env(safe-area-inset-top)] pb-4">
                    <div className="pt-3 max-w-4xl mx-auto">
                        <div className="flex items-center gap-1">
                            {/* Mobile-only close button (Claude Design: 44px, aria-label "Close booking") */}
                            <button
                                type="button"
                                onClick={() => router.visit(route('dashboard'))}
                                aria-label="Close booking"
                                className="md:hidden -ms-2.5 w-11 h-11 flex-shrink-0 rounded-xl flex items-center justify-center"
                                style={{ color: 'var(--theme-text-head)' }}
                            >
                                <X className="w-6 h-6" />
                            </button>
                            <motion.h1 initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="font-display text-xl font-bold flex-1" style={{ color: 'var(--theme-text-head)' }}>
                                {t.title}
                            </motion.h1>
                        </div>

                        {/* Desktop stepper (unchanged) — hidden on mobile, replaced by the progress bar below */}
                        <div className="hidden md:flex items-center gap-1.5 mt-3 overflow-x-auto scrollbar-hide">
                            {stepLabels.map((label, i) => (
                                <div key={i} className="flex items-center gap-1.5 flex-shrink-0">
                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                                        step > i + 1   ? 'gold-gradient text-primary-foreground' :
                                        step === i + 1 ? 'border-2 border-gold text-gold' : ''
                                    }`}
                                        style={step <= i ? { background: 'var(--theme-btn-bg)', color: 'var(--theme-text-muted)' } : undefined}>
                                        {step > i + 1 ? <Check className="w-3.5 h-3.5" /> : i + 1}
                                    </div>
                                    <span className={`text-xs whitespace-nowrap ${step === i + 1 ? 'text-gold font-medium' : ''}`}
                                        style={step !== i + 1 ? { color: 'var(--theme-text-muted)' } : undefined}>
                                        {label}
                                    </span>
                                    {i < TOTAL_STEPS - 1 && (
                                        <div className="w-8 h-px transition-all"
                                            style={{ background: step > i + 1 ? 'rgba(226,183,100,0.6)' : 'var(--theme-border)' }} />
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Mobile 5-segment progress bar + "Step n of 5" (Claude Design prototype) */}
                        {!isConfirmed && (
                            <div className="md:hidden mt-3">
                                <div className="flex items-center gap-1">
                                    {stepLabels.map((_, i) => (
                                        <span key={i} className="flex-1 h-1 rounded-full transition-colors"
                                            style={{ background: i < step ? 'var(--theme-cta)' : 'var(--theme-border)' }} />
                                    ))}
                                </div>
                                <div className="flex items-center justify-between mt-2 text-xs">
                                    <span className="font-bold" style={{ color: 'var(--theme-link)' }}>Step {step} of {TOTAL_STEPS}</span>
                                    <span className="font-semibold" style={{ color: 'var(--theme-text-2)' }}>{stepLabels[step - 1]}</span>
                                </div>
                            </div>
                        )}
                    </div>
                </header>

                <main className={`px-6 pt-5 max-w-6xl mx-auto ${isConfirmed ? 'pb-10' : 'pb-[150px] md:pb-10'}`}>

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
                                        <p className="text-sm mb-2" style={{ color: 'var(--theme-text-2)' }}>{t.selectService}</p>
                                        {loadingServices ? (
                                            <div className="flex items-center justify-center py-16">
                                                <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--theme-cta)' }} />
                                            </div>
                                        ) : (
                                            <>
                                                {/* Shared duration-tile renderer — used inline (mobile accordion) and in the
                                                    standalone desktop panel below, so the control itself exists in only
                                                    one visible place per breakpoint while the markup isn't duplicated. */}
                                                {(() => {
                                                    const DurationTile = ({ duration, groupName }) => {
                                                        const isSelected = selectedService?.id === duration.id;
                                                        return (
                                                            <button key={duration.id}
                                                                onClick={() => setSelectedService({ ...duration, name: `${groupName} ${duration.duration_minutes} min`, group_name: groupName })}
                                                                className="relative p-3 md:p-4 rounded-xl border text-start transition-all"
                                                                style={{ borderColor: isSelected ? '#e2b764' : 'var(--theme-border)', background: isSelected ? 'rgba(226,183,100,0.1)' : 'var(--theme-card)', minHeight: 76 }}
                                                                onMouseEnter={e => { if (!isSelected) { e.currentTarget.style.borderColor = 'var(--theme-link)'; e.currentTarget.style.background = 'var(--theme-btn-bg)'; }}}
                                                                onMouseLeave={e => { if (!isSelected) { e.currentTarget.style.borderColor = 'var(--theme-border)'; e.currentTarget.style.background = 'var(--theme-card)'; }}}
                                                            >
                                                                {isSelected && (
                                                                    <div className="absolute top-3 right-3 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: '#e2b764' }}>
                                                                        <Check className="w-2.5 h-2.5" style={{ color: 'var(--theme-cta-ink)' }} />
                                                                    </div>
                                                                )}
                                                                {/* Mobile: UI sans, not font-display, per the prototype's
                                                                    typography rule ("serif only at 20px and above") — at
                                                                    this tile's minimum mobile width (minmax(84px,1fr)) the
                                                                    serif-bold glyphs didn't fit on one line. Desktop (md+,
                                                                    the wider sm:grid-cols-3 panel) keeps the original serif
                                                                    sizing unchanged via the md: overrides below. */}
                                                                <div className="flex items-center gap-1.5 md:gap-2 mb-1.5 md:mb-2 min-w-0">
                                                                    <Clock className="w-3.5 h-3.5 md:w-4 md:h-4 flex-shrink-0" style={{ color: 'var(--theme-link)' }} />
                                                                    <span className="text-sm md:text-base md:font-display font-bold whitespace-nowrap" style={{ color: 'var(--theme-text-head)' }}>{duration.duration_minutes} {t.minutes_suffix}</span>
                                                                </div>
                                                                <p className="text-sm md:text-lg md:font-display font-bold whitespace-nowrap" style={{ color: 'var(--theme-link)' }}>AED {Number(duration.price).toLocaleString()}</p>
                                                                <div className="flex items-center gap-1 mt-2">
                                                                    {[1,2,3,4,5].map(s => (
                                                                        <Star key={s} size={10} style={{ color: Number(duration.rating) > 0 ? '#e2b764' : 'var(--theme-border)', fill: Number(duration.rating) > 0 ? '#e2b764' : 'var(--theme-border)' }} />
                                                                    ))}
                                                                    <span className="text-[10px] ml-1" style={{ color: 'var(--theme-text-muted)' }}>{Number(duration.rating) > 0 ? duration.rating : t.new_rating}</span>
                                                                </div>
                                                            </button>
                                                        );
                                                    };

                                                    return (
                                                        <>
                                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                                {services.map((group) => {
                                                                    const isActive = selectedGroup?.group_name === group.group_name;
                                                                    return (
                                                                        <div key={group.group_name}>
                                                                            <button
                                                                                onClick={() => { setSelectedGroup(isActive ? null : group); setSelectedService(null); }}
                                                                                aria-expanded={isActive}
                                                                                className="relative w-full p-5 rounded-2xl border text-start transition-all"
                                                                                style={{ borderColor: isActive ? '#e2b764' : 'var(--theme-border)', background: isActive ? 'rgba(226,183,100,0.08)' : 'var(--theme-card)' }}
                                                                                onMouseEnter={e => { if (!isActive) { e.currentTarget.style.borderColor = 'var(--theme-link)'; e.currentTarget.style.background = 'var(--theme-btn-bg)'; }}}
                                                                                onMouseLeave={e => { if (!isActive) { e.currentTarget.style.borderColor = 'var(--theme-border)'; e.currentTarget.style.background = 'var(--theme-card)'; }}}
                                                                            >
                                                                                {isActive && (
                                                                                    <div className="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: '#e2b764' }}>
                                                                                        <Check className="w-3 h-3" style={{ color: 'var(--theme-cta-ink)' }} />
                                                                                    </div>
                                                                                )}
                                                                                <h4 className="font-display font-semibold text-base mb-3 pr-6" style={{ color: 'var(--theme-text-head)' }}>{group.group_name}</h4>
                                                                                <div className="flex flex-wrap gap-1.5 mb-4">
                                                                                    {group.durations.map(d => (
                                                                                        <span key={d.id} className="text-[10px] px-2.5 py-1 rounded-full font-medium" style={{ background: 'var(--theme-btn-bg)', color: 'var(--theme-text-2)' }}>
                                                                                            {d.duration_minutes} {t.minutes_suffix}
                                                                                        </span>
                                                                                    ))}
                                                                                </div>
                                                                                <div className="flex items-center justify-between">
                                                                                    <span className="text-[11px]" style={{ color: 'var(--theme-text-muted)' }}>{t.from}</span>
                                                                                    <span className="font-display font-bold text-base" style={{ color: 'var(--theme-link)' }}>AED {Number(group.min_price).toLocaleString()}</span>
                                                                                </div>
                                                                            </button>

                                                                            {/* Mobile-only inline accordion panel — expands directly beneath the
                                                                                tapped group, per the Claude Design prototype. Desktop keeps the
                                                                                single standalone panel below the grid (see md:block below). */}
                                                                            {isActive && (
                                                                                <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                                                                                    className="md:hidden mt-2 rounded-2xl border p-4"
                                                                                    style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-card-hover)' }}>
                                                                                    <p className="text-xs font-semibold mb-3" style={{ color: 'var(--theme-text-2)' }}>Choose duration</p>
                                                                                    <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))' }}>
                                                                                        {group.durations.map(duration => (
                                                                                            <DurationTile key={duration.id} duration={duration} groupName={group.group_name} />
                                                                                        ))}
                                                                                    </div>
                                                                                </motion.div>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>

                                                            {/* Desktop-only standalone duration panel (unchanged behavior, just scoped to md+) */}
                                                            {selectedGroup && (
                                                                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="hidden md:block rounded-2xl border p-5" style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg)' }}>
                                                                    <p className="text-sm font-medium mb-4" style={{ color: 'var(--theme-text-head)' }}>Choose duration — <span style={{ color: 'var(--theme-link)' }}>{selectedGroup.group_name}</span></p>
                                                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                                                        {selectedGroup.durations.map(duration => (
                                                                            <DurationTile key={duration.id} duration={duration} groupName={selectedGroup.group_name} />
                                                                        ))}
                                                                    </div>
                                                                </motion.div>
                                                            )}
                                                        </>
                                                    );
                                                })()}
                                            </>
                                        )}
                                    </div>
                                )}

                                {/* ════════ STEP 2: Therapist ════════ */}
                                {step === 2 && (
                                    <div className="space-y-4">
                                        {/* Mobile: label on its own line + equal-width 3-up segmented gender well (Claude Design prototype) */}
                                        <div className="md:hidden">
                                            <p className="text-sm mb-2" style={{ color: 'var(--theme-text-2)' }}>{t.selectTherapist}</p>
                                            <div className="grid grid-cols-3 gap-1 p-1 rounded-xl" style={{ background: 'var(--theme-btn-bg)' }}>
                                                {['all', 'male', 'female'].map((g) => {
                                                    const isActive = genderFilter === g;
                                                    return (
                                                        <button key={g} onClick={() => setGenderFilter(g)}
                                                            className={`h-9 rounded-lg text-sm font-semibold transition-all ${isActive ? 'gold-gradient text-primary-foreground' : ''}`}
                                                            style={!isActive ? { color: 'var(--theme-text-muted)' } : undefined}
                                                        >
                                                            {g === 'all' ? t.genderAll : g === 'male' ? t.genderMale : t.genderFemale}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* Desktop: original inline label + compact filter row, unchanged */}
                                        <div className="hidden md:flex items-center gap-3 mb-2">
                                            <p className="text-sm flex-1" style={{ color: 'var(--theme-text-2)' }}>{t.selectTherapist}</p>
                                            <div className="flex gap-1.5">
                                                {['all', 'male', 'female'].map((g) => {
                                                    const isActive = genderFilter === g;
                                                    return (
                                                        <button key={g} onClick={() => setGenderFilter(g)}
                                                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${isActive ? 'gold-gradient text-primary-foreground' : ''}`}
                                                            style={!isActive ? { background: 'var(--theme-btn-bg)', color: 'var(--theme-text-muted)' } : undefined}
                                                            onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--theme-card-hover)'; }}
                                                            onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'var(--theme-btn-bg)'; }}
                                                        >
                                                            {g === 'all' ? t.genderAll : g === 'male' ? t.genderMale : t.genderFemale}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                        {loadingTherapists ? (
                                            <div className="flex items-center justify-center py-16">
                                                <Loader2 className="w-6 h-6 animate-spin text-gold" />
                                                <span className="ml-3 text-sm" style={{ color: 'var(--theme-text-2)' }}>{t.findingTherapists}</span>
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
                                                                    <p className="text-xs truncate" style={{ color: 'var(--theme-text-muted)' }}>{therapist.specialty}</p>
                                                                    <div className="flex items-center gap-2 mt-1">
                                                                        <Star className="w-3 h-3 text-gold fill-gold" />
                                                                        <span className="text-xs font-medium">{getDisplayRating(therapist.rating).toFixed(1)}</span>
                                                                        <span className="text-[10px]" style={{ color: 'var(--theme-text-muted)' }}>{therapist.experience_years} yrs</span>
                                                                        <span className="text-[10px]" style={{ color: 'var(--theme-text-muted)' }}>{therapist.gender === 'male' ? '♂' : '♀'}</span>
                                                                    </div>
                                                                    {therapist.day_off && <p className="text-[10px] mt-1" style={{ color: 'var(--theme-text-muted)' }}>Day off: {therapist.day_off}</p>}
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
                                                className={cn('pointer-events-auto w-full')}
                                                classNames={{
                                                    // The shared Calendar component hardcodes bg-white/10 + text-white
                                                    // for "today", which is invisible on the Customer Ivory card
                                                    // (white-on-near-white). --theme-text-head resolves to #ffffff in
                                                    // dark mode (matching the original text-white exactly) and to the
                                                    // correct dark ink tone in light mode; --theme-btn-bg gives a
                                                    // solid, visible circle in both themes (the --theme-* tokens are
                                                    // plain hex, so a translucent bg-white/10-style overlay isn't
                                                    // reliably expressible via Tailwind's arbitrary-value opacity
                                                    // modifier). Overridden here, not in calendar.jsx, so this stays
                                                    // scoped to the Customer booking wizard only.
                                                    today:     'bg-[var(--theme-btn-bg)] text-[var(--theme-text-head)] font-semibold rounded-full',
                                                    day_today: 'bg-[var(--theme-btn-bg)] text-[var(--theme-text-head)] font-semibold rounded-full',
                                                }} />
                                            {/* Mobile-only helper note (Claude Design prototype) */}
                                            <p className="md:hidden text-xs mt-2.5 px-1" style={{ color: 'var(--theme-text-muted)' }}>
                                                Closed on Tuesdays. Same-day bookings need at least 2 hours' notice.
                                            </p>
                                        </div>
                                        <div className="glass-card p-5 flex flex-col">
                                            <h4 className="font-display font-semibold text-base mb-4">{t.location}</h4>
                                            {loadingAddresses ? (
                                                <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-gold" /></div>
                                            ) : addresses.length === 0 ? (
                                                 <div className="flex flex-col items-center justify-center py-6 gap-4">
                                                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                                                        style={{ background: 'rgba(226,183,100,0.08)' }}>
                                                        <MapPin size={28} style={{ color: 'var(--theme-text-muted)' }} />
                                                    </div>

                                                    <div className="text-center">
                                                        <p className="text-sm font-medium mb-1" style={{ color: 'var(--theme-text-head)' }}>No addresses yet</p>
                                                        <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>
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
                                                            color: 'var(--theme-link)'
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
                                                            background: 'var(--theme-btn-bg)',
                                                            border: '1px solid var(--theme-border)',
                                                            color: 'var(--theme-text-2)'
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
                                                                className={`w-full flex items-center gap-4 p-4 rounded-xl text-start transition-all border ${isActive ? 'bg-gold/10 border-gold/40' : 'border-transparent'}`}
                                                                style={!isActive ? { background: 'var(--theme-btn-bg)' } : undefined}
                                                                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--theme-card-hover)'; }}
                                                                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'var(--theme-btn-bg)'; }}
                                                            >
                                                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${isActive ? 'border-gold' : ''}`}
                                                                    style={!isActive ? { borderColor: 'var(--theme-text-muted)' } : undefined}>
                                                                    {isActive && <div className="w-2.5 h-2.5 rounded-full gold-gradient" />}
                                                                </div>
                                                                <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-gold' : ''}`}
                                                                    style={!isActive ? { color: 'var(--theme-text-muted)' } : undefined} />
                                                                <div className="flex-1 min-w-0">
                                                                    <p className={`text-sm font-semibold ${isActive ? 'gold-text' : ''}`}>
                                                                        {addr.label}
                                                                        {addr.is_default && <span className="ml-2 text-[10px] font-normal" style={{ color: 'var(--theme-text-muted)' }}>Default</span>}
                                                                    </p>
                                                                    <p className="text-xs truncate" style={{ color: 'var(--theme-text-muted)' }}>{addr.address}</p>
                                                                </div>
                                                            </button>
                                                        );
                                                    })}

                                                    {/* Mobile-only: persistent "Add new address" (Claude Design prototype) —
                                                        the empty-address state above has its own add button, so this is
                                                        scoped to the populated-list branch only, avoiding a duplicate control. */}
                                                    <button
                                                        onClick={() => setShowAddAddressModal(true)}
                                                        className="md:hidden w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all border-dashed border"
                                                        style={{
                                                            background: 'var(--theme-card-hover)',
                                                            borderColor: 'rgba(226,183,100,0.4)',
                                                            color: 'var(--theme-link)'
                                                        }}
                                                    >
                                                        <Plus size={16} />
                                                        Add new address
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* ════════ STEP 4: Time ════════ */}
                                {step === 4 && (
                                    <div className="glass-card p-7">
                                        <p className="text-xs mb-1" style={{ color: 'var(--theme-text-muted)' }}>
                                            {formattedDate} • {selectedAddress?.label} • {selectedTherapist?.name}
                                        </p>
                                        <h4 className="font-display font-semibold text-lg mb-6">When would you like your session?</h4>

                                        {loadingSlots ? (
                                            <div className="flex items-center justify-center py-16">
                                                <Loader2 className="w-6 h-6 animate-spin text-gold" />
                                                <span className="ml-3 text-sm" style={{ color: 'var(--theme-text-2)' }}>{t.checkingAvail}</span>
                                            </div>
                                        ) : (() => {
                                            const evening   = availableSlots.filter(s => parseInt(s.time.split(':')[0]) >= 16);
                                            const lateNight = availableSlots.filter(s => parseInt(s.time.split(':')[0]) < 16);

                                            const SlotButton = ({ slot }) => {
                                                const isSelected  = selectedTime === slot.datetime;
                                                const isAvailable = slot.available;
                                                let btnClass = 'rounded-xl transition-all flex flex-col items-center justify-center gap-1.5 py-3 px-2 text-sm font-medium min-h-[46px]';
                                                let btnStyle = {};
                                                if (isSelected) {
                                                    btnClass += ' cursor-pointer';
                                                    btnStyle = { background: 'linear-gradient(135deg,#e2b764,#c9963f)', border: '1.5px solid transparent', color: 'var(--theme-cta-ink)' };
                                                } else if (isAvailable) {
                                                    btnClass += ' cursor-pointer';
                                                    btnStyle = { background: 'var(--theme-btn-bg)', border: '1.5px solid var(--theme-border)', color: 'var(--theme-text-2)' };
                                                } else {
                                                    btnClass += ' cursor-not-allowed';
                                                    btnStyle = { background: 'var(--theme-bg)', border: '1.5px solid var(--theme-border)', color: 'var(--theme-text-muted)' };
                                                }
                                                const dotColor = isSelected ? '#92400e' : isAvailable ? '#1d4ed8' : '#0f172a';
                                                return (
                                                    <button key={slot.datetime} onClick={() => isAvailable && setSelectedTime(slot.datetime)} disabled={!isAvailable}
                                                        className={btnClass} style={btnStyle}
                                                        onMouseEnter={e => { if (isAvailable && !isSelected) { e.currentTarget.style.borderColor = '#e2b764'; e.currentTarget.style.color = '#e2b764'; }}}
                                                        onMouseLeave={e => { if (isAvailable && !isSelected) { e.currentTarget.style.borderColor = 'var(--theme-border)'; e.currentTarget.style.color = 'var(--theme-text-2)'; }}}
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
                                                            <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
                                                                {evening.map(slot => <SlotButton key={slot.datetime} slot={slot} />)}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {lateNight.length > 0 && (
                                                        <div>
                                                            <p className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: '#334155' }}>Late night</p>
                                                            <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
                                                                {lateNight.map(slot => <SlotButton key={slot.datetime} slot={slot} />)}
                                                            </div>
                                                        </div>
                                                    )}
                                                    <div className="flex items-center gap-5 pt-4 flex-wrap" style={{ borderTop: '1px solid var(--theme-border)' }}>
                                                        {[
                                                            { dot: '#1d4ed8', label: 'Available' },
                                                            { dot: '#0f172a', label: 'Unavailable', border: '1px solid #1e293b' },
                                                            { dot: '#92400e', label: 'Selected' },
                                                        ].map(({ dot, label, border }) => (
                                                            <div key={label} className="flex items-center gap-2">
                                                                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dot, border }} />
                                                                <span className="text-[11px]" style={{ color: 'var(--theme-text-2)' }}>{label}</span>
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
                                            style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg)' }}>
                                            <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--theme-border)' }}>
                                                <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--theme-text-muted)' }}>Booking Summary</span>
                                                <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(226,183,100,0.1)', color: 'var(--theme-link)' }}>
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
                                                    // Mobile: label stacked above its value (easier to read at 320px,
                                                    // per the Claude Design prototype). Desktop: unchanged side-by-side row.
                                                    <div key={label} className="flex flex-col gap-0.5 md:flex-row md:justify-between md:items-start md:gap-4 text-sm">
                                                        <span className="flex-shrink-0" style={{ color: 'var(--theme-text-muted)' }}>{label}</span>
                                                        <div className="md:text-right">
                                                            <p className="font-medium" style={{ color: 'var(--theme-text-head)' }}>{value ?? '—'}</p>
                                                            {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>{sub}</p>}
                                                        </div>
                                                    </div>
                                                ))}

                                                {/* ── Price breakdown ── */}
                                                <div className="mt-4 pt-4 border-t space-y-2" style={{ borderColor: 'var(--theme-border)' }}>
                                                    {appliedVoucher ? (
                                                        <>
                                                            <div className="flex justify-between text-sm">
                                                                <span style={{ color: 'var(--theme-text-muted)' }}>Total</span>
                                                                <span className="font-medium line-through" style={{ color: 'var(--theme-text-muted)' }}>AED {Number(selectedService?.price).toLocaleString()}</span>
                                                            </div>
                                                            <div className="flex justify-between text-sm">
                                                                <span style={{ color: 'var(--theme-text-muted)' }}>Voucher Applied</span>
                                                                <span className="font-medium" style={{ color: 'var(--theme-success)' }}>-AED {Number(selectedService?.price).toLocaleString()}</span>
                                                            </div>
                                                            <div className="flex justify-between items-center pt-1">
                                                                <span className="text-sm font-semibold" style={{ color: 'var(--theme-text-head)' }}>You Pay</span>
                                                                <span className="font-display font-bold text-lg" style={{ color: 'var(--theme-success)' }}>AED 0.00</span>
                                                            </div>
                                                        </>
                                                    ) : selectedPaymentType === 'full' ? (
                                                        <>
                                                            <div className="flex justify-between text-sm">
                                                                <span style={{ color: 'var(--theme-text-muted)' }}>Total</span>
                                                                <span className="font-medium" style={{ color: 'var(--theme-text-head)' }}>AED {Number(selectedService?.price).toLocaleString()}</span>
                                                            </div>
                                                            <div className="flex justify-between items-center">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>You Pay Now</span>
                                                                    <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider" style={{ background: 'rgba(226,183,100,0.15)', color: 'var(--theme-link)' }}>100% · Due now</span>
                                                                </div>
                                                                <span className="font-display font-bold text-lg" style={{ color: 'var(--theme-link)' }}>AED {fullAmt}</span>
                                                            </div>
                                                            <div className="flex justify-between text-sm">
                                                                <span style={{ color: 'var(--theme-text-muted)' }}>Remaining</span>
                                                                <span className="font-medium" style={{ color: 'var(--theme-success)' }}>AED 0.00 <span className="text-xs">— Fully Paid</span></span>
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <div className="flex justify-between text-sm">
                                                                <span style={{ color: 'var(--theme-text-muted)' }}>Total</span>
                                                                <span className="font-medium" style={{ color: 'var(--theme-text-head)' }}>AED {Number(selectedService?.price).toLocaleString()}</span>
                                                            </div>
                                                            <div className="flex justify-between items-center">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>Downpayment</span>
                                                                    <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider" style={{ background: 'rgba(226,183,100,0.15)', color: 'var(--theme-link)' }}>20% · Due now</span>
                                                                </div>
                                                                <span className="font-display font-bold text-lg" style={{ color: 'var(--theme-link)' }}>AED {downpaymentAmt}</span>
                                                            </div>
                                                            <div className="flex justify-between text-sm">
                                                                <span style={{ color: 'var(--theme-text-muted)' }}>Remaining</span>
                                                                <span className="font-medium" style={{ color: 'var(--theme-text-2)' }}>AED {remainingAmt} <span className="text-xs">(on session day)</span></span>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>

                                                {/* ── Voucher code ── */}
                                                <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--theme-border)' }}>
                                                    {appliedVoucher ? (
                                                        <div className="flex items-center justify-between gap-3 p-3 rounded-xl"
                                                            style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.3)' }}>
                                                            <div className="flex items-center gap-2 min-w-0">
                                                                <Check size={15} className="flex-shrink-0" style={{ color: 'var(--theme-success)' }} />
                                                                <div className="min-w-0">
                                                                    <p className="text-xs font-semibold" style={{ color: 'var(--theme-success)' }}>Voucher Applied</p>
                                                                    <p className="text-[11px] truncate" style={{ color: 'var(--theme-text-2)' }}>{appliedVoucher.code}</p>
                                                                </div>
                                                            </div>
                                                            <button onClick={handleRemoveVoucher} className="text-xs font-medium underline flex-shrink-0" style={{ color: 'var(--theme-text-muted)' }}>
                                                                Remove
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <p className="text-xs font-medium mb-2" style={{ color: 'var(--theme-text-2)' }}>Have a voucher code?</p>
                                                            <div className="flex gap-2">
                                                                <input
                                                                    type="text"
                                                                    value={voucherCode}
                                                                    onChange={(e) => { setVoucherCode(e.target.value); setVoucherError(null); }}
                                                                    placeholder="IHS-FREE-XXXX"
                                                                    className="flex-1 px-3 py-2.5 rounded-xl border text-sm transition-all focus:outline-none"
                                                                    style={{ background: 'var(--theme-input-bg)', borderColor: 'var(--theme-border)', color: 'var(--theme-text-head)' }}
                                                                />
                                                                <button
                                                                    onClick={handleApplyVoucher}
                                                                    disabled={validatingVoucher || !voucherCode.trim()}
                                                                    className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 flex-shrink-0"
                                                                    style={{
                                                                        background: 'linear-gradient(135deg, #b7882a, #e2b764)',
                                                                        color: 'var(--theme-cta-ink)',
                                                                        opacity: (validatingVoucher || !voucherCode.trim()) ? 0.5 : 1,
                                                                        cursor: (validatingVoucher || !voucherCode.trim()) ? 'not-allowed' : 'pointer',
                                                                    }}
                                                                >
                                                                    {validatingVoucher && <Loader2 size={14} className="animate-spin" />}
                                                                    Apply
                                                                </button>
                                                            </div>
                                                            {voucherError && (
                                                                <p className="text-xs mt-2 flex items-center gap-1.5 text-destructive">
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
                                            style={{ borderColor: 'rgba(226,183,100,0.25)', background: 'linear-gradient(135deg, var(--theme-card-hover) 0%, var(--theme-bg) 100%)' }}>

                                            {/* Header */}
                                            <div className="px-5 py-4 border-b flex items-center gap-3" style={{ borderColor: 'rgba(226,183,100,0.1)' }}>
                                                <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                                                    style={{ background: 'rgba(226,183,100,0.12)', color: 'var(--theme-link)' }}>
                                                    <CreditCard size={15} />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-display font-semibold" style={{ color: 'var(--theme-text-head)' }}>Pay with Stripe</p>
                                                    <p className="text-[11px]" style={{ color: 'var(--theme-text-muted)' }}>Choose how much to pay now to confirm your booking</p>
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
                                                                borderColor: isActive ? '#e2b764' : 'var(--theme-border)',
                                                                background:  isActive ? 'rgba(226,183,100,0.08)' : 'transparent',
                                                            }}
                                                            onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                                                            onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                                                        >
                                                            <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all"
                                                                style={{ borderColor: isActive ? '#e2b764' : 'var(--theme-border)' }}>
                                                                {isActive && <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#e2b764' }} />}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <span className="text-sm font-semibold font-display" style={{ color: 'var(--theme-text-head)' }}>{type.label}</span>
                                                                <p className="text-xs mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>{type.sub}</p>
                                                            </div>
                                                            <span className="font-display font-bold text-base flex-shrink-0" style={{ color: 'var(--theme-link)' }}>AED {type.amount}</span>
                                                        </button>
                                                    );
                                                })}

                                                <div className="flex items-start gap-2 p-3 rounded-xl"
                                                    style={{ background: 'rgba(226,183,100,0.05)', border: '1px solid rgba(226,183,100,0.12)' }}>
                                                    <AlertCircle size={13} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--theme-link)' }} />
                                                    <p className="text-[11px] leading-relaxed" style={{ color: 'var(--theme-text-2)' }}>
                                                        Cancel <span className="font-medium" style={{ color: 'var(--theme-text-head)' }}>before 24hrs</span> for a full refund. Cancelling within 24hrs or a no-show forfeits the amount paid.
                                                    </p>
                                                </div>
                                            </div>
                                        </motion.div>
                                        )}

                                        {/* ── Session Payment Method ── */}
                                        {!appliedVoucher && selectedPaymentType === 'downpayment' && (
                                        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                                            className="rounded-2xl border overflow-hidden"
                                            style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-bg)' }}>
                                            <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--theme-border)' }}>
                                                <p className="text-sm font-display font-semibold" style={{ color: 'var(--theme-text-head)' }}>Session Day Payment</p>
                                                <p className="text-[11px] mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>How will you pay the remaining AED {remainingAmt}?</p>
                                            </div>
                                            <div className="p-5 space-y-3">
                                                {PAYMENT_METHODS.map((method) => {
                                                    const Icon = method.icon;
                                                    const isActive = selectedPayment === method.id;
                                                    return (
                                                        <button key={method.id} onClick={() => setSelectedPayment(method.id)}
                                                            className="w-full flex items-center gap-4 p-4 rounded-xl border text-start transition-all"
                                                            style={{
                                                                borderColor: isActive ? 'rgba(226,183,100,0.4)' : 'var(--theme-border)',
                                                                background:  isActive ? 'rgba(226,183,100,0.06)' : 'transparent',
                                                            }}
                                                            onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                                                            onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                                                        >
                                                            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all"
                                                                style={{ background: isActive ? 'rgba(226,183,100,0.15)' : 'var(--theme-btn-bg)', color: isActive ? '#e2b764' : 'var(--theme-text-muted)' }}>
                                                                <Icon size={18} />
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-sm font-semibold font-display" style={{ color: 'var(--theme-text-head)' }}>{method.label}</span>
                                                                    <span className="text-[10px]" style={{ color: 'var(--theme-text-muted)' }}>{method.sub}</span>
                                                                </div>
                                                                <p className="text-xs mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>{method.desc}</p>
                                                            </div>
                                                            <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all"
                                                                style={{ borderColor: isActive ? '#e2b764' : 'var(--theme-border)' }}>
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

                    {/* ── Navigation buttons (desktop only — mobile uses the sticky action bar below) ── */}
                    {!isConfirmed && (
                        <div className="hidden md:flex items-center gap-3 mt-6 mb-8">
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
                                    {nextButtonLabel}
                                </button>
                            )}
                        </div>
                    )}
                </main>

                {/* ── Mobile sticky action bar (Claude Design prototype: summary + total, 52px Back, full-width 50px CTA) ── */}
                {!isConfirmed && (
                    <div
                        className="md:hidden fixed bottom-0 left-0 right-0 z-40 px-4 pt-2.5"
                        style={{
                            // Fully opaque card surface — matches the prototype's own
                            // `background:#ffffff` for this footer exactly (it uses no
                            // backdrop-filter at all here). `--theme-header-bg` is a
                            // translucent token meant for blurred sticky headers
                            // elsewhere; at this footer it let scrolled content behind
                            // it show through.
                            background: 'var(--theme-card)',
                            borderTop: '1px solid var(--theme-border)',
                            paddingBottom: 'calc(10px + env(safe-area-inset-bottom))',
                            boxShadow: '0 -10px 24px -18px rgba(60,45,20,0.3)',
                        }}
                    >
                        <div className="flex items-center justify-between gap-2.5 mb-2 text-xs">
                            <span className="truncate" style={{ color: 'var(--theme-text-2)' }}>{mobileSummaryText}</span>
                            <span className="flex-shrink-0 font-extrabold" style={{ color: 'var(--theme-text-head)' }}>{mobileTotalText}</span>
                        </div>
                        <div className="flex items-center gap-2.5">
                            {step > 1 && (
                                <button
                                    type="button"
                                    onClick={() => setStep(step - 1)}
                                    aria-label={t.back}
                                    className="flex-shrink-0 w-[52px] h-[50px] flex items-center justify-center"
                                    style={{ borderRadius: 14, border: '1px solid var(--theme-border)', background: 'var(--theme-card)', color: 'var(--theme-text-head)' }}
                                >
                                    <ChevronLeft className="w-5 h-5" />
                                </button>
                            )}
                            {step < TOTAL_STEPS ? (
                                <button
                                    type="button"
                                    onClick={() => setStep(step + 1)}
                                    disabled={!canProceed()}
                                    className="flex-1 min-w-0 h-[50px] text-sm font-bold disabled:opacity-45"
                                    style={{ borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#d3a24c,#e8c27a)', color: '#0b1120' }}
                                >
                                    {t.next}
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={handleConfirm}
                                    disabled={!canProceed() || isSubmitting}
                                    className="flex-1 min-w-0 h-[50px] text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-45"
                                    style={{ borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#d3a24c,#e8c27a)', color: '#0b1120' }}
                                >
                                    {isSubmitting && <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />}
                                    <span className="truncate">{nextButtonLabel}</span>
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Add Address — shared field renderer used by both the desktop modal
                (unchanged below) and the mobile BottomSheet, so the actual
                inputs/handlers exist in one place in source. Reads/writes
                newAddress via closure; no business logic lives here. */}
            {(() => {
                const addressDisabled = !newAddress.label || !newAddress.zone_name || !newAddress.address;

                // A plain function, not a component — called directly (not as
                // JSX) so it splices its returned tree straight into the
                // parent render rather than mounting as a distinct component.
                // Defining this as `() => <AddressFormFields/>` JSX would give
                // React a new component identity on every keystroke (this IIFE
                // re-runs every render), remounting the subtree below and
                // dropping focus out of the address textarea after each char.
                const renderAddressFormFields = () => (
                    <div className="space-y-5">
                        {/* 1. Address Type / Label */}
                        <div>
                            <label className="text-xs font-medium mb-2 block" style={{ color: 'var(--theme-text-2)' }}>
                                Address Type *
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                                {[
                                    { value: 'Home', icon: '🏠', label: 'Home' },
                                    { value: 'Office', icon: '🏢', label: 'Office' },
                                    { value: 'Hotel', icon: '🏨', label: 'Hotel' },
                                ].map((type) => {
                                    const isActive = newAddress.label === type.value;
                                    return (
                                        <button
                                            key={type.value}
                                            type="button"
                                            onClick={() => setNewAddress({ ...newAddress, label: type.value })}
                                            className={`flex flex-col items-center gap-1.5 py-3 rounded-xl text-sm font-medium transition-all ${isActive ? 'gold-gradient text-primary-foreground' : ''}`}
                                            style={!isActive ? { background: 'var(--theme-btn-bg)', color: 'var(--theme-text-muted)' } : undefined}
                                            onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--theme-card-hover)'; }}
                                            onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'var(--theme-btn-bg)'; }}
                                        >
                                            <span className="text-lg">{type.icon}</span>
                                            <span>{type.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* 2. Service Area (Zone) */}
                        <div>
                            <label className="text-xs font-medium mb-2 block" style={{ color: 'var(--theme-text-2)' }}>
                                Service Area / Zone *
                            </label>
                            <p className="text-[10px] mb-3" style={{ color: 'var(--theme-text-muted)' }}>
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
                                ].map((zone) => {
                                    const isActive = newAddress.zone_name === zone.name;
                                    return (
                                        <button
                                            key={zone.name}
                                            type="button"
                                            onClick={() => setNewAddress({ ...newAddress, zone_name: zone.name })}
                                            className={`text-left p-3 rounded-xl border transition-all ${isActive ? 'border-gold bg-gold/10' : ''}`}
                                            style={!isActive ? { borderColor: 'var(--theme-border)', background: 'var(--theme-btn-bg)' } : undefined}
                                        >
                                            <p className="text-sm font-semibold" style={{ color: isActive ? 'var(--theme-link)' : 'var(--theme-text-head)' }}>
                                                {zone.name}
                                            </p>
                                            <p className="text-[10px] mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>
                                                {zone.location}
                                            </p>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* 3. Full Address Details */}
                        <div>
                            <label className="text-xs font-medium mb-2 block" style={{ color: 'var(--theme-text-2)' }}>
                                Complete Address *
                            </label>
                            <textarea
                                value={newAddress.address}
                                onChange={(e) => setNewAddress({ ...newAddress, address: e.target.value })}
                                placeholder="Building name, street, apartment/villa number, landmark..."
                                rows={3}
                                className="w-full px-4 py-2.5 rounded-xl border text-sm transition-all focus:outline-none resize-none"
                                style={{
                                    background: 'var(--theme-input-bg)',
                                    borderColor: 'var(--theme-border)',
                                    color: 'var(--theme-text-head)',
                                }}
                            />
                            <p className="text-[10px] mt-1.5" style={{ color: 'var(--theme-text-muted)' }}>
                                Example: "Boulevard Plaza Tower 1, Sheikh Mohammed Boulevard, Downtown Dubai"
                            </p>
                        </div>

                        {/* Preview Section */}
                        {(newAddress.label || newAddress.zone_name || newAddress.address) && (
                            <div className="mt-2 p-3 rounded-xl" style={{ background: 'rgba(226,183,100,0.05)', border: '1px solid rgba(226,183,100,0.1)' }}>
                                <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--theme-link)' }}>
                                    Address Preview
                                </p>
                                <div className="flex items-start gap-2">
                                    <MapPin size={14} style={{ color: 'var(--theme-link)' }} />
                                    <div>
                                        <p className="text-sm font-medium" style={{ color: 'var(--theme-text-head)' }}>
                                            {newAddress.label || '___'} {newAddress.zone_name ? `· ${newAddress.zone_name}` : ''}
                                        </p>
                                        <p className="text-xs mt-1" style={{ color: 'var(--theme-text-2)' }}>
                                            {newAddress.address || 'Your complete address will appear here'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                );

                return (
                    <>
                        {/* Desktop Add Address Modal (md+) — unchanged markup/behavior, only
                            scoped `hidden md:flex` so the mobile BottomSheet below owns <768px. */}
                        <AnimatePresence>
                            {showAddAddressModal && (
                                <div className="hidden md:flex fixed inset-0 z-50 items-end sm:items-center justify-center p-4">
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
                                        style={{ background: 'var(--theme-card)', border: '1px solid var(--theme-border)' }}
                                    >
                                        {/* Header */}
                                        <div className="sticky top-0 p-5 border-b flex items-center justify-between"
                                            style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-card)' }}>
                                            <div>
                                                <h3 className="font-display font-semibold text-lg" style={{ color: 'var(--theme-text-head)' }}>
                                                    Add New Address
                                                </h3>
                                                <p className="text-[11px] mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>
                                                    Fill in your location details
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => setShowAddAddressModal(false)}
                                                className="p-1.5 rounded-lg transition-colors"
                                                style={{ color: 'var(--theme-text-muted)' }}
                                            >
                                                <X size={18} />
                                            </button>
                                        </div>

                                        {/* Form Body */}
                                        <div className="p-5">
                                            {renderAddressFormFields()}
                                        </div>

                                        {/* Footer */}
                                        <div className="sticky bottom-0 p-5 border-t flex gap-3"
                                            style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-card)' }}>
                                            <button
                                                onClick={() => {
                                                    setShowAddAddressModal(false);
                                                    setNewAddress({ label: '', address: '', zone_name: '' });
                                                }}
                                                className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all"
                                                style={{ background: 'var(--theme-btn-bg)', color: 'var(--theme-text-2)' }}
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                onClick={handleAddAddress}
                                                disabled={submittingAddress || addressDisabled}
                                                className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2"
                                                style={{
                                                    background: 'linear-gradient(135deg, #b7882a, #e2b764)',
                                                    color: 'var(--theme-cta-ink)',
                                                    opacity: addressDisabled ? 0.5 : 1,
                                                    cursor: addressDisabled ? 'not-allowed' : 'pointer',
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

                        {/* Mobile Add Address Sheet (<768px) */}
                        <BottomSheet
                            open={showAddAddressModal}
                            onClose={() => setShowAddAddressModal(false)}
                            title="Add New Address"
                            subtitle="Fill in your location details"
                            footer={
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => {
                                            setShowAddAddressModal(false);
                                            setNewAddress({ label: '', address: '', zone_name: '' });
                                        }}
                                        className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all"
                                        style={{ background: 'var(--theme-btn-bg)', color: 'var(--theme-text-2)' }}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleAddAddress}
                                        disabled={submittingAddress || addressDisabled}
                                        className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2"
                                        style={{
                                            background: 'linear-gradient(135deg, #b7882a, #e2b764)',
                                            color: 'var(--theme-cta-ink)',
                                            opacity: addressDisabled ? 0.5 : 1,
                                            cursor: addressDisabled ? 'not-allowed' : 'pointer',
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
                            }
                        >
                            {renderAddressFormFields()}
                        </BottomSheet>
                    </>
                );
            })()}
        </AuthenticatedLayout>
    );
}