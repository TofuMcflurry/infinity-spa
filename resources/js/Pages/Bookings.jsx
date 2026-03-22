import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Star, MapPin, Loader2, Check, Clock, Banknote, CreditCard } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { servicesData, therapistsData, timeSlots } from '@/data/services';
import { Calendar } from '@/Components/ui/calendar';
import { cn } from '@/lib/utils';

export default function Bookings() {
  const { t, locale } = useLanguage();

  const [step, setStep] = useState(1);
  const [selectedService, setSelectedService] = useState(null);
  const [selectedTherapist, setSelectedTherapist] = useState(null);
  const [selectedDate, setSelectedDate] = useState(undefined);
  const [selectedTime, setSelectedTime] = useState(null);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [genderFilter, setGenderFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);

  const services = servicesData;
  const therapists = therapistsData;

  const filteredTherapists = genderFilter === 'all'
    ? therapists
    : therapists.filter(th => th.gender === genderFilter);

  const locations = [
    { key: 'home',   label: locale === 'ar' ? 'المنزل - نخلة جميرا' : 'Home - Palm Jumeirah' },
    { key: 'office', label: locale === 'ar' ? 'المكتب - DIFC'        : 'Office - DIFC'         },
    { key: 'hotel',  label: locale === 'ar' ? 'الفندق - برج العرب'   : 'Hotel - Burj Al Arab'  },
  ];

  const paymentMethods = [
    {
      id: 'cash',
      label: 'Cash',
      sub: 'Pay on arrival',
      desc: 'Pay directly to the therapist in cash',
      icon: Banknote,
    },
    {
      id: 'cashless',
      label: 'Cashless',
      sub: 'Card / App',
      desc: 'Pay by card or mobile app',
      icon: CreditCard,
    },
  ];

  const TOTAL_STEPS = 4;

  const canProceed = () => {
    if (step === 1) return !!selectedService;
    if (step === 2) return !!selectedTherapist;
    if (step === 3) return !!selectedDate && !!selectedTime && !!selectedLocation;
    if (step === 4) return !!selectedPayment;
    return false;
  };

  const handleConfirm = useCallback(async () => {
    setIsLoading(true);
    await new Promise((r) => setTimeout(r, 2000));
    setIsLoading(false);
    setIsConfirmed(true);
  }, []);

  const stepLabels = [
    t.booking.step1,
    t.booking.step2,
    t.booking.step3,
    locale === 'ar' ? 'الدفع' : 'Payment',
  ];

  const formattedDate = selectedDate
    ? selectedDate.toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
    : null;

  return (
    <AuthenticatedLayout>
      <div className="min-h-screen bg-background">

        {/* ── Header / Stepper ── */}
        <header className="sticky top-0 z-40 glass-card-strong rounded-none border-x-0 border-t-0 px-5 pt-[env(safe-area-inset-top)] pb-4">
          <div className="pt-3 max-w-4xl mx-auto">
            <motion.h1 initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="font-display text-xl font-bold">
              {t.booking.title}
            </motion.h1>
            <div className="flex items-center gap-2 mt-3">
              {stepLabels.map((label, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                    step > i + 1  ? 'gold-gradient text-primary-foreground' :
                    step === i + 1 ? 'border-2 border-gold text-gold' :
                                     'bg-secondary text-muted-foreground'
                  }`}>
                    {step > i + 1 ? <Check className="w-3.5 h-3.5" /> : i + 1}
                  </div>
                  <span className={`text-xs hidden sm:inline ${step === i + 1 ? 'text-gold font-medium' : 'text-muted-foreground'}`}>
                    {label}
                  </span>
                  {i < TOTAL_STEPS - 1 && <div className="w-6 sm:w-10 h-px bg-border" />}
                </div>
              ))}
            </div>
          </div>
        </header>

        {/* ── Main ── */}
        <main className="px-6 pt-5 pb-10 max-w-6xl mx-auto">
          <AnimatePresence mode="wait">

            {/* Confirmed screen */}
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
                  {locale === 'ar' ? (selectedService?.nameAr || selectedService?.name) : selectedService?.name} •{' '}
                  {locale === 'ar' ? (selectedTherapist?.nameAr || selectedTherapist?.name) : selectedTherapist?.name}
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

                {/* ══════════ STEP 1 ══════════ */}
                {step === 1 && (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground mb-4">{t.booking.selectService}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {services.map((service) => {
                        const isSelected = selectedService?.id === service.id;
                        const name = locale === 'ar' ? service.nameAr : service.name;
                        return (
                          <button
                            key={service.id}
                            onClick={() => setSelectedService(service)}
                            className={`glass-card p-4 text-start transition-all ${isSelected ? 'ring-2 ring-gold' : 'hover:bg-secondary/40'}`}
                          >
                            <h4 className="font-display font-semibold text-sm">{name}</h4>
                            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{service.duration} min</span>
                              <span className="gold-text font-semibold">AED {service.price}</span>
                            </div>
                            <div className="mt-2 flex items-center gap-1">
                              <Star className="w-3 h-3 text-gold fill-gold" />
                              <span className="text-xs text-muted-foreground">{service.rating}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ══════════ STEP 2 ══════════ */}
                {step === 2 && (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground mb-2">{t.booking.selectTherapist}</p>
                    <div className="flex gap-2 mb-4">
                      {['all', 'male', 'female'].map((g) => (
                        <button
                          key={g}
                          onClick={() => setGenderFilter(g)}
                          className={`px-4 py-2 rounded-xl text-xs font-medium transition-all ${
                            genderFilter === g ? 'gold-gradient text-primary-foreground' : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                          }`}
                        >
                          {g === 'all' ? 'All' : g === 'male' ? 'Male' : 'Female'}
                        </button>
                      ))}
                    </div>
                    {filteredTherapists.length === 0 ? (
                      <div className="glass-card p-8 text-center">
                        <p className="text-muted-foreground text-sm">{locale === 'ar' ? 'لا يوجد معالجون' : 'No therapists found'}</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {filteredTherapists.map((therapist) => {
                          const isSelected = selectedTherapist?.id === therapist.id;
                          const name = locale === 'ar' ? therapist.nameAr : therapist.name;
                          const spec = locale === 'ar' ? therapist.specialtyAr : therapist.specialty;
                          return (
                            <button
                              key={therapist.id}
                              onClick={() => setSelectedTherapist(therapist)}
                              className={`glass-card p-4 text-start transition-all ${isSelected ? 'ring-2 ring-gold' : 'hover:bg-secondary/40'}`}
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-full gold-gradient flex items-center justify-center text-primary-foreground font-display font-bold text-sm">
                                  {therapist.name.charAt(0)}
                                </div>
                                <div>
                                  <h4 className="font-display font-semibold text-sm">{name}</h4>
                                  <p className="text-xs text-muted-foreground">{spec}</p>
                                  <div className="flex items-center gap-2 mt-1">
                                    <Star className="w-3 h-3 text-gold fill-gold" />
                                    <span className="text-xs font-medium">{therapist.rating}</span>
                                    <span className="text-[10px] text-muted-foreground">{therapist.experience} {t.booking.years}</span>
                                  </div>
                                  <div className="mt-1 text-[10px] text-muted-foreground">
                                    {therapist.gender === 'male' ? '♂ Male' : '♀ Female'}
                                  </div>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* ══════════ STEP 3: Date, Time & Location ══════════ */}
                {step === 3 && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5" style={{ alignItems: 'stretch' }}>

                    {/* LEFT — Calendar */}
                    <div className="glass-card p-5 flex flex-col">
                      <h4 className="font-display font-semibold text-lg mb-3">{t.booking.chooseDate}</h4>
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

                    {/* RIGHT — Time + Location, same total height as left */}
                    <div className="flex flex-col gap-5" style={{ minHeight: '100%' }}>

                      {/* Time Slots — 4 cols × 3 rows */}
                      <div className="glass-card p-7 flex flex-col flex-1">
                        <h4 className="font-display font-semibold text-lg mb-5">{t.booking.chooseTime}</h4>
                        <div className="grid grid-cols-4 gap-3">
                          {timeSlots.map((time) => (
                            <button
                              key={time}
                              onClick={() => setSelectedTime(time)}
                              className={`py-3.5 rounded-xl text-sm font-medium transition-all ${
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

                      {/* Location — radio style, grows to fill remaining space */}
                      <div className="glass-card p-7 flex flex-col flex-1">
                        <h4 className="font-display font-semibold text-lg mb-5">{t.booking.location}</h4>
                        <div className="flex flex-col gap-3 flex-1 justify-around">
                          {locations.map((loc) => {
                            const isActive = selectedLocation === loc.key;
                            return (
                              <button
                                key={loc.key}
                                onClick={() => setSelectedLocation(loc.key)}
                                className={`w-full flex items-center gap-4 p-5 rounded-xl text-start transition-all border ${
                                  isActive
                                    ? 'bg-gold/10 border-gold/40'
                                    : 'bg-secondary border-transparent hover:bg-secondary/80'
                                }`}
                              >
                                {/* Radio circle */}
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                                  isActive ? 'border-gold' : 'border-muted-foreground/40'
                                }`}>
                                  {isActive && <div className="w-2.5 h-2.5 rounded-full gold-gradient" />}
                                </div>
                                <span className={`text-base font-medium ${isActive ? 'gold-text' : ''}`}>
                                  {loc.label}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                    </div>
                  </div>
                )}

                {/* ══════════ STEP 4: Payment ══════════ */}
                {step === 4 && (
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
                            value: locale === 'ar'
                              ? (selectedService?.nameAr || selectedService?.name)
                              : selectedService?.name,
                          },
                          {
                            label: locale === 'ar' ? 'المعالج'         : 'Therapist',
                            value: locale === 'ar'
                              ? (selectedTherapist?.nameAr || selectedTherapist?.name)
                              : selectedTherapist?.name,
                          },
                          {
                            label: locale === 'ar' ? 'التاريخ والوقت' : 'Date & Time',
                            value: [formattedDate, selectedTime].filter(Boolean).join(' • ') || '—',
                          },
                          {
                            label: locale === 'ar' ? 'الموقع'          : 'Location',
                            value: locations.find(l => l.key === selectedLocation)?.label ?? '—',
                          },
                        ].map(({ label, value }) => (
                          <div key={label} className="flex justify-between items-start gap-4 text-sm">
                            <span className="text-muted-foreground flex-shrink-0">{label}</span>
                            <span className="text-right font-medium">{value}</span>
                          </div>
                        ))}

                        {/* Total */}
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

                    {/* Payment Method Cards */}
                    <div className="space-y-3">
                      {paymentMethods.map((method) => {
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
                            {/* Icon */}
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                              isActive ? 'gold-gradient' : 'bg-secondary'
                            }`}>
                              <Icon className={`w-5 h-5 ${isActive ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
                            </div>

                            {/* Text */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold font-display">{method.label}</span>
                                <span className="text-xs text-muted-foreground">{method.sub}</span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">{method.desc}</p>
                            </div>

                            {/* Radio */}
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
                <button onClick={() => setStep(step - 1)} className="btn-ghost-gold flex items-center gap-1">
                  <ChevronLeft className="w-4 h-4" />
                  {t.booking.back}
                </button>
              )}
              <div className="flex-1" />
              {step < TOTAL_STEPS ? (
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
    </AuthenticatedLayout>
  );
}