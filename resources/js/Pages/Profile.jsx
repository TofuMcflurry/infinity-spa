import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  CreditCard, MapPin, Plus, Loader2, Bell, Mail, MessageSquare,
  Tag, Smartphone, Pencil, Check, X, User, Home, Briefcase, Building2, Shield, Star
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useForm } from '@inertiajs/react';
import LanguageToggle from '@/Components/Customer/LanguageToggle';

const cardAnim = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
};

function SectionCard({ children, delay = 0, className = '' }) {
  return (
    <motion.div
      {...cardAnim}
      transition={{ duration: 0.4, delay }}
      className={`glass-card p-6 ${className}`}
    >
      {children}
    </motion.div>
  );
}

function SectionHeader({ icon: Icon, title, onEdit, editing, onSave, onCancel }) {
  return (
    <div className="flex items-center justify-between mb-5">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg gold-gradient flex items-center justify-center">
          <Icon className="w-4 h-4 text-primary-foreground" />
        </div>
        <h3 className="font-display text-base font-semibold">{title}</h3>
      </div>
      {editing ? (
        <div className="flex gap-2">
          <button onClick={onCancel} className="p-1.5 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors">
            <X className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          <button onClick={onSave} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary/20 text-xs text-primary font-medium hover:bg-primary/30 transition-colors">
            <Check className="w-3 h-3" />
          </button>
        </div>
      ) : onEdit ? (
        <button onClick={onEdit} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors text-xs text-muted-foreground">
          <Pencil className="w-3 h-3" />
          Edit
        </button>
      ) : null}
    </div>
  );
}

function DefaultBadge() {
  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold gold-gradient text-primary-foreground uppercase tracking-wider">
      Default
    </span>
  );
}

export default function Profile() {
  const { t } = useLanguage();

  const { data, setData, processing, post } = useForm({
    fullName: 'Rashid Al Maktoum',
    email: 'rashid@example.com',
    phone: '+971 50 123 4567',
  });

  const [editingPersonal, setEditingPersonal] = useState(false);
  const [draft, setDraft] = useState({ ...data });

  const [prefs, setPrefs] = useState({
    email: true,
    sms: true,
    push: false,
    promo: true,
  });

  const isValid = data.fullName.trim() !== '' && data.phone.trim() !== '';

  const handleSavePersonal = useCallback(() => {
    if (!isValid) return;
    setData('fullName', draft.fullName);
    setData('email', draft.email);
    setData('phone', draft.phone);
    setEditingPersonal(false);
    post('/profile', { preserveScroll: true });
  }, [isValid, draft, post, setData]);

  const handleCancelPersonal = () => {
    setDraft({ fullName: data.fullName, email: data.email, phone: data.phone });
    setEditingPersonal(false);
  };

  const addresses = [
    { label: 'Home', sub: 'Palm Jumeirah, Dubai', icon: Home, isDefault: true },
    { label: 'Office', sub: 'DIFC, Gate Village', icon: Briefcase, isDefault: false },
    { label: 'Hotel', sub: 'Burj Al Arab', icon: Building2, isDefault: false },
  ];

  const fields = [
    { key: 'fullName', label: t.profile.fullName, type: 'text', icon: User },
    { key: 'email', label: t.profile.email, type: 'email', icon: Mail },
    { key: 'phone', label: t.profile.phone, type: 'tel', icon: Smartphone },
  ];

  const prefItems = [
    { key: 'email', label: t.profile.emailNotifications, icon: Mail },
    { key: 'sms', label: t.profile.smsNotifications, icon: MessageSquare },
    { key: 'push', label: t.profile.pushNotifications, icon: Bell },
    { key: 'promo', label: t.profile.promotionalOffers, icon: Tag },
  ];

  return (
    <AuthenticatedLayout>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="sticky top-0 z-40 glass-card-strong rounded-none border-x-0 border-t-0 px-5 pt-[env(safe-area-inset-top)] pb-4">
          <div className="pt-3 max-w-6xl mx-auto flex items-center justify-between">
            <motion.h1 initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="font-display text-xl font-bold">
              {t.profile.title}
            </motion.h1>
            <LanguageToggle />
          </div>
        </header>

        {/* Profile Banner */}
        <div className="max-w-6xl mx-auto px-4 pt-6">
          <motion.div {...cardAnim} className="glass-card-strong p-6 flex items-center gap-5">
            <div className="w-16 h-16 rounded-full gold-gradient flex items-center justify-center shrink-0">
              <span className="text-2xl font-display font-bold text-primary-foreground">
                {data.fullName.charAt(0)}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-display text-lg font-bold truncate">{data.fullName}</h2>
              <p className="text-sm text-muted-foreground">{data.email}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold gold-gradient text-primary-foreground uppercase tracking-wider flex items-center gap-1">
                  <Star className="w-2.5 h-2.5" /> Platinum VIP
                </span>
                <span className="text-xs text-muted-foreground">• Member since 2023</span>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Two-Column Grid */}
        <main className="max-w-6xl mx-auto px-4 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

            {/* LEFT COLUMN */}
            <div className="lg:col-span-3 space-y-6">

              {/* Personal Information */}
              <SectionCard delay={0.05}>
                <SectionHeader
                  icon={User}
                  title={t.profile.personalInfo}
                  editing={editingPersonal}
                  onEdit={() => { setDraft({ ...data }); setEditingPersonal(true); }}
                  onSave={handleSavePersonal}
                  onCancel={handleCancelPersonal}
                />
                <div className="space-y-4">
                  {fields.map(({ key, label, type, icon: FIcon }) => (
                    <div key={key} className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                        <FIcon className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <label className="text-[11px] text-muted-foreground uppercase tracking-wider block mb-1">{label}</label>
                        {editingPersonal ? (
                          <input
                            type={type}
                            value={draft[key]}
                            onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                            className="w-full bg-secondary/60 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-1 focus:ring-primary/50 transition-colors"
                          />
                        ) : (
                          <p className="text-sm font-medium truncate">{data[key]}</p>
                        )}
                      </div>
                    </div>
                  ))}
                  {editingPersonal && !draft.phone.trim() && (
                    <p className="text-xs text-destructive ml-12">{t.booking.phoneRequired}</p>
                  )}
                </div>
              </SectionCard>

              {/* Payment Methods */}
              <SectionCard delay={0.1}>
                <SectionHeader icon={CreditCard} title={t.profile.paymentMethods} />

                <div className="flex items-center justify-between p-4 bg-secondary/50 border border-white/10 rounded-xl mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-foreground/10 flex items-center justify-center">
                      <Smartphone className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <span className="text-sm font-semibold">{t.profile.applePay}</span>
                      <p className="text-[11px] text-muted-foreground">{t.profile.connected}</p>
                    </div>
                  </div>
                  <DefaultBadge />
                </div>

                <div className="relative overflow-hidden p-4 rounded-xl border border-white/10 bg-gradient-to-br from-secondary to-muted mb-3">
                  <div className="flex items-center justify-between mb-6">
                    <CreditCard className="w-7 h-7 text-primary" />
                    <span className="text-xs font-bold text-muted-foreground tracking-widest">VISA</span>
                  </div>
                  <p className="text-base font-mono tracking-[0.2em] mb-3">•••• •••• •••• 4242</p>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase">Cardholder</p>
                      <p className="text-xs font-medium">{data.fullName}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-muted-foreground uppercase">Expires</p>
                      <p className="text-xs font-medium">12/26</p>
                    </div>
                  </div>
                  <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-primary/5" />
                </div>

                <button className="w-full flex items-center justify-center gap-2 p-3.5 rounded-xl border border-dashed border-white/10 text-sm text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors">
                  <Plus className="w-4 h-4" />
                  {t.profile.addCard}
                </button>
              </SectionCard>
            </div>

            {/* RIGHT COLUMN */}
            <div className="lg:col-span-2 space-y-6">

              {/* Address Book */}
              <SectionCard delay={0.15}>
                <SectionHeader icon={MapPin} title={t.profile.addressBook} />
                <div className="space-y-3">
                  {addresses.map((addr) => (
                    <div key={addr.label} className="flex items-center gap-3 p-3.5 bg-secondary/50 border border-white/10 rounded-xl">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <addr.icon className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold">{addr.label}</p>
                          {addr.isDefault && <DefaultBadge />}
                        </div>
                        <p className="text-xs text-muted-foreground">{addr.sub}</p>
                      </div>
                    </div>
                  ))}
                  <button className="w-full flex items-center justify-center gap-2 p-3.5 rounded-xl border border-dashed border-white/10 text-sm text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors">
                    <Plus className="w-4 h-4" />
                    {t.profile.addAddress}
                  </button>
                </div>
              </SectionCard>

              {/* Communication Preferences */}
              <SectionCard delay={0.2}>
                <SectionHeader icon={Bell} title={t.profile.communicationPrefs} />
                <div className="space-y-4">
                  {prefItems.map(({ key, label, icon: PIcon }) => (
                    <div key={key} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
                          <PIcon className="w-3.5 h-3.5 text-muted-foreground" />
                        </div>
                        <span className="text-sm">{label}</span>
                      </div>
                      <button
                        onClick={() => setPrefs({ ...prefs, [key]: !prefs[key] })}
                        className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
                          prefs[key] ? 'gold-gradient' : 'bg-secondary'
                        }`}
                      >
                        <div className={`absolute top-0.5 w-5 h-5 bg-foreground rounded-full shadow-md transition-transform duration-200 ${
                          prefs[key] ? 'translate-x-[22px]' : 'translate-x-0.5'
                        }`} />
                      </button>
                    </div>
                  ))}
                </div>
              </SectionCard>

              {/* Security */}
              <SectionCard delay={0.25}>
                <SectionHeader icon={Shield} title="Security" />
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3.5 bg-secondary/50 border border-white/10 rounded-xl">
                    <div>
                      <p className="text-sm font-medium">Two-Factor Authentication</p>
                      <p className="text-[11px] text-muted-foreground">Extra layer of security</p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-400">Enabled</span>
                  </div>
                  <div className="flex items-center justify-between p-3.5 bg-secondary/50 border border-white/10 rounded-xl">
                    <div>
                      <p className="text-sm font-medium">Last Login</p>
                      <p className="text-[11px] text-muted-foreground">Dubai, UAE</p>
                    </div>
                    <span className="text-xs text-muted-foreground">2 hours ago</span>
                  </div>
                </div>
              </SectionCard>
            </div>
          </div>

          {/* Save Button */}
          <div className="mt-6 pb-8">
            <button
              onClick={handleSavePersonal}
              disabled={!isValid || processing}
              className="btn-gold w-full flex items-center justify-center gap-2 py-4 text-base disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {processing && <Loader2 className="w-5 h-5 animate-spin" />}
              {processing ? t.profile.saving : t.profile.saveChanges}
            </button>
          </div>
        </main>
      </div>
    </AuthenticatedLayout>
  );
}