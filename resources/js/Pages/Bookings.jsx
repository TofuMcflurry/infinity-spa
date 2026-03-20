import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Star, MapPin, Loader2, Check, Clock } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { servicesData, therapistsData, timeSlots } from '@/data/services';
import { Calendar } from '@/Components/Customer/ui/calendar';
import { cn } from '@/lib/utils';

export default function Bookings() {
  const { t, locale } = useLanguage();

  const [step, setStep] = useState(1);
  const [selectedService, setSelectedService] = useState(null);
  const [selectedTherapist, setSelectedTherapist] = useState(null);
  const [selectedDate, setSelectedDate] = useState(undefined);
  const [selectedTime, setSelectedTime] = useState(null);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);

  const locations = [
    { key: 'home', label: locale === 'ar' ? 'المنزل - نخلة جميرا' : 'Home - Palm Jumeirah' },
    { key: 'office', label: locale === 'ar' ? 'المكتب - DIFC' : 'Office - DIFC' },
    { key: 'hotel', label: locale === 'ar' ? 'الفندق - برج العرب' : 'Hotel - Burj Al Arab' },
  ];

  const canProceed = () => {
    if (step === 1) return !!selectedService;
    if (step === 2) return !!selectedTherapist;
    if (step === 3) return !!selectedDate && !!selectedTime && !!selectedLocation;
    return false;
  };

  const handleConfirm = useCallback(async () => {
    setIsLoading(true);
    await new Promise((r) => setTimeout(r, 2000));
    setIsLoading(false);
    setIsConfirmed(true);
  }, []);

  const stepLabels = [t.booking.step1, t.booking.step2, t.booking.step3];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 glass-card-strong rounded-none border-x-0 border-t-0 px-5 pt-[env(safe-area-inset-top)] pb-4">
        <div className="pt-3 max-w-4xl mx-auto">
          <motion.h1 initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="font-display text-xl font-bold">
            {t.booking.title}
          </motion.h1>
          <div className="flex items-center gap-2 mt-3">
            {stepLabels.map((label, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  step > i + 1 ? 'gold-gradient text-primary-foreground' :
                  step === i + 1 ? 'border-2 border-gold text-gold' :
                  'bg-secondary text-muted-foreground'
                }`}>
                  {step > i + 1 ? <Check className="w-3.5 h-3.5" /> : i + 1}
                </div>
                <span className={`text-xs hidden sm:inline ${step === i + 1 ? 'text-gold font-medium' : 'text-muted-foreground'}`}>
                  {label}
                </span>
                {i < 2 && <div className="w-6 sm:w-12 h-px bg-border" />}
              </div>
            ))}
          </div>
        </div>
      </header>

      <main className="px-4 pt-5 max-w-4xl mx-auto">
        <AnimatePresence mode="wait">
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
              <p className="text-muted-foreground text-sm">
                {locale === 'ar' ? selectedService?.nameAr : selectedService?.name} •{' '}
                {locale === 'ar' ? selectedTherapist?.nameAr : selectedTherapist?.name}
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
              {step === 1 && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground mb-4">{t.booking.selectService}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {servicesData.map((service) => {
                      const isSelected = selectedService?.id === service.id;
                      const name = locale === 'ar' ? service.nameAr : service.name;
                      const total = service.price * 1.05;
                      return (
                        <button
                          key={service.id}
                          onClick={() => setSelectedService(service)}
                          className={`glass-card p-4 text-start transition-all ${
                            isSelected ? 'ring-2 ring-gold' : 'hover:bg-secondary/40'
                          }`}
                        >
                          <h4 className="font-display font-semibold text-sm">{name}</h4>
                          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{service.duration} min</span>
                            <span className="gold-text font-semibold">AED {total.toFixed(0)}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground mb-4">{t.booking.selectTherapist}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {therapistsData.map((therapist) => {
                      const isSelected = selectedTherapist?.id === therapist.id;
                      const name = locale === 'ar' ? therapist.nameAr : therapist.name;
                      const spec = locale === 'ar' ? therapist.specialtyAr : therapist.specialty;
                      return (
                        <button
                          key={therapist.id}
                          onClick={() => setSelectedTherapist(therapist)}
                          className={`glass-card p-4 text-start transition-all ${
                            isSelected ? 'ring-2 ring-gold' : 'hover:bg-secondary/40'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-full gold-gradient flex items-center justify-center text-primary-foreground font-display font-bold text-sm">
                              {therapist.name.charAt(0)}
                            </div>
                            <div>
                              <h4 className="font-display font-semibold text-sm">{name}</h4>
                              <p className="text-xs text-muted-foreground">{spec}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <div className="flex items-center gap-0.5">
                                  <Star className="w-3 h-3 text-gold fill-gold" />
                                  <span className="text-xs font-medium">{therapist.rating}</span>
                                </div>
                                <span className="text-[10px] text-muted-foreground">
                                  {therapist.experience} {t.booking.years}
                                </span>
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-5">
                  <div className="glass-card p-4">
                    <h4 className="font-display font-semibold text-sm mb-3">{t.booking.chooseDate}</h4>
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={setSelectedDate}
                      disabled={(date) => date < new Date()}
                      className={cn('p-3 pointer-events-auto mx-auto')}
                    />
                  </div>

                  <div className="glass-card p-4">
                    <h4 className="font-display font-semibold text-sm mb-3">{t.booking.chooseTime}</h4>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {timeSlots.map((time) => (
                        <button
                          key={time}
                          onClick={() => setSelectedTime(time)}
                          className={`py-2 rounded-xl text-xs font-medium transition-all ${
                            selectedTime === time
                              ? 'gold-gradient text-primary-foreground'
                              : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                          }`}
                        >
                          {time}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="glass-card p-4">
                    <h4 className="font-display font-semibold text-sm mb-3">{t.booking.location}</h4>
                    <div className="space-y-2">
                      {locations.map((loc) => (
                        <button
                          key={loc.key}
                          onClick={() => setSelectedLocation(loc.key)}
                          className={`w-full flex items-center gap-3 p-3 rounded-xl text-start transition-all ${
                            selectedLocation === loc.key
                              ? 'bg-gold/10 border border-gold/40'
                              : 'bg-secondary hover:bg-secondary/80'
                          }`}
                        >
                          <MapPin className={`w-4 h-4 ${selectedLocation === loc.key ? 'text-gold' : 'text-muted-foreground'}`} />
                          <span className="text-sm">{loc.label}</span>
                        </button>
                      ))}
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
                <ChevronLeft className="w-4 h-4" />
                {t.booking.back}
              </button>
            )}
            <div className="flex-1" />
            {step < 3 ? (
              <button
                onClick={() => setStep(step + 1)}
                disabled={!canProceed()}
                className="btn-gold flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t.booking.next}
              </button>
            ) : (
              <button
                onClick={handleConfirm}
                disabled={!canProceed() || isLoading}
                className="btn-gold flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                {isLoading ? t.booking.confirmingBooking : t.booking.confirm}
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
