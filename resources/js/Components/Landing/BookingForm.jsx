import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { addDays, format, startOfDay, getDay, addMonths, isBefore, startOfMonth } from "date-fns";
import {
    ChevronLeft, ChevronRight, Clock, MapPin,
    CalendarDays, Globe, CheckCircle2, Loader2, AlertCircle, Sparkles,
    Info, Sun, Moon, Check, ArrowRight,
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

// Presentation-only grouping of the existing slot output — no change to
// values, order, or what gets submitted. Every slot here is still the exact
// same object from ALL_TIME_SLOTS; this just splits the array in two so
// mobile can render two visual groups with a header in between.
const EVENING_SLOTS = ALL_TIME_SLOTS.filter((t) => t.hour >= 16);
const AFTER_MIDNIGHT_SLOTS = ALL_TIME_SLOTS.filter((t) => t.hour < 16);

// ── Shared input class ───────────────────────────────────────────────────────
// Mobile-first: 50px tall / 16px text (so iOS doesn't zoom on focus) per the
// approved mobile spec. md: resets back to today's exact 44px/14px desktop
// sizing — nothing changes at ≥768px.

const inputCls =
    "w-full min-w-0 h-12 px-3 rounded-[8px] text-base transition-all " +
    "bg-[#0B1222] border border-[#66779B] " +
    "text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] " +
    "focus:outline-none focus:border-[hsl(var(--gold))] focus:ring-1 focus:ring-[hsl(var(--gold))/0.3] " +
    "md:h-11 md:text-sm md:rounded-lg md:bg-[hsl(var(--input))] md:border-[hsl(var(--border))]";

// Mobile label style (13px/600/ink-secondary). md: resets to the original
// text-sm/font-medium/foreground look — unchanged at ≥768px.
const labelCls = "block text-[13px] font-semibold text-[#A9B3C7] mb-1.5 md:text-sm md:font-medium md:text-[hsl(var(--foreground))]";

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
        <div className="w-full min-w-0">
            {/* Month nav */}
            <div className="flex items-center justify-between mb-4">
                <button
                    type="button"
                    onClick={prevMonth}
                    disabled={!canPrev}
                    className={cn(
                        "rdp-nav_button disabled:opacity-20 disabled:cursor-not-allowed",
                        "max-md:!w-10 max-md:!h-10 max-md:!rounded-[8px] max-md:!border max-md:!border-[#66779B] max-md:!bg-transparent max-md:!opacity-100"
                    )}
                >
                    <ChevronLeft className="h-4 w-4" />
                </button>
                <span
                    className="rdp-caption_label max-md:!text-[19px]"
                    style={{ color: "hsl(var(--foreground))" }}
                >
                    {MONTHS[viewMonth]} {viewYear}
                </span>
                <button
                    type="button"
                    onClick={nextMonth}
                    disabled={!canNext}
                    className={cn(
                        "rdp-nav_button disabled:opacity-20 disabled:cursor-not-allowed",
                        "max-md:!w-10 max-md:!h-10 max-md:!rounded-[8px] max-md:!border max-md:!border-[#66779B] max-md:!bg-transparent max-md:!opacity-100"
                    )}
                >
                    <ChevronRight className="h-4 w-4" />
                </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 mb-1">
                {DAYS.map((d, i) => (
                    <div
                        key={d}
                        className={cn(
                            "text-center text-[0.72rem] font-medium py-1",
                            "max-md:!text-[11px] max-md:!font-bold max-md:!uppercase max-md:!tracking-wide max-md:!py-2",
                            i === 2 && "max-md:!text-[#4E5A73]"
                        )}
                        style={{ color: "hsl(var(--muted-foreground))" }}
                    >
                        {d}
                    </div>
                ))}
            </div>

            {/* Date grid */}
            <div className="grid grid-cols-7 gap-y-0.5 max-md:!gap-1.5">
                {cells.map((date, idx) => (
                    <div key={idx} className="flex items-center justify-center py-px">
                        {date ? (
                            <button
                                type="button"
                                disabled={isDisabled(date)}
                                aria-disabled={isDisabled(date)}
                                aria-pressed={isSelected(date)}
                                aria-label={format(date, "EEEE, MMMM d, yyyy")}
                                onClick={() => !isDisabled(date) && onSelect(date)}
                                className={cn(
                                    "rdp-day",
                                    isSelected(date) && "rdp-day_selected",
                                    isToday(date) && !isSelected(date) && "rdp-day_today",
                                    isDisabled(date) && "rdp-day_disabled",
                                    getDay(date) === 2 && "opacity-40 cursor-not-allowed",
                                    // Mobile-only visual override. `!` forces these to win over
                                    // the shared .rdp-day rule (which is shared with other, real
                                    // react-day-picker instances elsewhere in the app) without
                                    // editing that shared CSS. md: and up render through the
                                    // untouched classes above, exactly as today.
                                    "max-md:!w-full max-md:!aspect-square max-md:!rounded-[10px] max-md:!text-[15px] max-md:!font-medium max-md:![font-variant-numeric:tabular-nums]",
                                    "max-md:focus-visible:!outline-none max-md:focus-visible:!ring-2 max-md:focus-visible:!ring-[#E8B65C] max-md:focus-visible:!ring-offset-0",
                                    getDay(date) === 2
                                        ? "max-md:!text-[#4E5A73] max-md:!border max-md:!border-dashed max-md:!border-[#2A3654] max-md:!bg-[repeating-linear-gradient(135deg,transparent_0_5px,rgba(102,119,155,.10)_5px_6px)] max-md:!cursor-not-allowed"
                                        : isSelected(date)
                                        ? "max-md:!bg-[#E8B65C] max-md:!text-[#1A1206] max-md:!font-bold max-md:!shadow-[0_6px_18px_-6px_rgba(232,182,92,.55)]"
                                        : isDisabled(date)
                                        ? "max-md:!text-[#4E5A73] max-md:!bg-transparent max-md:!cursor-not-allowed"
                                        : cn(
                                            "max-md:!bg-[#16213A] max-md:!text-[#F3EFE6]",
                                            isToday(date) && "max-md:!border max-md:!border-[#E8B65C]"
                                        )
                                )}
                            >
                                {date.getDate()}
                                {getDay(date) === 2 && (
                                    <span className="absolute text-[8px] -bottom-1 left-1/2 -translate-x-1/2 opacity-50 max-md:hidden">
                                        🚫
                                    </span>
                                )}
                                {isToday(date) && !isSelected(date) && getDay(date) !== 2 && (
                                    <span className="hidden max-md:block absolute bottom-[6px] left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-[#E8B65C]" />
                                )}
                            </button>
                        ) : <div className="w-9 h-9 max-md:!w-full max-md:!aspect-square" />}
                    </div>
                ))}
            </div>

            {/* Legend — mobile only */}
            <div className="mt-4 hidden max-md:flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-[#A9B3C7]">
                <span className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-[3px] bg-[#16213A]" /> Available
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-[3px] bg-[#E8B65C]" /> Selected
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-[3px] border border-[#E8B65C]" /> Today
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-[3px] border border-dashed border-[#2A3654]" /> Closed
                </span>
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

function BackBtn({ onClick, className }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn("flex items-center gap-1 text-sm font-medium mb-5 transition-opacity hover:opacity-70", className)}
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
        <div className="flex min-w-0 flex-col gap-[18px] h-full md:gap-5">
            {/* Brand — hidden on mobile (compact header), unchanged on desktop */}
            <div className="hidden items-center gap-3 md:flex">
                <div className="w-10 h-10 rounded-full gold-gradient flex items-center justify-center font-bold text-lg shadow-lg"
                    style={{ color: "hsl(var(--midnight))" }}>
                    I
                </div>
                <span className="text-xs font-semibold uppercase tracking-widest"
                    style={{ color: "hsl(var(--gold))" }}>
                    Infinity Home Spa
                </span>
            </div>

            <h2 className="min-w-0 text-[26px] md:text-3xl font-display font-bold leading-tight"
                style={{ color: "hsl(var(--foreground))" }}>
                Book Your{" "}
                <span className="gold-text italic">Spa Experience</span>
            </h2>

            {/* Meta info — desktop: original icon+text rows, including the
                selected date/time line (unchanged). Mobile: two compact chips
                only; the date/time line is dropped since the sticky bar below
                already shows it. */}
            <div className="hidden md:block space-y-2.5">
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

            <div className="flex flex-wrap gap-2 md:hidden">
                <span className="flex h-7 max-w-full items-center gap-1.5 rounded-[6px] border border-border bg-[#16213A] px-2.5 text-[12px] text-muted-foreground">
                    <Clock className="h-3 w-3 flex-shrink-0" style={{ color: "hsl(var(--gold))" }} />
                    60–120 min sessions · 4PM to 4AM
                </span>
                {step >= 2 && (
                    <span className="flex h-7 items-center gap-1.5 rounded-[6px] border border-border bg-[#16213A] px-2.5 text-[12px] text-muted-foreground">
                        <Globe className="h-3 w-3 flex-shrink-0" style={{ color: "hsl(var(--gold))" }} />
                        Dubai Time (GST)
                    </span>
                )}
            </div>

            {/* Divider */}
            <div className="border-t" style={{ borderColor: "hsl(var(--border))" }} />

            {/* Description — hidden on mobile entirely (compact header);
                desktop (md:) keeps both paragraphs, unchanged. */}
            <div className="hidden md:block space-y-3">
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
            <div className="mt-auto pt-6 hidden md:block">
                <div className="h-px w-full gold-gradient opacity-30 rounded-full" />
            </div>
        </div>
    );
}

// ── Mobile step header (purely visual — reuses each step's existing heading
//    text, just repositioned/restyled; adds "STEP n/4" chrome only) ─────────

function MobileStepHeader({ title, step, titleClassName }) {
    return (
        <div className="mb-4 flex items-center justify-between gap-2 md:hidden">
            <h3 className={cn("min-w-0 flex-1 truncate font-display leading-7 text-[#F3EFE6]", titleClassName || "text-[22px]")}>
                {title}
            </h3>
            <span className="flex-shrink-0 whitespace-nowrap font-mono text-[11px] tracking-wide text-[#8390A8]">
                STEP {step} / 4
            </span>
        </div>
    );
}

// ── Mobile progress bar (purely visual) ──────────────────────────────────────

function MobileProgressBar({ step }) {
    const segments = ["Date", "Time", "Details", "Done"];
    return (
        <div className="mb-6 md:hidden">
            <div className="flex items-center gap-1.5">
                {segments.map((label, i) => {
                    const isComplete = i < step || (i === 3 && step === 3);
                    const isCurrent = i === step && step < 3;
                    return (
                        <div key={label} className="h-[3px] flex-1 rounded-full bg-[#24304B] overflow-hidden">
                            <div
                                className={cn(
                                    "h-full rounded-full",
                                    (isComplete || isCurrent) ? "bg-[#E8B65C] w-full" : "w-0"
                                )}
                            />
                        </div>
                    );
                })}
            </div>
            <div className="mt-1.5 flex items-center gap-1.5">
                {segments.map((label, i) => {
                    const isComplete = i < step || (i === 3 && step === 3);
                    const isCurrent = i === step && step < 3;
                    return (
                        <div
                            key={label}
                            className={cn(
                                "flex flex-1 items-center justify-center gap-1 text-[11px]",
                                isCurrent ? "font-semibold text-[#F3EFE6]" : isComplete ? "text-[#E8B65C]" : "text-[#8390A8]"
                            )}
                        >
                            {isComplete && <Check className="h-3 w-3" />}
                            {label}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export const BookingForm = ({ preselectedServiceId } = {}) => {
    const [services, setServices] = useState([]);
    const [servicesStatus, setServicesStatus] = useState("loading"); // loading | ready | error
    const [step, setStep] = useState(0);
    const [selectedDateObj, setSelectedDateObj] = useState(null);
    const [selectedTime, setSelectedTime] = useState(null);
    const [confirmedData, setConfirmedData] = useState(null);

    const {
        register,
        handleSubmit,
        setValue,
        watch,
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

    const selectedServiceId = watch("service_id");

    const loadServices = () => {
        setServicesStatus("loading");
        axios.get("/api/guest/services")
            .then(res => {
                setServices(res.data);
                setServicesStatus("ready");
            })
            .catch(() => {
                setServicesStatus("error");
                toast.error("Failed to load services");
            });
    };

    useEffect(() => {
        loadServices();
    }, []);

    // "Book Now" on a service card (PopularServices) sets this in Welcome.jsx.
    // Once the real service list has loaded, pre-fill the Service field with
    // it — the customer still starts at the Date step, nothing else changes.
    useEffect(() => {
        if (preselectedServiceId && services.some(s => String(s.id) === String(preselectedServiceId))) {
            setValue("service_id", String(preselectedServiceId), { shouldValidate: true });
        }
    }, [preselectedServiceId, services]);

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

    const renderTimeSlotButton = (time) => {
        const isSel = selectedTime?.value === time.value;
        return (
            <div key={time.value} className="contents md:flex md:gap-2">
                <button
                    type="button"
                    onClick={() => setSelectedTime(time)}
                    aria-pressed={isSel}
                    className={cn(
                        "flex-1 py-3 rounded-lg border text-sm font-medium transition-all hover:border-gold/50",
                        // Mobile-only override (forced to win over the inline style below).
                        "max-md:!flex-none max-md:!w-full max-md:!h-11 max-md:!py-0 max-md:!flex max-md:!items-center max-md:!justify-center",
                        "max-md:![font-family:ui-monospace,SFMono-Regular,monospace] max-md:!text-[13px] max-md:!font-medium max-md:!rounded-[8px]",
                        isSel
                            ? "max-md:!bg-[#2A2110] max-md:!border-[1.5px] max-md:!border-[#E8B65C] max-md:!text-[#E8B65C]"
                            : "max-md:!bg-[#16213A] max-md:!border-[#24304B] max-md:!text-[#F3EFE6]"
                    )}
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
                        className="btn-gold shrink-0 px-4 sm:px-5 py-3 rounded-lg text-sm font-semibold hidden md:inline-flex"
                    >
                        Next
                    </button>
                )}
            </div>
        );
    };

    const renderStep = () => {

        /* ── STEP 0: Date ── */
        if (step === 0) return (
            <div className="min-w-0">
                <MobileStepHeader title="Select a Date" step={1} />
                <h3 className="hidden md:block text-center text-base font-bold mb-5"
                    style={{ color: "hsl(var(--foreground))" }}>
                    Select a Date
                </h3>
                <p className="hidden md:block text-center text-xs mb-4 text-muted-foreground">
                    ⚠️ Therapists are closed on <span className="text-gold font-medium">Tuesdays</span>
                </p>
                <div className="md:hidden mb-4 flex items-start gap-2 rounded-[10px] border border-[#24447A] bg-[#132544] px-3 py-2.5 text-[13px] text-[#6EA8F7]">
                    <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <p>Therapists are closed on <span className="font-semibold">Tuesdays</span>.</p>
                </div>
                <MiniCalendar selectedDate={selectedDateObj} onSelect={(date) => {
                    setSelectedDateObj(date);
                    setSelectedTime(null);
                }} />
                <button
                    type="button"
                    onClick={() => selectedDateObj && setStep(1)}
                    disabled={!selectedDateObj}
                    className={cn(
                        "btn-gold mt-6 w-full py-3 rounded-xl text-sm font-semibold tracking-wide hidden md:block",
                        !selectedDateObj && "opacity-40 cursor-not-allowed pointer-events-none"
                    )}
                >
                    Next
                </button>
            </div>
        );

        /* ── STEP 1: Time ── */
        if (step === 1) return (
            <div className="min-w-0">
                <BackBtn onClick={() => setStep(0)} className="hidden md:flex" />
                <MobileStepHeader title="Select a Time" step={2} />

                {/* Mobile summary chip */}
                <div className="md:hidden mb-5 flex items-center gap-2 justify-between rounded-[10px] bg-[#16213A] px-3 py-2.5">
                    <span className="min-w-0 flex-1 truncate font-mono text-[12px] uppercase tracking-wide text-[#F3EFE6]">
                        {format(selectedDateObj, "EEE, MMM d").toUpperCase()}
                    </span>
                    <button type="button" onClick={() => setStep(0)} className="flex-shrink-0 whitespace-nowrap text-[13px] font-semibold text-[#E8B65C]">
                        Change
                    </button>
                </div>

                <h3 className="hidden md:block text-lg font-bold mb-0.5" style={{ color: "hsl(var(--foreground))" }}>
                    {format(selectedDateObj, "EEEE")}
                </h3>
                <p className="hidden md:block text-sm mb-1" style={{ color: "hsl(var(--muted-foreground))" }}>
                    {format(selectedDateObj, "MMMM d, yyyy")}
                </p>
                <div className="hidden md:flex items-center gap-1.5 text-xs mb-5"
                    style={{ color: "hsl(var(--muted-foreground))" }}>
                    <Globe className="h-3.5 w-3.5" />
                    <span>Dubai Time (GST) · 4PM to 4AM</span>
                </div>

                <p className="hidden md:block text-center font-semibold text-sm mb-1"
                    style={{ color: "hsl(var(--foreground))" }}>
                    Select a Time
                </p>
                <p className="hidden md:block text-center text-xs mb-4"
                    style={{ color: "hsl(var(--muted-foreground))" }}>
                    Duration: Varies by service
                </p>

                {/* Custom scrollbar container */}
                <style>{scrollbarStyles}</style>
                <div className="grid grid-cols-3 gap-2 md:grid-cols-1 md:gap-0 md:space-y-2 md:max-h-72 md:overflow-y-auto md:pr-1 md:custom-scroll">
                    {/* Evening group header — mobile only, labels only, no change to slot data */}
                    <div className="col-span-3 md:hidden mb-1 flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#8390A8]">
                            <Sun className="h-3.5 w-3.5" /> Evening
                        </span>
                        <span className="text-[11px] text-[#8390A8]">4:00 PM – 11:30 PM</span>
                    </div>
                    {EVENING_SLOTS.map(renderTimeSlotButton)}

                    {/* After-midnight group header — mobile only */}
                    <div className="col-span-3 md:hidden mt-2 mb-1 flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#8390A8]">
                            <Moon className="h-3.5 w-3.5" /> After midnight
                        </span>
                        <span className="text-[11px] text-[#8390A8]">12:00 AM – 4:00 AM</span>
                    </div>
                    {AFTER_MIDNIGHT_SLOTS.map(renderTimeSlotButton)}
                </div>
            </div>
        );

        /* ── STEP 2: Details ── */
        if (step === 2) return (
            <form id="guest-booking-form" onSubmit={handleSubmit(onSubmit)}>
                <BackBtn onClick={() => setStep(1)} className="hidden md:flex" />
                <MobileStepHeader title="Your Details" step={3} titleClassName="text-[20px]" />
                <h3 className="hidden md:block text-lg font-bold mb-5" style={{ color: "hsl(var(--foreground))" }}>
                    Your Details
                </h3>

                <div className="space-y-4">
                    {/* Name */}
                    <div className="min-w-0">
                        <label className={labelCls}>
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
                    <div className="min-w-0">
                        <label className={labelCls}>
                            Email <span className="text-red-400">*</span>
                        </label>
                        <input {...register("guest_email", {
                            required: "Email is required",
                            pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: "Enter a valid email" }
                        })}
                            type="email" placeholder="you@example.com" className={inputCls} />
                        <ErrorMsg message={errors.guest_email?.message} />
                    </div>

                    {/* Location radios — same radios, restyled as wrapping chips on
                        mobile (native input stays, visually hidden via sr-only). */}
                    <div className="min-w-0">
                        <label className={cn(labelCls, "md:mb-2")}>
                            Location <span className="text-red-400">*</span>
                        </label>
                        <div className="space-y-2 md:space-y-2 max-md:!flex max-md:!flex-wrap max-md:!gap-2 max-md:!space-y-0">
                            {LOCATIONS.map(loc => (
                                <label key={loc} htmlFor={`loc-${loc}`}
                                    className={cn(
                                        "flex items-center gap-3 cursor-pointer group",
                                        "max-md:!h-9 max-md:!rounded-[8px] max-md:!border max-md:!border-[#24304B] max-md:!bg-[#16213A] max-md:!px-3 max-md:!gap-1.5",
                                        "has-[:checked]:max-md:!bg-[#2A2110] has-[:checked]:max-md:!border-[#E8B65C]"
                                    )}
                                >
                                    <input
                                        {...register("location", { required: "Please select a location" })}
                                        type="radio" id={`loc-${loc}`} value={loc}
                                        className="w-4 h-4 accent-[hsl(var(--gold))] max-md:!sr-only"
                                    />
                                    <span className="flex items-center gap-1.5 text-sm transition-colors
                                        group-hover:text-[hsl(var(--gold))] max-md:!text-[14px] group-has-[:checked]:max-md:!text-[#E8B65C]"
                                        style={{ color: "hsl(var(--foreground))" }}>
                                        <MapPin className="h-4 w-4 flex-shrink-0 max-md:!hidden"
                                            style={{ color: "hsl(var(--gold))" }} />
                                        <Check className="hidden h-4 w-4 flex-shrink-0 text-[#E8B65C] max-md:group-has-[:checked]:!inline" />
                                        {loc}
                                    </span>
                                </label>
                            ))}
                        </div>
                        <ErrorMsg message={errors.location?.message} />
                    </div>

                    {/* Phone */}
                    <div className="min-w-0">
                        <label className={labelCls}>
                            Phone Number <span className="text-red-400">*</span>
                        </label>
                        <div className="flex gap-2">
                            <div className="flex h-11 flex-shrink-0 items-center gap-1.5 px-3 rounded-lg border text-sm whitespace-nowrap max-md:!h-12 max-md:!w-[84px] max-md:!justify-center max-md:!gap-1 max-md:!px-2 max-md:!rounded-[8px] max-md:!border-[#66779B] max-md:!bg-[#0B1222]"
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
                                className={cn(inputCls, "flex-1 min-w-0 w-auto")} />
                        </div>
                        <ErrorMsg message={errors.guest_phone?.message} />
                    </div>

                    {/* Service — always rendered (and always registered) so a
                        slow/failed fetch can never leave this field out of
                        react-hook-form's validation. */}
                    <div className="min-w-0">
                        <label className={labelCls}>
                            Service <span className="text-red-400">*</span>
                        </label>
                        <select
                            {...register("service_id", { required: "Please select a service" })}
                            disabled={servicesStatus !== "ready"}
                            className={cn(
                                inputCls,
                                "appearance-none cursor-pointer",
                                servicesStatus !== "ready" && "cursor-not-allowed opacity-60"
                            )}
                        >
                            {servicesStatus === "loading" && <option value="">Loading treatments…</option>}
                            {servicesStatus === "error" && <option value="">Couldn't load treatments</option>}
                            {servicesStatus === "ready" && (
                                <>
                                    <option value="">Select a treatment...</option>
                                    {services.map(s => (
                                        <option key={s.id} value={String(s.id)}>{s.name}</option>
                                    ))}
                                </>
                            )}
                        </select>
                        {servicesStatus === "error" && (
                            <button
                                type="button"
                                onClick={loadServices}
                                className="mt-1.5 text-xs font-semibold text-[hsl(var(--gold))]"
                            >
                                Couldn't load treatments — tap to retry
                            </button>
                        )}
                        <ErrorMsg message={errors.service_id?.message} />
                    </div>
                </div>

                <p className="hidden md:block text-xs mt-4 leading-relaxed"
                    style={{ color: "hsl(var(--muted-foreground))" }}>
                    By proceeding, you confirm that you have read and agree to our terms and conditions.
                    No payment required now — our concierge will confirm via WhatsApp.
                </p>
                <div className="md:hidden mt-4 flex items-start gap-2 rounded-[10px] border border-[#1F5444] bg-[#0F2A24] px-3 py-2.5">
                    <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5 text-[#4CC79A]" />
                    <p className="text-[13px] leading-[19px] text-[#A9B3C7]">
                        By proceeding, you confirm that you have read and agree to our terms and conditions.
                        No payment required now — our concierge will confirm via WhatsApp.
                    </p>
                </div>

                <button
                    type="submit"
                    disabled={isSubmitting || !selectedServiceId}
                    className={cn(
                        "btn-gold mt-5 w-full py-3 rounded-xl text-sm font-semibold tracking-wide flex items-center justify-center gap-2 hidden md:flex",
                        (isSubmitting || !selectedServiceId) && "opacity-50 cursor-not-allowed pointer-events-none"
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
            <div className="min-w-0 text-center">
                <div className="mx-auto mb-4 hidden max-md:flex h-[72px] w-[72px] items-center justify-center rounded-full bg-[#0F2A24] border border-[#1F5444]">
                    <CheckCircle2 className="h-9 w-9 text-[#4CC79A]" />
                </div>
                <div className="flex items-center justify-center gap-2 mb-3 md:flex max-md:hidden">
                    <CheckCircle2 className="h-6 w-6 text-green-400" />
                    <h3 className="text-lg font-bold" style={{ color: "hsl(var(--foreground))" }}>
                        Booking Confirmed!
                    </h3>
                </div>
                <h3 className="hidden max-md:block font-display text-[22px] mb-2" style={{ color: "hsl(var(--foreground))" }}>
                    Booking Confirmed!
                </h3>
                <p className="text-sm mb-6" style={{ color: "hsl(var(--muted-foreground))" }}>
                    A confirmation email has been sent to your inbox.
                </p>

                <div className="min-w-0 rounded-xl border p-5 text-left space-y-3 max-md:!space-y-0 max-md:!divide-y max-md:!divide-[#24304B]"
                    style={{
                        backgroundColor: "hsl(var(--card))",
                        borderColor: "hsl(var(--gold) / 0.2)",
                    }}>
                    <h4 className="min-w-0 font-semibold text-sm flex items-center gap-2 max-md:!pb-3"
                        style={{ color: "hsl(var(--foreground))" }}>
                        <Sparkles className="h-4 w-4 flex-shrink-0" style={{ color: "hsl(var(--gold))" }} />
                        <span className="min-w-0 truncate">Infinity Home Spa</span>
                    </h4>
                    {selectedDateObj && selectedTime && (
                        <div className="min-w-0 flex items-center gap-2 text-sm font-medium max-md:!py-3"
                            style={{ color: "hsl(var(--foreground))" }}>
                            <CalendarDays className="h-4 w-4 flex-shrink-0"
                                style={{ color: "hsl(var(--muted-foreground))" }} />
                            <span className="min-w-0 truncate">
                                {selectedTime.label} · {format(selectedDateObj, "EEEE, MMMM d, yyyy")}
                            </span>
                        </div>
                    )}
                    <div className="min-w-0 flex items-center gap-2 text-sm max-md:!py-3"
                        style={{ color: "hsl(var(--muted-foreground))" }}>
                        <Globe className="h-4 w-4 flex-shrink-0" />
                        <span className="min-w-0 truncate">Dubai Time (GST)</span>
                    </div>
                    {confirmedData?.location && (
                        <div className="min-w-0 flex items-center gap-2 text-sm max-md:!pt-3"
                            style={{ color: "hsl(var(--muted-foreground))" }}>
                            <MapPin className="h-4 w-4 flex-shrink-0"
                                style={{ color: "hsl(var(--gold))" }} />
                            <span className="min-w-0 truncate">{confirmedData.location}</span>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    // ── Sticky mobile action bar — visual only, calls the exact same
    //    handlers/state as the inline controls above. sticky (not fixed),
    //    lives inside the card. Hidden at md: and up, and once confirmed. ──

    const renderMobileActionBar = () => {
        if (step > 2) return null;

        const dateLabel = selectedDateObj ? format(selectedDateObj, "EEE, MMM d").toUpperCase() : null;
        const timeLabel = step >= 1 && selectedTime ? selectedTime.label.toUpperCase() : null;

        return (
            <div className="sticky bottom-0 md:hidden -mx-4 sm:-mx-5 md:-mx-10 mt-6 border-t border-[#24304B] bg-[#111A2E] px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
                <div className="flex items-center gap-3">
                    {step >= 1 && (
                        <button
                            type="button"
                            onClick={() => setStep(step - 1)}
                            aria-label="Back"
                            className="flex h-11 w-11 flex-none items-center justify-center rounded-[8px] border border-[#24304B] text-[#F3EFE6]"
                        >
                            <ChevronLeft className="h-5 w-5" />
                        </button>
                    )}

                    <div className="min-w-0 flex-1">
                        <div className="truncate font-mono text-[12px] uppercase tracking-wide text-[#8390A8]">
                            {dateLabel || "Select a date"}
                        </div>
                        {timeLabel && (
                            <div className="truncate font-mono text-[12px] uppercase tracking-wide text-[#F3EFE6]">
                                {timeLabel}
                            </div>
                        )}
                    </div>

                    {step === 0 && (
                        <button
                            type="button"
                            onClick={() => selectedDateObj && setStep(1)}
                            disabled={!selectedDateObj}
                            className={cn(
                                "flex h-11 flex-none items-center gap-1.5 rounded-[8px] px-5 text-sm font-semibold",
                                selectedDateObj ? "bg-[#E8B65C] text-[#1A1206]" : "bg-[#16213A] text-[#4E5A73]"
                            )}
                        >
                            Next <ArrowRight className="h-4 w-4" />
                        </button>
                    )}

                    {step === 1 && (
                        <button
                            type="button"
                            onClick={() => selectedTime && setStep(2)}
                            disabled={!selectedTime}
                            className={cn(
                                "flex h-11 flex-none items-center gap-1.5 rounded-[8px] px-5 text-sm font-semibold",
                                selectedTime ? "bg-[#E8B65C] text-[#1A1206]" : "bg-[#16213A] text-[#4E5A73]"
                            )}
                        >
                            Next <ArrowRight className="h-4 w-4" />
                        </button>
                    )}

                    {step === 2 && (
                        <button
                            type="submit"
                            form="guest-booking-form"
                            disabled={isSubmitting || !selectedServiceId}
                            className={cn(
                                "flex h-11 flex-none items-center gap-1.5 rounded-[8px] px-5 text-sm font-semibold",
                                !isSubmitting && selectedServiceId ? "bg-[#E8B65C] text-[#1A1206]" : "bg-[#16213A] text-[#4E5A73]"
                            )}
                        >
                            {isSubmitting
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <>Confirm <ArrowRight className="h-4 w-4" /></>
                            }
                        </button>
                    )}
                </div>
            </div>
        );
    };

    // ── Layout ─────────────────────────────────────────────────────────────────

    return (
        <section
            id="booking"
            className="relative scroll-mt-16 sm:scroll-mt-20 pt-10 pb-6 px-5 md:py-24 md:px-4"
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
                <div className="glass-card-strong overflow-hidden grid grid-cols-1 md:grid-cols-2 max-md:!rounded-[14px]">
                    {/* Left: Info */}
                    <div className="min-w-0 p-4 md:p-10 border-b md:border-b-0 md:border-r max-md:!border-b-0 max-md:!pb-0"
                        style={{ borderColor: "hsl(var(--border))" }}>
                        <LeftPanel
                            selectedDate={selectedDateObj}
                            selectedTime={selectedTime}
                            step={step}
                        />
                    </div>

                    {/* Right: Steps */}
                    <div className="min-w-0 p-4 md:p-10 md:overflow-y-auto md:max-h-[85vh] md:custom-scroll">
                        <style>{scrollbarStyles}</style>
                        <MobileProgressBar step={step} />
                        {renderStep()}
                        {renderMobileActionBar()}
                    </div>
                </div>
            </div>
        </section>
    );
};
