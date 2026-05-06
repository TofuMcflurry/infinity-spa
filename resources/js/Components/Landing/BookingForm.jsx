import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { addDays, format, startOfDay, getDay, addMonths, isBefore, startOfMonth } from "date-fns";
import {
    ChevronLeft, ChevronRight, Clock, MapPin,
    CalendarDays, Globe, CheckCircle2, Loader2, AlertCircle, Sparkles
} from "lucide-react";
import { toast } from "sonner";
import axios from "axios";
import { cn } from "@/lib/utils";

// ── Constants ─────────────────────────────────────────────────────────────────

const LOCATIONS = [
    "Palm Jumeirah",
    "DIFC",
    "Dubai Marina",
    "Downtown Dubai",
    "JBR",
    "Business Bay",
    "Emirates Hills",
    "Dubai Hills Estate",
];

const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTHS = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December"
];

// ── Generate time slots from 4PM to 4AM (next day) ───────────────────────────
const generateTimeSlots = () => {
    const slots = [];
    // Start at 16:00 (4PM)
    for (let i = 0; i < 49; i++) { // 24 slots = 12 hours of 30-min intervals
        const totalMins = 16 * 60 + i * 30; // Start at 4PM
        const hour = Math.floor(totalMins / 60) % 24;
        const min = totalMins % 60;
        
        // Stop at 4AM (04:00) next day
        if (hour >= 4 && hour < 16 && i > 0) break;
        
        let displayHour = hour % 12;
        if (displayHour === 0) displayHour = 12;
        const ampm = hour < 12 ? "AM" : "PM";
        const label = `${displayHour}:${String(min).padStart(2, "0")} ${ampm}`;
        const value = `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
        
        slots.push({ value, label, hour });
    }
    return slots;
};

const ALL_TIME_SLOTS = generateTimeSlots();

// ── Shared input class ───────────────────────────────────────────────────────

const inputCls =
    "w-full h-11 px-3 rounded-lg text-sm transition-all " +
    "bg-[hsl(var(--input))] border border-[hsl(var(--border))] " +
    "text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] " +
    "focus:outline-none focus:border-[hsl(var(--gold))] focus:ring-1 focus:ring-[hsl(var(--gold))/0.3]";

// ── Custom Scrollbar CSS ──────────────────────────────────────────────────────
const scrollbarStyles = `
    .custom-scroll::-webkit-scrollbar {
        width: 6px;
    }
    .custom-scroll::-webkit-scrollbar-track {
        background: hsl(var(--secondary));
        border-radius: 10px;
    }
    .custom-scroll::-webkit-scrollbar-thumb {
        background: hsl(var(--gold) / 0.4);
        border-radius: 10px;
    }
    .custom-scroll::-webkit-scrollbar-thumb:hover {
        background: hsl(var(--gold) / 0.6);
    }
`;

// ── Mini Calendar ─────────────────────────────────────────────────────────────

function MiniCalendar({ selectedDate, onSelect }) {
    // AFTER
    const todayDubaiStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' });
    const today = startOfDay(new Date(todayDubaiStr));
    
    // Allow future dates up to 3 months ahead
    const maxDate = addMonths(today, 3);

    const [viewYear, setViewYear] = useState(today.getFullYear());
    const [viewMonth, setViewMonth] = useState(today.getMonth());

    const firstDay = new Date(viewYear, viewMonth, 1);
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const startOffset = getDay(firstDay);

    const cells = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(viewYear, viewMonth, d));

    const canPrev = !(viewYear === today.getFullYear() && viewMonth === today.getMonth());
    const canNext = !(viewYear === maxDate.getFullYear() && viewMonth === maxDate.getMonth());

    const prevMonth = () => {
        if (canPrev) {
            if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
            else setViewMonth(m => m - 1);
        }
    };
    
    const nextMonth = () => {
        if (canNext) {
            if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
            else setViewMonth(m => m + 1);
        }
    };

    // Check if date is disabled (past, beyond max, or Tuesday)
    // AFTER
    const isDisabled = (date) => {
        if (!date) return true;
        const dateDubai = date.toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' });
        if (dateDubai < todayDubaiStr) return true;   // past dates
        if (dateDubai > format(maxDate, 'yyyy-MM-dd')) return true;  // beyond 3 months
        if (getDay(date) === 2) return true;           // Tuesday
        return false;
    };
    
    const isSelected = (date) =>
        date && selectedDate && format(date, "yyyy-MM-dd") === format(selectedDate, "yyyy-MM-dd");
    const isToday = (date) =>
        date && format(date, "yyyy-MM-dd") === format(today, "yyyy-MM-dd");

    return (
        <div className="w-full">
            {/* Month nav */}
            <div className="flex items-center justify-between mb-4">
                <button
                    type="button"
                    onClick={prevMonth}
                    disabled={!canPrev}
                    className="rdp-nav_button disabled:opacity-20 disabled:cursor-not-allowed"
                >
                    <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="rdp-caption_label" style={{ color: "hsl(var(--foreground))" }}>
                    {MONTHS[viewMonth]} {viewYear}
                </span>
                <button
                    type="button"
                    onClick={nextMonth}
                    disabled={!canNext}
                    className="rdp-nav_button disabled:opacity-20 disabled:cursor-not-allowed"
                >
                    <ChevronRight className="h-4 w-4" />
                </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 mb-1">
                {DAYS.map(d => (
                    <div
                        key={d}
                        className="text-center text-[0.72rem] font-medium py-1"
                        style={{ color: "hsl(var(--muted-foreground))" }}
                    >
                        {d}
                    </div>
                ))}
            </div>

            {/* Date grid */}
            <div className="grid grid-cols-7 gap-y-0.5">
                {cells.map((date, idx) => (
                    <div key={idx} className="flex items-center justify-center py-px">
                        {date ? (
                            <button
                                type="button"
                                disabled={isDisabled(date)}
                                onClick={() => !isDisabled(date) && onSelect(date)}
                                className={cn(
                                    "rdp-day",
                                    isSelected(date) && "rdp-day_selected",
                                    isToday(date) && !isSelected(date) && "rdp-day_today",
                                    isDisabled(date) && "rdp-day_disabled",
                                    getDay(date) === 2 && "opacity-40 cursor-not-allowed" // Tuesday indicator
                                )}
                            >
                                {date.getDate()}
                                {getDay(date) === 2 && (
                                    <span className="absolute text-[8px] -bottom-1 left-1/2 -translate-x-1/2 opacity-50">
                                        🚫
                                    </span>
                                )}
                            </button>
                        ) : <div className="w-9 h-9" />}
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Error Message ─────────────────────────────────────────────────────────────

function ErrorMsg({ message }) {
    if (!message) return null;
    return (
        <div className="mt-1 flex items-center gap-1.5 text-xs text-red-400">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
            <span>{message}</span>
        </div>
    );
}

// ── Back Button ───────────────────────────────────────────────────────────────

function BackBtn({ onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex items-center gap-1 text-sm font-medium mb-5 transition-opacity hover:opacity-70"
            style={{ color: "hsl(var(--gold))" }}
        >
            <ChevronLeft className="h-4 w-4" />
            Back
        </button>
    );
}

// ── Left Panel ────────────────────────────────────────────────────────────────

function LeftPanel({ selectedDate, selectedTime, step }) {
    return (
        <div className="flex flex-col gap-5 h-full">
            {/* Brand */}
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full gold-gradient flex items-center justify-center font-bold text-lg shadow-lg"
                    style={{ color: "hsl(var(--midnight))" }}>
                    I
                </div>
                <span className="text-xs font-semibold uppercase tracking-widest"
                    style={{ color: "hsl(var(--gold))" }}>
                    Infinity Home Spa
                </span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-display font-bold leading-tight"
                style={{ color: "hsl(var(--foreground))" }}>
                Book Your{" "}
                <span className="gold-text italic">Spa Experience</span>
            </h2>

            {/* Meta info */}
            <div className="space-y-2.5">
                <div className="flex items-center gap-2 text-sm"
                    style={{ color: "hsl(var(--muted-foreground))" }}>
                    <Clock className="h-4 w-4 flex-shrink-0" style={{ color: "hsl(var(--gold))" }} />
                    <span>60–120 min sessions · 4PM to 4AM</span>
                </div>

                {selectedDate && (
                    <div className="flex items-center gap-2 text-sm"
                        style={{ color: "hsl(var(--foreground))" }}>
                        <CalendarDays className="h-4 w-4 flex-shrink-0" style={{ color: "hsl(var(--gold))" }} />
                        <span>
                            {selectedTime
                                ? `${selectedTime.label} · ${format(selectedDate, "EEE, MMM d, yyyy")}`
                                : format(selectedDate, "EEEE, MMMM d, yyyy")}
                        </span>
                    </div>
                )}

                {step >= 2 && (
                    <div className="flex items-center gap-2 text-sm"
                        style={{ color: "hsl(var(--muted-foreground))" }}>
                        <Globe className="h-4 w-4 flex-shrink-0" style={{ color: "hsl(var(--gold))" }} />
                        <span>Dubai Time (GST)</span>
                    </div>
                )}
            </div>

            {/* Divider */}
            <div className="border-t" style={{ borderColor: "hsl(var(--border))" }} />

            {/* Description */}
            <div className="space-y-3">
                <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--muted-foreground))" }}>
                    Dubai's premier home spa concierge. Licensed therapists deliver luxury massages,
                    facials, and Royal Hammam rituals directly to your door.
                </p>
                <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--muted-foreground))" }}>
                    Premium products, professional therapists, and an unforgettable spa journey —
                    on your schedule. We arrive within 90 minutes.
                </p>
            </div>

            {/* Gold accent line */}
            <div className="mt-auto pt-6">
                <div className="h-px w-full gold-gradient opacity-30 rounded-full" />
            </div>
        </div>
    );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export const BookingForm = () => {
    const [services, setServices] = useState([]);
    const [step, setStep] = useState(0);
    const [selectedDateObj, setSelectedDateObj] = useState(null);
    const [selectedTime, setSelectedTime] = useState(null);
    const [confirmedData, setConfirmedData] = useState(null);

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm({
        mode: "onChange",
        defaultValues: {
            guest_name: "",
            guest_email: "",
            guest_phone: "",
            location: "",
            service_id: "",
        },
    });

    useEffect(() => {
        axios.get("/api/guest/services")
            .then(res => setServices(res.data))
            .catch(() => toast.error("Failed to load services"));
    }, []);

    const onSubmit = async (data) => {
        try {
            await axios.post("/guest-booking", {
                service_id: data.service_id,
                date: format(selectedDateObj, "yyyy-MM-dd"),
                time: selectedTime.value,
                location: data.location,
                guest_name: data.guest_name,
                guest_email: data.guest_email,
                guest_phone: data.guest_phone,
            });
            setConfirmedData(data);
            setStep(3);
        } catch (error) {
            const errorData = error.response?.data?.errors;
            if (errorData) {
                const first = Object.values(errorData)[0];
                toast.error(Array.isArray(first) ? first[0] : first);
            } else {
                toast.error("Something went wrong. Please try again.");
            }
        }
    };

    // ── Step renders ───────────────────────────────────────────────────────────

    const renderStep = () => {

        /* ── STEP 0: Date ── */
        if (step === 0) return (
            <div>
                <h3 className="text-center text-base font-bold mb-5"
                    style={{ color: "hsl(var(--foreground))" }}>
                    Select a Date
                </h3>
                <p className="text-center text-xs mb-4 text-muted-foreground">
                    ⚠️ Therapists are closed on <span className="text-gold font-medium">Tuesdays</span>
                </p>
                <MiniCalendar selectedDate={selectedDateObj} onSelect={(date) => {
                    setSelectedDateObj(date);
                    setSelectedTime(null);
                }} />
                <button
                    type="button"
                    onClick={() => selectedDateObj && setStep(1)}
                    disabled={!selectedDateObj}
                    className={cn(
                        "btn-gold mt-6 w-full py-3 rounded-xl text-sm font-semibold tracking-wide",
                        !selectedDateObj && "opacity-40 cursor-not-allowed pointer-events-none"
                    )}
                >
                    Next
                </button>
            </div>
        );

        /* ── STEP 1: Time ── */
        if (step === 1) return (
            <div>
                <BackBtn onClick={() => setStep(0)} />
                <h3 className="text-lg font-bold mb-0.5" style={{ color: "hsl(var(--foreground))" }}>
                    {format(selectedDateObj, "EEEE")}
                </h3>
                <p className="text-sm mb-1" style={{ color: "hsl(var(--muted-foreground))" }}>
                    {format(selectedDateObj, "MMMM d, yyyy")}
                </p>
                <div className="flex items-center gap-1.5 text-xs mb-5"
                    style={{ color: "hsl(var(--muted-foreground))" }}>
                    <Globe className="h-3.5 w-3.5" />
                    <span>Dubai Time (GST) · 4PM to 4AM</span>
                </div>

                <p className="text-center font-semibold text-sm mb-1"
                    style={{ color: "hsl(var(--foreground))" }}>
                    Select a Time
                </p>
                <p className="text-center text-xs mb-4"
                    style={{ color: "hsl(var(--muted-foreground))" }}>
                    Duration: Varies by service
                </p>

                {/* Custom scrollbar container */}
                <style>{scrollbarStyles}</style>
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1 custom-scroll">
                    {ALL_TIME_SLOTS.map(time => {
                        const isSel = selectedTime?.value === time.value;
                        return (
                            <div key={time.value} className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setSelectedTime(time)}
                                    className="flex-1 py-3 rounded-lg border text-sm font-medium transition-all hover:border-gold/50"
                                    style={{
                                        backgroundColor: isSel ? "hsl(var(--secondary))" : "transparent",
                                        borderColor: isSel ? "hsl(var(--border))" : "hsl(var(--gold) / 0.3)",
                                        color: isSel ? "hsl(var(--foreground))" : "hsl(var(--gold))",
                                    }}
                                >
                                    {time.label}
                                </button>
                                {isSel && (
                                    <button
                                        type="button"
                                        onClick={() => setStep(2)}
                                        className="btn-gold px-5 py-3 rounded-lg text-sm font-semibold"
                                    >
                                        Next
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        );

        /* ── STEP 2: Details ── */
        if (step === 2) return (
            <form onSubmit={handleSubmit(onSubmit)}>
                <BackBtn onClick={() => setStep(1)} />
                <h3 className="text-lg font-bold mb-5" style={{ color: "hsl(var(--foreground))" }}>
                    Your Details
                </h3>

                <div className="space-y-4">
                    {/* Name */}
                    <div>
                        <label className="block text-sm font-medium mb-1.5"
                            style={{ color: "hsl(var(--foreground))" }}>
                            Name <span className="text-red-400">*</span>
                        </label>
                        <input {...register("guest_name", {
                            required: "Full name is required",
                            minLength: { value: 2, message: "At least 2 characters" }
                        })}
                            type="text" placeholder="Your full name" className={inputCls} />
                        <ErrorMsg message={errors.guest_name?.message} />
                    </div>

                    {/* Email */}
                    <div>
                        <label className="block text-sm font-medium mb-1.5"
                            style={{ color: "hsl(var(--foreground))" }}>
                            Email <span className="text-red-400">*</span>
                        </label>
                        <input {...register("guest_email", {
                            required: "Email is required",
                            pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: "Enter a valid email" }
                        })}
                            type="email" placeholder="you@example.com" className={inputCls} />
                        <ErrorMsg message={errors.guest_email?.message} />
                    </div>

                    {/* Location radios */}
                    <div>
                        <label className="block text-sm font-medium mb-2"
                            style={{ color: "hsl(var(--foreground))" }}>
                            Location <span className="text-red-400">*</span>
                        </label>
                        <div className="space-y-2">
                            {LOCATIONS.map(loc => (
                                <label key={loc} htmlFor={`loc-${loc}`}
                                    className="flex items-center gap-3 cursor-pointer group">
                                    <input
                                        {...register("location", { required: "Please select a location" })}
                                        type="radio" id={`loc-${loc}`} value={loc}
                                        className="w-4 h-4 accent-[hsl(var(--gold))]"
                                    />
                                    <span className="flex items-center gap-1.5 text-sm transition-colors
                                        group-hover:text-[hsl(var(--gold))]"
                                        style={{ color: "hsl(var(--foreground))" }}>
                                        <MapPin className="h-4 w-4 flex-shrink-0"
                                            style={{ color: "hsl(var(--gold))" }} />
                                        {loc}
                                    </span>
                                </label>
                            ))}
                        </div>
                        <ErrorMsg message={errors.location?.message} />
                    </div>

                    {/* Phone */}
                    <div>
                        <label className="block text-sm font-medium mb-1.5"
                            style={{ color: "hsl(var(--foreground))" }}>
                            Phone Number <span className="text-red-400">*</span>
                        </label>
                        <div className="flex gap-2">
                            <div className="flex items-center gap-1.5 px-3 h-11 rounded-lg border text-sm whitespace-nowrap"
                                style={{
                                    backgroundColor: "hsl(var(--secondary))",
                                    borderColor: "hsl(var(--border))",
                                    color: "hsl(var(--muted-foreground))",
                                }}>
                                🇦🇪 +971
                            </div>
                            <input {...register("guest_phone", {
                                required: "Phone number is required",
                                validate: v => v.replace(/\D/g, "").length >= 9 || "At least 9 digits"
                            })}
                                type="tel" placeholder="50 XXX XXXX"
                                className={cn(inputCls, "flex-1 w-auto")} />
                        </div>
                        <ErrorMsg message={errors.guest_phone?.message} />
                    </div>

                    {/* Service */}
                    {services.length > 0 && (
                        <div>
                            <label className="block text-sm font-medium mb-1.5"
                                style={{ color: "hsl(var(--foreground))" }}>
                                Service <span className="text-red-400">*</span>
                            </label>
                            <select {...register("service_id", { required: "Please select a service" })}
                                className={cn(inputCls, "appearance-none cursor-pointer")}>
                                <option value="">Select a treatment...</option>
                                {services.map(s => (
                                    <option key={s.id} value={String(s.id)}>{s.name}</option>
                                ))}
                            </select>
                            <ErrorMsg message={errors.service_id?.message} />
                        </div>
                    )}
                </div>

                <p className="text-xs mt-4 leading-relaxed"
                    style={{ color: "hsl(var(--muted-foreground))" }}>
                    By proceeding, you confirm that you have read and agree to our terms and conditions.
                    No payment required now — our concierge will confirm via WhatsApp.
                </p>

                <button
                    type="submit"
                    disabled={isSubmitting}
                    className={cn(
                        "btn-gold mt-5 w-full py-3 rounded-xl text-sm font-semibold tracking-wide flex items-center justify-center gap-2",
                        isSubmitting && "opacity-50 cursor-not-allowed pointer-events-none"
                    )}
                >
                    {isSubmitting
                        ? <><Loader2 className="h-4 w-4 animate-spin" /> Confirming...</>
                        : <><Sparkles className="h-4 w-4" /> Confirm Booking</>
                    }
                </button>
            </form>
        );

        /* ── STEP 3: Confirmed ── */
        if (step === 3) return (
            <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-3">
                    <CheckCircle2 className="h-6 w-6 text-green-400" />
                    <h3 className="text-lg font-bold" style={{ color: "hsl(var(--foreground))" }}>
                        Booking Confirmed!
                    </h3>
                </div>
                <p className="text-sm mb-6" style={{ color: "hsl(var(--muted-foreground))" }}>
                    A confirmation email has been sent to your inbox.
                </p>

                <div className="rounded-xl border p-5 text-left space-y-3"
                    style={{
                        backgroundColor: "hsl(var(--card))",
                        borderColor: "hsl(var(--gold) / 0.2)",
                    }}>
                    <h4 className="font-semibold text-sm flex items-center gap-2"
                        style={{ color: "hsl(var(--foreground))" }}>
                        <Sparkles className="h-4 w-4" style={{ color: "hsl(var(--gold))" }} />
                        Infinity Home Spa
                    </h4>
                    {selectedDateObj && selectedTime && (
                        <div className="flex items-center gap-2 text-sm font-medium"
                            style={{ color: "hsl(var(--foreground))" }}>
                            <CalendarDays className="h-4 w-4 flex-shrink-0"
                                style={{ color: "hsl(var(--muted-foreground))" }} />
                            {selectedTime.label} · {format(selectedDateObj, "EEEE, MMMM d, yyyy")}
                        </div>
                    )}
                    <div className="flex items-center gap-2 text-sm"
                        style={{ color: "hsl(var(--muted-foreground))" }}>
                        <Globe className="h-4 w-4 flex-shrink-0" />
                        Dubai Time (GST)
                    </div>
                    {confirmedData?.location && (
                        <div className="flex items-center gap-2 text-sm"
                            style={{ color: "hsl(var(--muted-foreground))" }}>
                            <MapPin className="h-4 w-4 flex-shrink-0"
                                style={{ color: "hsl(var(--gold))" }} />
                            {confirmedData.location}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    // ── Layout ─────────────────────────────────────────────────────────────────

    return (
        <section
            id="booking"
            className="relative py-24 px-4"
            style={{ backgroundColor: "hsl(var(--background))" }}
        >
            {/* Subtle gold radial glow */}
            <div
                className="absolute inset-0 pointer-events-none"
                style={{
                    background:
                        "radial-gradient(ellipse 60% 40% at 50% 50%, hsl(var(--gold) / 0.06), transparent)",
                }}
            />

            <div className="relative z-10 mx-auto max-w-4xl">
                {/* Two-column card */}
                <div className="glass-card-strong overflow-hidden grid md:grid-cols-2">
                    {/* Left: Info */}
                    <div className="p-8 md:p-10 border-b md:border-b-0 md:border-r"
                        style={{ borderColor: "hsl(var(--border))" }}>
                        <LeftPanel
                            selectedDate={selectedDateObj}
                            selectedTime={selectedTime}
                            step={step}
                        />
                    </div>

                    {/* Right: Steps */}
                    <div className="p-8 md:p-10 overflow-y-auto max-h-[85vh] custom-scroll">
                        <style>{scrollbarStyles}</style>
                        {renderStep()}
                    </div>
                </div>
            </div>
        </section>
    );
};