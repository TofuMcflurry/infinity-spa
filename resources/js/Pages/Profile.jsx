import AuthenticatedLayout from '@/Layouts/CustomerLayout';
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    User, Mail, Smartphone, MapPin, Bell, Shield,
    Camera, Check, X, Loader2, Plus, Trash2,
    Home, Building2, Hotel, ChevronRight, ChevronLeft,
    Tag, MessageSquare, AlertCircle
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import LanguageToggle from '@/Components/Customer/LanguageToggle';

// ── Zone config ───────────────────────────────────────────────────────────────
const ZONE_OPTIONS = [
    { zone: 'JAFZA',                  label: 'JAFZA',         address: 'Jebel Ali Free Zone, Block 14, Dubai',              icon: Building2 },
    { zone: 'DAFZ',                   label: 'DAFZ',          address: 'Dubai Airport Freezone, Dubai',                     icon: Building2 },
    { zone: 'DMCC / JLT',             label: 'DMCC / JLT',    address: 'Jumeirah Lakes Towers, Dubai',                      icon: Building2 },
    { zone: 'Dubai South',            label: 'Dubai South',   address: 'Near Al Maktoum International Airport, Dubai',      icon: Building2 },
    { zone: 'Dubai Silicon Oasis',    label: 'DSO',           address: 'Academic City Road, Dubai Silicon Oasis, Dubai',    icon: Building2 },
    { zone: 'Dubai Internet City',    label: 'DIC / DMC',     address: 'Near Sheikh Zayed Road, Dubai Internet City, Dubai',icon: Building2 },
    { zone: 'Dubai Design District',  label: 'D3',            address: 'Near Business Bay, Dubai Design District, Dubai',   icon: Building2 },
    { zone: 'DIFC',                   label: 'DIFC',          address: 'Dubai International Financial Centre, Dubai',       icon: Building2 },
];

const LOCATION_ICONS = { Home, Office: Building2, Hotel };

// ── API helpers ───────────────────────────────────────────────────────────────
function getCsrf() {
    const cookie = document.cookie.split('; ').find(r => r.startsWith('XSRF-TOKEN='));
    return cookie ? decodeURIComponent(cookie.split('=')[1]) : '';
}

async function apiFetch(url, options = {}) {
    const res = await fetch(url, {
        ...options,
        credentials: 'same-origin',
        headers: {
            'Accept':           'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-XSRF-TOKEN':     getCsrf(),
            ...(options.headers ?? {}),
        },
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? `HTTP ${res.status}`);
    }
    return res.json();
}

// ── Nav sections ──────────────────────────────────────────────────────────────
const SECTIONS = [
    { id: 'personal',      labelKey: 'personalInfo',  icon: User    },
    { id: 'addresses',     labelKey: 'addressBook',   icon: MapPin  },
    { id: 'notifications', labelKey: 'communicationPrefs', icon: Bell    },
    { id: 'security',      labelKey: 'security',      icon: Shield  },
];

export default function Profile() {
    const { t, locale } = useLanguage();

    // ── Profile data ──────────────────────────────────────────────────────────
    const [profile,      setProfile]      = useState(null);
    const [addresses,    setAddresses]    = useState([]);
    const [loading,      setLoading]      = useState(true);
    const [error,        setError]        = useState(null);
    const [successMsg,   setSuccessMsg]   = useState(null);

    // ── Personal info edit ────────────────────────────────────────────────────
    const [editing,      setEditing]      = useState(false);
    const [draft,        setDraft]        = useState({ name: '', phone: '' });
    const [savingInfo,   setSavingInfo]   = useState(false);

    // ── Avatar ────────────────────────────────────────────────────────────────
    const [avatarUrl,    setAvatarUrl]    = useState(null);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const avatarInputRef = useRef(null);

    // ── Address modal ─────────────────────────────────────────────────────────
    const [showAddModal,   setShowAddModal]   = useState(false);
    const [modalStep,      setModalStep]      = useState(1);
    const [selectedZone,   setSelectedZone]   = useState(null);
    const [addrLabel,      setAddrLabel]      = useState('');
    const [addrText,       setAddrText]       = useState('');
    const [savingAddress,  setSavingAddress]  = useState(false);
    const [deletingId,     setDeletingId]     = useState(null);
    const [settingDefault, setSettingDefault] = useState(null);

    // ── Notifications (local state for now) ───────────────────────────────────
    const [prefs, setPrefs] = useState({
        email: true, sms: true, push: false, promo: true,
    });

    // ── Scroll spy ────────────────────────────────────────────────────────────
    const [activeSection, setActiveSection] = useState('personal');
    const sectionRefs = useRef({});

    // ── Fetch profile ─────────────────────────────────────────────────────────
    useEffect(() => {
        apiFetch('/api/profile-data')
            .then(data => {
                setProfile(data);
                setAvatarUrl(data.avatar);
                setDraft({ name: data.name, phone: data.phone ?? '' });
                setAddresses(data.addresses ?? []);
            })
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }, []);

    // ── Scroll spy logic ──────────────────────────────────────────────────────
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        setActiveSection(entry.target.id);
                    }
                });
            },
            { rootMargin: '-30% 0px -60% 0px', threshold: 0 }
        );
        SECTIONS.forEach(s => {
            const el = document.getElementById(s.id);
            if (el) { sectionRefs.current[s.id] = el; observer.observe(el); }
        });
        return () => observer.disconnect();
    }, [loading]);

    const scrollTo = (id) => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    // ── Avatar upload ─────────────────────────────────────────────────────────
    const handleAvatarChange = useCallback(async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadingAvatar(true);
        const form = new FormData();
        form.append('avatar', file);
        try {
            const data = await apiFetch('/api/profile-avatar', { method: 'POST', body: form });
            setAvatarUrl(data.avatar);
            showSuccess('Profile photo updated!');
        } catch (err) {
            setError(err.message);
        } finally {
            setUploadingAvatar(false);
        }
    }, []);

    // ── Save personal info ────────────────────────────────────────────────────
    const handleSaveInfo = useCallback(async () => {
        if (!draft.name.trim()) return;
        setSavingInfo(true);
        try {
            await apiFetch('/api/profile-update', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ name: draft.name, phone: draft.phone }),
            });
            setProfile(p => ({ ...p, name: draft.name, phone: draft.phone }));
            setEditing(false);
            showSuccess(t.profile.profileUpdated || 'Profile updated!');
        } catch (err) {
            setError(err.message);
        } finally {
            setSavingInfo(false);
        }
    }, [draft, t]);

    // ── Address modal helpers ─────────────────────────────────────────────────
    const openModal = () => {
        setModalStep(1);
        setSelectedZone(null);
        setAddrLabel('');
        setAddrText('');
        setShowAddModal(true);
    };

    const closeModal = () => {
        setShowAddModal(false);
    };

    // ── Add address ───────────────────────────────────────────────────────────
    const handleAddAddress = useCallback(async () => {
        if (!selectedZone || !addrLabel.trim() || !addrText.trim()) return;
        setSavingAddress(true);
        try {
            const data = await apiFetch('/api/addresses', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({
                    label:      addrLabel.trim(),
                    address:    addrText.trim(),
                    zone_name:  selectedZone,
                    is_default: addresses.length === 0,
                }),
            });
            setAddresses(prev => [...prev, data.address]);
            closeModal();
            showSuccess(t.profile.addressAdded || 'Address added!');
        } catch (err) {
            setError(err.message);
        } finally {
            setSavingAddress(false);
        }
    }, [selectedZone, addrLabel, addrText, addresses.length, t]);

    // ── Delete address ────────────────────────────────────────────────────────
    const handleDeleteAddress = useCallback(async (id) => {
        setDeletingId(id);
        try {
            await apiFetch(`/api/addresses/${id}`, { method: 'DELETE' });
            setAddresses(prev => prev.filter(a => a.id !== id));
            showSuccess(t.profile.addressRemoved || 'Address removed!');
        } catch (err) {
            setError(err.message);
        } finally {
            setDeletingId(null);
        }
    }, [t]);

    // ── Set default address ───────────────────────────────────────────────────
    const handleSetDefault = useCallback(async (id) => {
        setSettingDefault(id);
        try {
            await apiFetch(`/api/addresses/${id}/default`, { method: 'POST' });
            setAddresses(prev => prev.map(a => ({ ...a, is_default: a.id === id })));
            showSuccess(t.profile.defaultUpdated || 'Default address updated!');
        } catch (err) {
            setError(err.message);
        } finally {
            setSettingDefault(null);
        }
    }, [t]);

    // ── Success flash ─────────────────────────────────────────────────────────
    const showSuccess = (msg) => {
        setSuccessMsg(msg);
        setTimeout(() => setSuccessMsg(null), 3000);
    };

    // ── Loading skeleton ──────────────────────────────────────────────────────
    if (loading) return (
        <AuthenticatedLayout>
            <div className="min-h-screen bg-background flex items-center justify-center">
                <Loader2 className="w-7 h-7 animate-spin text-gold" />
            </div>
        </AuthenticatedLayout>
    );

    const initials = profile?.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? 'U';

    return (
        <AuthenticatedLayout>
            <div className="min-h-screen bg-background">

                {/* ── Header ── */}
                <header className="sticky top-0 z-40 glass-card-strong rounded-none border-x-0 border-t-0 px-5 pt-[env(safe-area-inset-top)] pb-4">
                    <div className="pt-3 max-w-6xl mx-auto flex items-center justify-between">
                        <motion.h1
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="font-display text-xl font-bold"
                        >
                            {t.profile.title}
                        </motion.h1>
                        <LanguageToggle />
                    </div>
                </header>

                {/* ── Toast notifications ── */}
                <AnimatePresence>
                    {successMsg && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="fixed top-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-5 py-3 bg-emerald-500/20 border border-emerald-500/40 rounded-2xl text-sm text-emerald-400 backdrop-blur-xl shadow-xl"
                        >
                            <Check className="w-4 h-4" /> {successMsg}
                        </motion.div>
                    )}
                    {error && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="fixed top-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-5 py-3 bg-destructive/20 border border-destructive/40 rounded-2xl text-sm text-destructive backdrop-blur-xl shadow-xl"
                        >
                            <AlertCircle className="w-4 h-4" />
                            {error}
                            <button onClick={() => setError(null)} className="ml-2">
                                <X className="w-3 h-3" />
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ── Main Layout ── */}
                <div className="max-w-6xl mx-auto px-4 py-6 flex gap-6">

                    {/* ════════ LEFT SIDEBAR (sticky) ════════ */}
                    <aside className="hidden lg:flex flex-col w-64 flex-shrink-0">
                        <div className="sticky top-24 space-y-2">

                            {/* Avatar + Info Card */}
                            <div className="glass-card p-5 flex flex-col items-center text-center mb-4">
                                {/* Avatar */}
                                <div className="relative mb-3 group">
                                    <div className="w-20 h-20 rounded-full overflow-hidden ring-2 ring-gold/40 ring-offset-2 ring-offset-background">
                                        {avatarUrl ? (
                                            <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full gold-gradient flex items-center justify-center">
                                                <span className="text-xl font-display font-bold text-primary-foreground">
                                                    {initials}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                    {/* Upload overlay */}
                                    <button
                                        onClick={() => avatarInputRef.current?.click()}
                                        disabled={uploadingAvatar}
                                        className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1"
                                    >
                                        {uploadingAvatar ? (
                                            <Loader2 className="w-5 h-5 text-white animate-spin" />
                                        ) : (
                                            <>
                                                <Camera className="w-5 h-5 text-white" />
                                                <span className="text-[10px] text-white font-medium">{t.profile.changeAvatar || 'Change'}</span>
                                            </>
                                        )}
                                    </button>
                                    <input
                                        ref={avatarInputRef}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={handleAvatarChange}
                                    />
                                </div>

                                <h2 className="font-display font-bold text-sm truncate w-full">{profile?.name}</h2>
                                <p className="text-xs text-muted-foreground truncate w-full">{profile?.email}</p>
                                <p className="text-[10px] text-muted-foreground mt-1.5">
                                    {t.header.memberSince} {profile?.member_since}
                                </p>
                            </div>

                            {/* Nav Links */}
                            {SECTIONS.map(section => {
                                const Icon = section.icon;
                                const isActive = activeSection === section.id;
                                const label = t.profile[section.labelKey] || section.labelKey;
                                return (
                                    <button
                                        key={section.id}
                                        onClick={() => scrollTo(section.id)}
                                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                                            isActive
                                                ? 'gold-gradient text-primary-foreground shadow-lg shadow-gold/20'
                                                : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
                                        }`}
                                    >
                                        <Icon className="w-4 h-4 flex-shrink-0" />
                                        <span className="flex-1 text-left">{label}</span>
                                        {isActive && <ChevronRight className="w-3.5 h-3.5" />}
                                    </button>
                                );
                            })}
                        </div>
                    </aside>

                    {/* ════════ RIGHT CONTENT (scrollable) ════════ */}
                    <main className="flex-1 min-w-0 space-y-6">

                        {/* ── SECTION 1: Personal Information ── */}
                        <section id="personal" className="scroll-mt-24">
                            <div className="glass-card p-6">
                                {/* Section header */}
                                <div className="flex items-center justify-between mb-6">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 rounded-lg gold-gradient flex items-center justify-center">
                                            <User className="w-4 h-4 text-primary-foreground" />
                                        </div>
                                        <h3 className="font-display text-base font-semibold">{t.profile.personalInfo}</h3>
                                    </div>
                                    {!editing ? (
                                        <button
                                            onClick={() => setEditing(true)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-xs text-muted-foreground transition-colors"
                                        >
                                            {t.profile.edit || 'Edit'}
                                        </button>
                                    ) : (
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => { setEditing(false); setDraft({ name: profile.name, phone: profile.phone ?? '' }); }}
                                                className="p-1.5 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors"
                                            >
                                                <X className="w-3.5 h-3.5 text-muted-foreground" />
                                            </button>
                                            <button
                                                onClick={handleSaveInfo}
                                                disabled={savingInfo || !draft.name.trim()}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gold/20 text-xs text-gold font-medium hover:bg-gold/30 transition-colors disabled:opacity-40"
                                            >
                                                {savingInfo
                                                    ? <Loader2 className="w-3 h-3 animate-spin" />
                                                    : <Check className="w-3 h-3" />
                                                }
                                                {t.profile.saveChanges}
                                            </button>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-4">
                                    {/* Name */}
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                                            <User className="w-4 h-4 text-muted-foreground" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <label className="text-[11px] text-muted-foreground uppercase tracking-wider block mb-1">{t.profile.fullName}</label>
                                            {editing ? (
                                                <input
                                                    type="text"
                                                    value={draft.name}
                                                    onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                                                    className="w-full bg-secondary/60 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-1 focus:ring-gold/50 transition-colors"
                                                />
                                            ) : (
                                                <p className="text-sm font-medium">{profile?.name}</p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Email (read-only) */}
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                                            <Mail className="w-4 h-4 text-muted-foreground" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <label className="text-[11px] text-muted-foreground uppercase tracking-wider block mb-1">{t.profile.email}</label>
                                            <p className="text-sm font-medium text-muted-foreground">{profile?.email}</p>
                                        </div>
                                    </div>

                                    {/* Phone */}
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                                            <Smartphone className="w-4 h-4 text-muted-foreground" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <label className="text-[11px] text-muted-foreground uppercase tracking-wider block mb-1">{t.profile.phone}</label>
                                            {editing ? (
                                                <input
                                                    type="tel"
                                                    value={draft.phone}
                                                    onChange={e => setDraft(d => ({ ...d, phone: e.target.value }))}
                                                    placeholder="+971 50 000 0000"
                                                    className="w-full bg-secondary/60 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-1 focus:ring-gold/50 transition-colors"
                                                />
                                            ) : (
                                                <p className="text-sm font-medium">{profile?.phone || '—'}</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* ── SECTION 2: Address Book ── */}
                        <section id="addresses" className="scroll-mt-24">
                            <div className="glass-card p-6">
                                <div className="flex items-center justify-between mb-6">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 rounded-lg gold-gradient flex items-center justify-center">
                                            <MapPin className="w-4 h-4 text-primary-foreground" />
                                        </div>
                                        <h3 className="font-display text-base font-semibold">{t.profile.addressBook}</h3>
                                    </div>
                                    {addresses.length < 3 && (
                                        <button
                                            onClick={openModal}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-xs text-muted-foreground transition-colors"
                                        >
                                            <Plus className="w-3.5 h-3.5" />
                                            {t.profile.addAddress}
                                        </button>
                                    )}
                                </div>

                                <div className="space-y-3">
                                    {addresses.map(addr => {
                                        const Icon = LOCATION_ICONS[addr.label] ?? MapPin;
                                        return (
                                            <motion.div
                                                key={addr.id}
                                                layout
                                                initial={{ opacity: 0, y: 8 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, x: -20 }}
                                                className="flex items-center gap-3 p-4 bg-secondary/50 border border-white/8 rounded-xl group hover:border-white/15 transition-all"
                                            >
                                                <div className="w-9 h-9 rounded-lg bg-gold/10 flex items-center justify-center flex-shrink-0">
                                                    <Icon className="w-4 h-4 text-gold" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <p className="text-sm font-semibold">{addr.label}</p>
                                                        {addr.is_default && (
                                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold gold-gradient text-primary-foreground uppercase tracking-wider">
                                                                {t.profile.default}
                                                            </span>
                                                        )}
                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gold/20 text-gold">
                                                            {addr.zone_name}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground mt-1">{addr.address}</p>
                                                </div>

                                                {/* Actions — visible on hover */}
                                                <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    {!addr.is_default && (
                                                        <button
                                                            onClick={() => handleSetDefault(addr.id)}
                                                            disabled={settingDefault === addr.id}
                                                            className="px-2.5 py-1.5 rounded-lg bg-gold/10 hover:bg-gold/20 text-[10px] text-gold font-medium transition-colors"
                                                        >
                                                            {settingDefault === addr.id
                                                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                                                : t.profile.setDefault || 'Set Default'
                                                            }
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => handleDeleteAddress(addr.id)}
                                                        disabled={deletingId === addr.id}
                                                        className="p-1.5 rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive transition-colors"
                                                    >
                                                        {deletingId === addr.id
                                                            ? <Loader2 className="w-3 h-3 animate-spin" />
                                                            : <Trash2 className="w-3 h-3" />
                                                        }
                                                    </button>
                                                </div>
                                            </motion.div>
                                        );
                                    })}

                                    {addresses.length === 0 && (
                                        <div className="flex flex-col items-center justify-center py-10 gap-3">
                                            <MapPin className="w-8 h-8 text-muted-foreground" />
                                            <p className="text-sm text-muted-foreground text-center">
                                                {t.profile.noAddresses || 'No addresses yet.'}<br />
                                                {t.profile.addFirstLocation || 'Add your first location.'}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </section>

                        {/* ── SECTION 3: Notifications ── */}
                        <section id="notifications" className="scroll-mt-24">
                            <div className="glass-card p-6">
                                <div className="flex items-center gap-2.5 mb-6">
                                    <div className="w-8 h-8 rounded-lg gold-gradient flex items-center justify-center">
                                        <Bell className="w-4 h-4 text-primary-foreground" />
                                    </div>
                                    <h3 className="font-display text-base font-semibold">{t.profile.communicationPrefs}</h3>
                                </div>

                                <div className="space-y-4">
                                    {[
                                        { key: 'email', label: t.profile.emailNotifications,  icon: Mail           },
                                        { key: 'sms',   label: t.profile.smsNotifications,    icon: MessageSquare  },
                                        { key: 'push',  label: t.profile.pushNotifications,   icon: Bell           },
                                        { key: 'promo', label: t.profile.promotionalOffers,   icon: Tag            },
                                    ].map(({ key, label, icon: PIcon }) => (
                                        <div key={key} className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
                                                    <PIcon className="w-3.5 h-3.5 text-muted-foreground" />
                                                </div>
                                                <span className="text-sm">{label}</span>
                                            </div>
                                            <button
                                                onClick={() => setPrefs(p => ({ ...p, [key]: !p[key] }))}
                                                className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
                                                    prefs[key] ? 'gold-gradient' : 'bg-secondary'
                                                }`}
                                            >
                                                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-200 ${
                                                    prefs[key] ? 'translate-x-[22px]' : 'translate-x-0.5'
                                                }`} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </section>

                        {/* ── SECTION 4: Security ── */}
                        <section id="security" className="scroll-mt-24 pb-10">
                            <div className="glass-card p-6">
                                <div className="flex items-center gap-2.5 mb-6">
                                    <div className="w-8 h-8 rounded-lg gold-gradient flex items-center justify-center">
                                        <Shield className="w-4 h-4 text-primary-foreground" />
                                    </div>
                                    <h3 className="font-display text-base font-semibold">{t.profile.security}</h3>
                                </div>

                                <div className="space-y-3">
                                    <div className="flex items-center justify-between p-4 bg-secondary/50 border border-white/8 rounded-xl">
                                        <div>
                                            <p className="text-sm font-medium">{t.profile.twoFactorAuth}</p>
                                            <p className="text-xs text-muted-foreground">{t.profile.twoFactorDesc}</p>
                                        </div>
                                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold ${
                                            profile?.is_otp_enabled
                                                ? 'bg-emerald-500/20 text-emerald-400'
                                                : 'bg-secondary text-muted-foreground'
                                        }`}>
                                            {profile?.is_otp_enabled ? t.profile.enabled : t.profile.disabled}
                                        </span>
                                    </div>

                                    <div className="flex items-center justify-between p-4 bg-secondary/50 border border-white/8 rounded-xl">
                                        <div>
                                            <p className="text-sm font-medium">{t.profile.accountType}</p>
                                            <p className="text-xs text-muted-foreground capitalize">
                                                {profile?.role ?? 'customer'} {t.profile.accountTypeDesc}
                                            </p>
                                        </div>
                                        <span className="text-xs text-muted-foreground capitalize">{profile?.role ?? 'customer'}</span>
                                    </div>
                                </div>
                            </div>
                        </section>

                    </main>
                </div>

                {/* ── ADD ADDRESS MODAL (2-STEP REDESIGN) ── */}
                <AnimatePresence>
                    {showAddModal && (
                        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                                onClick={closeModal}
                            />
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                                className="relative w-full max-w-md bg-card border border-white/10 rounded-2xl shadow-2xl z-10 overflow-hidden"
                            >
                                {/* Modal Header */}
                                <div className="flex items-center justify-between p-5 border-b border-white/8">
                                    <div className="flex items-center gap-3">
                                        {modalStep === 2 && (
                                            <button
                                                onClick={() => { setModalStep(1); setSelectedZone(null); }}
                                                className="p-1 rounded-lg hover:bg-secondary transition-colors"
                                            >
                                                <ChevronLeft className="w-4 h-4 text-muted-foreground" />
                                            </button>
                                        )}
                                        <h4 className="font-display font-semibold text-base">
                                            {modalStep === 1 ? (t.profile.selectZone || 'Select your zone') : (t.profile.enterAddress || 'Enter your address')}
                                        </h4>
                                    </div>
                                    <button onClick={closeModal}>
                                        <X className="w-4 h-4 text-muted-foreground hover:text-white transition-colors" />
                                    </button>
                                </div>

                                {/* Step 1 — Zone Selection */}
                                {modalStep === 1 && (
                                    <div className="p-5 space-y-3">
                                        <p className="text-xs text-muted-foreground mb-4">
                                            {t.profile.selectZoneDesc || 'We currently serve these areas in Dubai. Select where you\'d like to receive services.'}
                                        </p>

                                        <div className="grid grid-cols-2 gap-2.5">
                                            {ZONE_OPTIONS.map(zone => (
                                                <button
                                                    key={zone.zone}
                                                    onClick={() => {
                                                        setSelectedZone(zone.zone);
                                                        setModalStep(2);
                                                    }}
                                                    className="flex flex-col items-start p-3.5 rounded-xl border transition-all text-start"
                                                    style={{ borderColor: '#1e2740', background: '#0f1629' }}
                                                    onMouseEnter={e => {
                                                        e.currentTarget.style.borderColor = '#e2b764';
                                                        e.currentTarget.style.background = 'rgba(226,183,100,0.05)';
                                                    }}
                                                    onMouseLeave={e => {
                                                        e.currentTarget.style.borderColor = '#1e2740';
                                                        e.currentTarget.style.background = '#0f1629';
                                                    }}
                                                >
                                                    <div className="w-7 h-7 rounded-lg bg-gold/10 flex items-center justify-center mb-2">
                                                        <MapPin className="w-3.5 h-3.5 text-gold" />
                                                    </div>
                                                    <p className="text-sm font-semibold text-white">{zone.label}</p>
                                                    <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">Dubai, UAE</p>
                                                </button>
                                            ))}
                                        </div>

                                        {/* Not in list */}
                                        <div className="mt-4 p-4 rounded-xl border border-dashed border-white/10 text-center">
                                            <p className="text-xs text-muted-foreground">
                                                {t.profile.notInArea || 'Not in any of these areas?'}
                                            </p>
                                            <p className="text-xs font-medium text-destructive mt-1">
                                                {t.profile.areaNotCovered || 'Sorry, we do not cover this area yet.'}
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* Step 2 — Address Details */}
                                {modalStep === 2 && (
                                    <div className="p-5 space-y-4">
                                        {/* Selected zone badge */}
                                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gold/10 border border-gold/20 w-fit">
                                            <MapPin className="w-3.5 h-3.5 text-gold" />
                                            <span className="text-sm font-semibold text-gold">{selectedZone}</span>
                                        </div>

                                        {/* Label input */}
                                        <div>
                                            <label className="text-[11px] text-muted-foreground uppercase tracking-wider block mb-1.5">
                                                {t.profile.locationLabel || 'Location Label'}
                                            </label>
                                            <input
                                                type="text"
                                                value={addrLabel}
                                                onChange={e => setAddrLabel(e.target.value)}
                                                placeholder={t.profile.labelPlaceholder || 'e.g. Home, Studio, Office...'}
                                                className="w-full bg-secondary/60 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-1 focus:ring-gold/50 transition-colors"
                                                autoFocus
                                            />
                                        </div>

                                        {/* Exact address input */}
                                        <div>
                                            <label className="text-[11px] text-muted-foreground uppercase tracking-wider block mb-1.5">
                                                {t.profile.exactAddress || 'Exact Address'}
                                            </label>
                                            <textarea
                                                value={addrText}
                                                onChange={e => setAddrText(e.target.value)}
                                                placeholder={t.profile.addressPlaceholder || 'e.g. Villa 23, Street 5B, Gate Village, DIFC'}
                                                rows={3}
                                                className="w-full bg-secondary/60 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-1 focus:ring-gold/50 transition-colors resize-none"
                                            />
                                        </div>

                                        {/* Submit button */}
                                        <button
                                            onClick={handleAddAddress}
                                            disabled={!addrLabel.trim() || !addrText.trim() || savingAddress}
                                            className="w-full py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                            style={{ background: '#e2b764', color: '#0b1120' }}
                                        >
                                            {savingAddress
                                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                                : <Check className="w-4 h-4" />
                                            }
                                            {savingAddress ? (t.profile.saving || 'Saving...') : (t.profile.addAddress || 'Add Address')}
                                        </button>
                                    </div>
                                )}
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

            </div>
        </AuthenticatedLayout>
    );
}