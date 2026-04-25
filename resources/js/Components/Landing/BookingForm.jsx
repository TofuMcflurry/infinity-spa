import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { addDays, format, isToday, startOfDay } from "date-fns";
import { CalendarIcon, Loader2, MapPin, Sparkles, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import axios from "axios";
import { cn } from "@/lib/utils";
import { Calendar } from "@/Components/Landing/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/Components/Landing/ui/popover";
import {
    Select, SelectContent, SelectItem,
    SelectTrigger, SelectValue,
} from "@/Components/Landing/ui/select";

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

// Generate time slots: 9 AM to 9 PM (1 hour intervals)
const generateTimeSlots = () => {
    return Array.from({ length: 13 }, (_, i) => {
        const hour = 9 + i;
        const ampm = hour < 12 ? "AM" : "PM";
        const displayHour = hour < 12 ? hour : hour === 12 ? 12 : hour - 12;
        const value = String(hour).padStart(2, "0") + ":00";
        const label = `${displayHour}:00 ${ampm}`;
        return { value, label };
    });
};

const ALL_TIME_SLOTS = generateTimeSlots();

// ── Styling Classes ───────────────────────────────────────────────────────────

const inputClass = cn(
    "h-12 w-full rounded-lg border border-gold/20 bg-[#0B1220] px-4 text-sm",
    "text-white placeholder:text-white/50",
    "focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold/50",
    "disabled:opacity-50 disabled:cursor-not-allowed",
    "transition-all duration-200"
);

const selectTriggerClass = cn(
    "h-12 w-full rounded-lg border border-gold/20 bg-[#0B1220] px-4 text-sm",
    "text-white data-[placeholder]:text-white/50",
    "focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold/50",
    "disabled:opacity-50 disabled:cursor-not-allowed",
    "transition-all duration-200"
);

// ── Label Component ────────────────────────────────────────────────────────────

function FormLabel({ children, required }) {
    return (
        <label className="block text-xs font-semibold text-gold uppercase tracking-widest mb-2">
            {children}
            {required && <span className="text-red-400 ml-1">*</span>}
        </label>
    );
}

// ── Error Message Component ────────────────────────────────────────────────────

function ErrorMsg({ message }) {
    if (!message) return null;
    return (
        <div className="mt-1.5 flex items-center gap-2 text-xs text-red-400">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
            <span>{message}</span>
        </div>
    );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export const BookingForm = () => {
    const [services, setServices] = useState([]);
    const [calendarOpen, setCalendarOpen] = useState(false);
    const [selectedDateObj, setSelectedDateObj] = useState(null);

    const {
        control,
        handleSubmit,
        watch,
        reset: resetForm,
        formState: { errors, isSubmitting, isValid, isDirty },
    } = useForm({
        mode: "onChange",
        defaultValues: {
            service_id: "",
            booking_date: "",
            booking_time: "",
            location: "",
            guest_name: "",
            guest_email: "",
            guest_phone: "",
        },
    });

    // Watch form values
    const selectedDate = watch("booking_date");
    const selectedTime = watch("booking_time");

    // Date constraints: earliest booking is tomorrow, max 30 days ahead
    const today = startOfDay(new Date());
    const tomorrow = addDays(today, 1);
    const maxDate = addDays(today, 30);

    // Fetch services
    useEffect(() => {
        axios
            .get("/api/guest/services")
            .then(res => setServices(res.data))
            .catch(() => {
                toast.error("Failed to load services");
            });
    }, []);

    // Filter available times based on selected date
    const getAvailableTimes = () => {
        if (!selectedDateObj) return [];

        // If booking for today, exclude past hours
        if (isToday(selectedDateObj)) {
            const currentHour = new Date().getHours();
            return ALL_TIME_SLOTS.filter(slot => {
                const slotHour = parseInt(slot.value.split(":")[0]);
                return slotHour > currentHour;
            });
        }

        return ALL_TIME_SLOTS;
    };

    const availableTimes = getAvailableTimes();

    // Email validation
    const validateEmail = (email) => {
        if (!email) return "Email is required";
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email) || "Enter a valid email address";
    };

    // Phone validation
    const validatePhone = (phone) => {
        if (!phone) return "Phone number is required";
        const digits = phone.replace(/\D/g, "");
        return digits.length >= 10 || "Phone must have at least 10 digits";
    };

    // Form submission
    const onSubmit = async (data) => {
        try {
            await axios.post("/guest-booking", {
                service_id: data.service_id,
                date: data.booking_date,
                time: data.booking_time,
                location: data.location,
                guest_name: data.guest_name,
                guest_email: data.guest_email,
                guest_phone: data.guest_phone,
            });

            toast.success("Booking submitted! Check your email for confirmation.");
            resetForm();
            setSelectedDateObj(null);
        } catch (error) {
            const errorData = error.response?.data?.errors;
            if (errorData) {
                const firstError = Object.values(errorData)[0];
                const message = Array.isArray(firstError) ? firstError[0] : firstError;
                toast.error(message);
            } else {
                toast.error("Something went wrong. Please try again.");
            }
        }
    };

    // Button should be disabled if form is invalid or not dirty or submitting
    const isButtonDisabled = !isValid || !isDirty || isSubmitting;

    return (
        <section id="booking" className="relative py-24">
            {/* Background gradient */}
            <div className="absolute inset-0 bg-gradient-radial from-gold/10 via-transparent to-transparent opacity-40" />

            <div className="container relative z-10">
                <div className="mx-auto max-w-2xl">
                    {/* ── Section Title ── */}
                    <div className="text-center mb-12">
                        <div className="flex items-center justify-center gap-2 mb-3">
                            <div className="h-px w-12 bg-gradient-to-r from-transparent to-gold" />
                            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">
                                Reserve Your Ritual
                            </span>
                            <div className="h-px w-12 bg-gradient-to-l from-transparent to-gold" />
                        </div>
                        <h2 className="text-4xl sm:text-5xl md:text-6xl font-display font-bold text-white leading-tight">
                            Book Your{" "}
                            <span className="italic text-transparent bg-clip-text bg-gradient-to-r from-gold via-gold/80 to-gold">
                                Experience
                            </span>
                        </h2>
                        <p className="mt-4 text-white/60 text-base">
                            Same-day availability across Dubai. We arrive within 90 minutes.
                        </p>
                    </div>

                    {/* ── Booking Form ── */}
                    <form
                        onSubmit={handleSubmit(onSubmit)}
                        className="rounded-2xl border border-gold/20 bg-[#0B1220]/80 backdrop-blur-xl p-6 sm:p-10 shadow-2xl"
                    >
                        <div className="grid gap-6 sm:grid-cols-2">
                            {/* ══════════════════════════════════════════════════
                                SERVICE SELECTION (full width)
                                ══════════════════════════════════════════════════ */}
                            <div className="sm:col-span-2">
                                <FormLabel required>Service</FormLabel>
                                <Controller
                                    name="service_id"
                                    control={control}
                                    rules={{ required: "Please select a service" }}
                                    render={({ field }) => (
                                        <>
                                            <Select
                                                value={field.value}
                                                onValueChange={field.onChange}
                                            >
                                                <SelectTrigger className={selectTriggerClass}>
                                                    <SelectValue placeholder="Select your treatment" />
                                                </SelectTrigger>
                                                <SelectContent className="bg-[#0B1220] border border-gold/20">
                                                    {services.length === 0 ? (
                                                        <div className="p-2 text-sm text-white/50">
                                                            Loading services...
                                                        </div>
                                                    ) : (
                                                        services.map(service => (
                                                            <SelectItem
                                                                key={service.id}
                                                                value={String(service.id)}
                                                                className="cursor-pointer"
                                                            >
                                                                <div className="flex items-center gap-2">
                                                                    <span>{service.name}</span>
                                                                    <span className="text-xs text-gold/60">
                                                                        ({service.duration_minutes} min)
                                                                    </span>
                                                                </div>
                                                            </SelectItem>
                                                        ))
                                                    )}
                                                </SelectContent>
                                            </Select>
                                            <ErrorMsg message={errors.service_id?.message} />
                                        </>
                                    )}
                                />
                            </div>

                            {/* ══════════════════════════════════════════════════
                                DATE PICKER
                                ══════════════════════════════════════════════════ */}
                            <div>
                                <FormLabel required>Date</FormLabel>
                                <Controller
                                    name="booking_date"
                                    control={control}
                                    rules={{ required: "Please select a date" }}
                                    render={({ field }) => (
                                        <>
                                            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                                                <PopoverTrigger asChild>
                                                    <button
                                                        type="button"
                                                        className={cn(
                                                            inputClass,
                                                            "flex items-center justify-between gap-2",
                                                            !selectedDateObj && "text-white/50"
                                                        )}
                                                    >
                                                        <span className="flex items-center gap-2">
                                                            <CalendarIcon className="h-4 w-4 text-gold" />
                                                            {selectedDateObj
                                                                ? format(selectedDateObj, "d MMM yyyy")
                                                                : "Pick a date"}
                                                        </span>
                                                    </button>
                                                </PopoverTrigger>
                                                <PopoverContent
                                                    className="w-auto border border-gold/20 bg-[#0B1220] p-3"
                                                    align="start"
                                                >
                                                    <Calendar
                                                        mode="single"
                                                        selected={selectedDateObj}
                                                        onSelect={(date) => {
                                                            if (date) {
                                                                setSelectedDateObj(date);
                                                                field.onChange(format(date, "yyyy-MM-dd"));
                                                                setCalendarOpen(false);
                                                            }
                                                        }}
                                                        disabled={date =>
                                                            date < tomorrow || date > maxDate
                                                        }
                                                        initialFocus
                                                    />
                                                </PopoverContent>
                                            </Popover>
                                            <ErrorMsg message={errors.booking_date?.message} />
                                        </>
                                    )}
                                />
                            </div>

                            {/* ══════════════════════════════════════════════════
                                TIME PICKER
                                ══════════════════════════════════════════════════ */}
                            <div>
                                <FormLabel required>Time</FormLabel>
                                <Controller
                                    name="booking_time"
                                    control={control}
                                    rules={{ required: "Please select a time" }}
                                    render={({ field }) => (
                                        <>
                                            <Select
                                                value={field.value}
                                                onValueChange={field.onChange}
                                                disabled={!selectedDateObj}
                                            >
                                                <SelectTrigger className={selectTriggerClass}>
                                                    <SelectValue
                                                        placeholder={
                                                            selectedDateObj
                                                                ? "Select a time"
                                                                : "Pick a date first"
                                                        }
                                                    />
                                                </SelectTrigger>
                                                <SelectContent className="bg-[#0B1220] border border-gold/20">
                                                    {availableTimes.length === 0 ? (
                                                        <div className="p-2 text-sm text-white/50">
                                                            {isToday(selectedDateObj)
                                                                ? "No available slots today"
                                                                : "No available times"}
                                                        </div>
                                                    ) : (
                                                        availableTimes.map(time => (
                                                            <SelectItem
                                                                key={time.value}
                                                                value={time.value}
                                                                className="cursor-pointer"
                                                            >
                                                                {time.label}
                                                            </SelectItem>
                                                        ))
                                                    )}
                                                </SelectContent>
                                            </Select>
                                            <ErrorMsg message={errors.booking_time?.message} />
                                        </>
                                    )}
                                />
                            </div>

                            {/* ══════════════════════════════════════════════════
                                LOCATION (full width)
                                ══════════════════════════════════════════════════ */}
                            <div className="sm:col-span-2">
                                <FormLabel required>Location</FormLabel>
                                <Controller
                                    name="location"
                                    control={control}
                                    rules={{ required: "Please select a location" }}
                                    render={({ field }) => (
                                        <>
                                            <Select
                                                value={field.value}
                                                onValueChange={field.onChange}
                                            >
                                                <SelectTrigger className={selectTriggerClass}>
                                                    <SelectValue placeholder="Select your area in Dubai" />
                                                </SelectTrigger>
                                                <SelectContent className="bg-[#0B1220] border border-gold/20">
                                                    {LOCATIONS.map(location => (
                                                        <SelectItem
                                                            key={location}
                                                            value={location}
                                                            className="cursor-pointer"
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <MapPin className="h-3.5 w-3.5 text-gold" />
                                                                {location}
                                                            </div>
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <ErrorMsg message={errors.location?.message} />
                                        </>
                                    )}
                                />
                            </div>

                            {/* ══════════════════════════════════════════════════
                                FULL NAME
                                ══════════════════════════════════════════════════ */}
                            <div>
                                <FormLabel required>Full Name</FormLabel>
                                <Controller
                                    name="guest_name"
                                    control={control}
                                    rules={{
                                        required: "Full name is required",
                                        minLength: { value: 2, message: "Name must be at least 2 characters" },
                                    }}
                                    render={({ field }) => (
                                        <>
                                            <input
                                                {...field}
                                                type="text"
                                                className={inputClass}
                                                placeholder="Your full name"
                                                autoComplete="name"
                                            />
                                            <ErrorMsg message={errors.guest_name?.message} />
                                        </>
                                    )}
                                />
                            </div>

                            {/* ══════════════════════════════════════════════════
                                EMAIL ADDRESS
                                ══════════════════════════════════════════════════ */}
                            <div>
                                <FormLabel required>Email Address</FormLabel>
                                <Controller
                                    name="guest_email"
                                    control={control}
                                    rules={{
                                        required: "Email is required",
                                        validate: validateEmail,
                                    }}
                                    render={({ field }) => (
                                        <>
                                            <input
                                                {...field}
                                                type="email"
                                                className={inputClass}
                                                placeholder="you@example.com"
                                                autoComplete="email"
                                            />
                                            <ErrorMsg message={errors.guest_email?.message} />
                                        </>
                                    )}
                                />
                            </div>

                            {/* ══════════════════════════════════════════════════
                                PHONE NUMBER (full width)
                                ══════════════════════════════════════════════════ */}
                            <div className="sm:col-span-2">
                                <FormLabel required>Phone Number</FormLabel>
                                <Controller
                                    name="guest_phone"
                                    control={control}
                                    rules={{
                                        required: "Phone number is required",
                                        validate: validatePhone,
                                    }}
                                    render={({ field }) => (
                                        <>
                                            <input
                                                {...field}
                                                type="tel"
                                                className={inputClass}
                                                placeholder="+971 50 000 0000"
                                                autoComplete="tel"
                                            />
                                            <ErrorMsg message={errors.guest_phone?.message} />
                                        </>
                                    )}
                                />
                            </div>
                        </div>

                        {/* ══════════════════════════════════════════════════
                            SUBMIT BUTTON
                            ══════════════════════════════════════════════════ */}
                        <div className="mt-8 space-y-4">
                            <button
                                type="submit"
                                disabled={isButtonDisabled}
                                className={cn(
                                    "w-full h-12 rounded-full font-semibold uppercase tracking-wider",
                                    "transition-all duration-300 flex items-center justify-center gap-2",
                                    isButtonDisabled
                                        ? "bg-gold/40 text-black/50 cursor-not-allowed"
                                        : "bg-gold hover:bg-gold/90 text-black cursor-pointer shadow-lg hover:shadow-xl hover:scale-105"
                                )}
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Submitting...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="h-4 w-4" />
                                        Confirm Booking
                                    </>
                                )}
                            </button>

                            <p className="text-center text-xs text-white/50">
                                No payment required now. Our concierge will confirm via WhatsApp within 30 minutes.
                            </p>
                        </div>
                    </form>
                </div>
            </div>
        </section>
    );
};
