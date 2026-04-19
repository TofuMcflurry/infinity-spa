import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const services = [
  "Deep Tissue Massage",
  "Royal Hammam Ritual",
  "Luxury Gold Facial",
  "Swedish Massage",
];

const times = [
  "09:00", "10:00", "11:00", "12:00", "13:00",
  "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00",
];

export const BookingForm = () => {
  const [date, setDate] = useState<Date>();
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") ?? "");
    const service = String(fd.get("service") ?? "");
    if (!name || !service || !date) {
      toast.error("Please complete all required fields");
      return;
    }
    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);
      toast.success("Booking confirmed", {
        description: `${service} · ${format(date!, "PPP")} · See you soon, ${name}.`,
      });
      (e.target as HTMLFormElement).reset();
      setDate(undefined);
    }, 700);
  };

  return (
    <section id="booking" className="relative py-24">
      <div className="absolute inset-0 bg-radial-gold opacity-60" />
      <div className="container relative">
        <div className="mx-auto max-w-3xl">
          <div className="text-center">
            <span className="gold-divider text-xs uppercase tracking-[0.3em] text-primary">
              Reserve Your Ritual
            </span>
            <h2 className="mt-4 font-display text-4xl sm:text-5xl md:text-6xl">
              Book Your <span className="italic text-gradient-gold">Experience</span>
            </h2>
            <p className="mt-4 text-muted-foreground">
              Same-day availability across Dubai. We arrive within 90 minutes.
            </p>
          </div>

          <form
            onSubmit={onSubmit}
            className="mt-12 rounded-3xl border border-border/60 bg-card/60 p-6 shadow-luxe backdrop-blur-xl sm:p-10"
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="service">Service</Label>
                <Select name="service">
                  <SelectTrigger id="service" className="mt-2 h-12">
                    <SelectValue placeholder="Select a treatment" />
                  </SelectTrigger>
                  <SelectContent>
                    {services.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        "mt-2 h-12 w-full justify-start text-left font-normal",
                        !date && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {date ? format(date, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={date}
                      onSelect={setDate}
                      disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                <Label htmlFor="time">Time</Label>
                <Select name="time">
                  <SelectTrigger id="time" className="mt-2 h-12">
                    <SelectValue placeholder="Select time" />
                  </SelectTrigger>
                  <SelectContent>
                    {times.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="sm:col-span-2">
                <Label htmlFor="address">Address</Label>
                <Input id="address" name="address" placeholder="Villa / building, area, Dubai" className="mt-2 h-12" />
              </div>

              <div>
                <Label htmlFor="name">Full Name</Label>
                <Input id="name" name="name" placeholder="Your name" className="mt-2 h-12" required />
              </div>

              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" placeholder="you@example.com" className="mt-2 h-12" required />
              </div>
            </div>

            <Button
              type="submit"
              variant="luxe"
              size="xl"
              disabled={submitting}
              className="mt-8 w-full"
            >
              <Sparkles className="mr-2 h-4 w-4" />
              {submitting ? "Confirming..." : "Confirm Booking"}
            </Button>

            <p className="mt-4 text-center text-xs text-muted-foreground">
              No payment required now. Our concierge will confirm via WhatsApp.
            </p>
          </form>
        </div>
      </div>
    </section>
  );
};
