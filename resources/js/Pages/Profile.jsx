import AuthenticatedLayout from '@/Layouts/CustomerLayout';
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    User, Mail, Smartphone, MapPin, Bell, Shield,
    Camera, Check, X, Loader2, Plus, Trash2,
    Home, Building2, Hotel, ChevronRight, ChevronLeft,
    Tag, MessageSquare, AlertCircle, Pencil, Lock
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import LanguageToggle from '@/Components/Customer/LanguageToggle';
import MobileMenuSheet from '@/Components/Customer/MobileMenuSheet';
import MobileMenuTrigger from '@/Components/Customer/MobileMenuTrigger';
import ConfirmDialog from '@/Components/Customer/ConfirmDialog';

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
// `labelKey` drives the full section-card title (desktop sidebar + both card
// headers); `chipLabel` is the short word used only by the mobile sticky-chip
// row (prototype: "Personal · Addresses · Notifications · Security" — the
// full `t.profile.communicationPrefs` phrase is too long for a compact pill).
const SECTIONS = [
    { id: 'personal',      labelKey: 'personalInfo',  icon: User,   chipLabel: 'Personal' },
    { id: 'addresses',     labelKey: 'addressBook',   icon: MapPin, chipLabel: 'Addresses' },
    { id: 'notifications', labelKey: 'communicationPrefs', icon: Bell, chipLabel: 'Notifications' },
    { id: 'security',      labelKey: 'security',      icon: Shield, chipLabel: 'Security' },
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
    const [menuOpen,     setMenuOpen]     = useState(false);

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
    const [confirmDeleteId, setConfirmDeleteId] = useState(null); // id pending delete confirmation

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
    // Mobile and desktop render two parallel section trees (prototype's avatar
    // card + stacked cards below `lg`, the existing sidebar layout at `lg`+),
    // so each section needs a breakpoint-specific DOM id to stay unique — this
    // tracks which tree is actually visible right now, reactively, so a live
    // resize across the `lg` breakpoint (1024px) doesn't leave the observer
    // watching a tree that just became `display:none`.
    const [isDesktopViewport, setIsDesktopViewport] = useState(
        () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
    );

    useEffect(() => {
        const mql = window.matchMedia('(min-width: 1024px)');
        const handleChange = (e) => setIsDesktopViewport(e.matches);
        mql.addEventListener('change', handleChange);
        return () => mql.removeEventListener('change', handleChange);
    }, []);

    useEffect(() => {
        const suffix = isDesktopViewport ? 'desktop' : 'mobile';
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        setActiveSection(entry.target.id.replace(`-${suffix}`, ''));
                    }
                });
            },
            { rootMargin: '-30% 0px -60% 0px', threshold: 0 }
        );
        SECTIONS.forEach(s => {
            const el = document.getElementById(`${s.id}-${suffix}`);
            if (el) { sectionRefs.current[s.id] = el; observer.observe(el); }
        });
        return () => observer.disconnect();
    }, [loading, isDesktopViewport]);

    const scrollTo = (id) => {
        const suffix = isDesktopViewport ? 'desktop' : 'mobile';
        document.getElementById(`${id}-${suffix}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    // Returns true/false so callers can tell success from failure synchronously
    // off the resolved value — deliberately not via the `error` state, which is
    // async/batched and not safe to inspect right after this await resolves.
    const handleDeleteAddress = useCallback(async (id) => {
        setDeletingId(id);
        try {
            await apiFetch(`/api/addresses/${id}`, { method: 'DELETE' });
            setAddresses(prev => prev.filter(a => a.id !== id));
            showSuccess(t.profile.addressRemoved || 'Address removed!');
            return true;
        } catch (err) {
            setError(err.message);
            return false;
        } finally {
            setDeletingId(null);
        }
    }, [t]);

    // Trash buttons only ever open the confirmation dialog (see confirmDeleteId);
    // this is the dialog's sole "Delete Address" action — it calls the existing
    // handleDeleteAddress unchanged and only dismisses the dialog on a true
    // (successful) result, leaving it open on failure so the user can retry
    // without re-opening it — same precedent as handleAddAddress's closeModal().
    const confirmAndDeleteAddress = useCallback(async () => {
        if (!confirmDeleteId) return;
        const succeeded = await handleDeleteAddress(confirmDeleteId);
        if (succeeded) {
            setConfirmDeleteId(null);
        }
    }, [confirmDeleteId, handleDeleteAddress]);

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
            <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--theme-bg)' }}>
                <Loader2 className="w-7 h-7 animate-spin text-gold" />
            </div>
        </AuthenticatedLayout>
    );

    const initials = profile?.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? 'U';

    return (
        <AuthenticatedLayout>
            <div className="min-h-screen" style={{ background: 'var(--theme-bg)' }}>

                {/* ── Header ── */}
                <header className="sticky top-0 z-40 glass-card-strong rounded-none border-x-0 border-t-0 px-5 pt-[env(safe-area-inset-top)] pb-4">
                    <div className="pt-3 max-w-6xl mx-auto flex items-end justify-between gap-4">
                        <div className="min-w-0">
                            <motion.h1
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="font-display text-xl font-bold"
                            >
                                {t.profile.title}
                            </motion.h1>
                            {/* Mobile-only subtitle, matching the title/subtitle
                                pattern already shipped on Services/Therapists/
                                Wishlist (prototype: "My Profile" / "Account,
                                addresses and preferences"). Desktop is unchanged
                                — it never had a subtitle here. */}
                            <p className="text-xs mt-0.5 lg:hidden truncate" style={{ color: 'var(--theme-text-muted)' }}>
                                Account, addresses and preferences
                            </p>
                        </div>
                        {/* Language moves into MobileMenuSheet below md — desktop
                            keeps it exactly as before. */}
                        <div className="hidden md:block flex-shrink-0">
                            <LanguageToggle />
                        </div>
                        <MobileMenuTrigger onClick={() => setMenuOpen(true)} />
                    </div>

                    {/* Mobile sticky section-jump chips (prototype: "sticky
                        section chips ... jump to each section, scroll-spy
                        stays"). Reuses the same SECTIONS/activeSection/scrollTo
                        used by the desktop sidebar nav below — no separate
                        nav logic. */}
                    <div className="w-full min-w-0 flex gap-2 overflow-x-auto pt-3 -mb-1 lg:hidden max-w-6xl mx-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                        {SECTIONS.map(section => {
                            const isActive = activeSection === section.id;
                            return (
                                <button
                                    key={section.id}
                                    onClick={() => scrollTo(section.id)}
                                    className="flex-none h-[38px] px-3.5 rounded-full text-[13px] font-semibold border whitespace-nowrap transition-all"
                                    style={{
                                        borderColor: isActive ? '#e2b764' : 'var(--theme-border)',
                                        background:  isActive ? 'rgba(226,183,100,0.12)' : 'var(--theme-card)',
                                        color:       isActive ? 'var(--theme-link)' : 'var(--theme-text-2)',
                                    }}
                                >
                                    {section.chipLabel}
                                </button>
                            );
                        })}
                    </div>
                </header>

                <MobileMenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} avatarUrl={avatarUrl} />

                <ConfirmDialog
                    open={!!confirmDeleteId}
                    title="Delete this address?"
                    message="Are you sure you want to delete this saved address? This action cannot be undone."
                    confirmLabel="Delete Address"
                    cancelLabel="Cancel"
                    confirmLoading={deletingId !== null && deletingId === confirmDeleteId}
                    onConfirm={confirmAndDeleteAddress}
                    onCancel={() => setConfirmDeleteId(null)}
                />

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

                {/* ── Mobile/tablet page body (prototype) ──────────────────────
                    Replaces the desktop sidebar with an avatar card + sticky
                    section chips (above, in the header). Same profile/address/
                    prefs state and handlers as the desktop tree below — no
                    duplicated data fetching or business logic, just a different
                    arrangement of the same data for narrower screens. ── */}
                <div className="lg:hidden max-w-6xl mx-auto px-4 pt-6 pb-24 flex flex-col gap-4">

                    {/* Avatar card */}
                    <div className="rounded-[20px] border p-5 flex items-center gap-4"
                        style={{ borderColor: 'rgba(226,183,100,0.3)', background: 'linear-gradient(160deg, var(--theme-card-hover), var(--theme-card) 70%)' }}>
                        <div className="relative flex-none">
                            <div className="w-[72px] h-[72px] rounded-full overflow-hidden"
                                style={{ boxShadow: '0 0 0 3px var(--theme-bg), 0 0 0 5px rgba(226,183,100,0.35)' }}>
                                {avatarUrl ? (
                                    <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full gold-gradient flex items-center justify-center">
                                        <span className="font-display font-bold text-2xl text-primary-foreground">{initials}</span>
                                    </div>
                                )}
                            </div>
                            <button
                                onClick={() => avatarInputRef.current?.click()}
                                disabled={uploadingAvatar}
                                aria-label={t.profile.changeAvatar || 'Change photo'}
                                className="absolute -right-1.5 -bottom-1.5 w-9 h-9 rounded-full border-2 flex items-center justify-center"
                                style={{ borderColor: 'var(--theme-card)', background: '#1f1c17' }}
                            >
                                {uploadingAvatar ? (
                                    <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#faf7f1' }} />
                                ) : (
                                    <Camera className="w-4 h-4" style={{ color: '#faf7f1' }} />
                                )}
                            </button>
                        </div>
                        <div className="min-w-0 flex-1">
                            <h2 className="font-display font-bold text-xl leading-tight truncate" style={{ color: 'var(--theme-text-head)' }}>
                                {profile?.name}
                            </h2>
                            <p className="text-[13px] truncate" style={{ color: 'var(--theme-text-2)' }}>{profile?.email}</p>
                            <p className="text-xs mt-1" style={{ color: 'var(--theme-text-muted)' }}>
                                {t.header.memberSince} {profile?.member_since}
                            </p>
                        </div>
                    </div>

                    {/* Personal Info */}
                    <section id="personal-mobile" className="scroll-mt-36 rounded-[20px] border p-[18px] flex flex-col gap-3.5"
                        style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-card)' }}>
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                                <div className="w-[34px] h-[34px] rounded-[10px] gold-gradient flex items-center justify-center">
                                    <User className="w-[18px] h-[18px] text-primary-foreground" />
                                </div>
                                <span className="font-display font-bold text-[21px]" style={{ color: 'var(--theme-text-head)' }}>
                                    {t.profile.personalInfo}
                                </span>
                            </div>
                            {!editing && (
                                <button
                                    onClick={() => setEditing(true)}
                                    className="h-10 px-3.5 rounded-xl border text-[13px] font-bold flex items-center gap-1.5"
                                    style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-btn-bg)', color: 'var(--theme-text-2)' }}
                                >
                                    <Pencil className="w-4 h-4" />
                                    {t.profile.edit || 'Edit'}
                                </button>
                            )}
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--theme-text-muted)' }}>
                                {t.profile.fullName}
                            </label>
                            {!editing ? (
                                <p className="text-[15px] font-semibold" style={{ color: 'var(--theme-text-head)' }}>{profile?.name}</p>
                            ) : (
                                <input
                                    type="text"
                                    value={draft.name}
                                    onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                                    autoComplete="name"
                                    className="h-12 px-3.5 rounded-xl border text-base outline-none focus:ring-1 focus:ring-gold/50"
                                    style={{ background: 'var(--theme-input-bg)', borderColor: 'var(--theme-border)', color: 'var(--theme-text-head)' }}
                                />
                            )}
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--theme-text-muted)' }}>
                                {t.profile.email}
                            </label>
                            <p className="text-[15px] flex items-center gap-1.5" style={{ color: 'var(--theme-text-2)' }}>
                                <span className="truncate">{profile?.email}</span>
                                <Lock className="w-[15px] h-[15px] flex-shrink-0" style={{ color: 'var(--theme-text-muted)' }} />
                            </p>
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--theme-text-muted)' }}>
                                {t.profile.phone}
                            </label>
                            {!editing ? (
                                <p className="text-[15px] font-semibold" style={{ color: 'var(--theme-text-head)' }}>{profile?.phone || '—'}</p>
                            ) : (
                                <input
                                    type="tel"
                                    inputMode="tel"
                                    value={draft.phone}
                                    onChange={e => setDraft(d => ({ ...d, phone: e.target.value }))}
                                    placeholder="+971 50 000 0000"
                                    autoComplete="tel"
                                    className="h-12 px-3.5 rounded-xl border text-base outline-none focus:ring-1 focus:ring-gold/50"
                                    style={{ background: 'var(--theme-input-bg)', borderColor: 'var(--theme-border)', color: 'var(--theme-text-head)' }}
                                />
                            )}
                        </div>

                        {editing && (
                            <div className="grid grid-cols-[1fr_1.4fr] gap-2 mt-1">
                                <button
                                    onClick={() => { setEditing(false); setDraft({ name: profile.name, phone: profile.phone ?? '' }); }}
                                    className="h-12 rounded-xl border text-[15px] font-semibold"
                                    style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-card)', color: 'var(--theme-text-head)' }}
                                >
                                    {t.profile.cancel || 'Cancel'}
                                </button>
                                <button
                                    onClick={handleSaveInfo}
                                    disabled={savingInfo || !draft.name.trim()}
                                    className="h-12 rounded-xl text-[15px] font-bold flex items-center justify-center gap-2 disabled:opacity-45"
                                    style={{ background: 'var(--theme-cta)', color: 'var(--theme-cta-ink)' }}
                                >
                                    {savingInfo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                    {t.profile.saveChanges}
                                </button>
                            </div>
                        )}
                    </section>

                    {/* Address Book */}
                    <section id="addresses-mobile" className="scroll-mt-36 rounded-[20px] border p-[18px] flex flex-col gap-3"
                        style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-card)' }}>
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-[34px] h-[34px] rounded-[10px] gold-gradient flex items-center justify-center flex-shrink-0">
                                    <MapPin className="w-[18px] h-[18px] text-primary-foreground" />
                                </div>
                                <div className="min-w-0">
                                    <div className="font-display font-bold text-[21px] leading-tight" style={{ color: 'var(--theme-text-head)' }}>
                                        {t.profile.addressBook}
                                    </div>
                                    <div className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>
                                        {addresses.length} of 3 saved
                                    </div>
                                </div>
                            </div>
                            {addresses.length < 3 && (
                                <button
                                    onClick={openModal}
                                    className="flex-none h-10 px-3 rounded-xl border text-[13px] font-bold flex items-center gap-1"
                                    style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-btn-bg)', color: 'var(--theme-text-2)' }}
                                >
                                    <Plus className="w-[17px] h-[17px]" />
                                    {t.profile.addAddress}
                                </button>
                            )}
                        </div>

                        <AnimatePresence>
                            {addresses.map(addr => {
                                const Icon = LOCATION_ICONS[addr.label] ?? MapPin;
                                return (
                                    <motion.div
                                        key={addr.id}
                                        layout
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                        className="p-3.5 rounded-2xl flex flex-col gap-2.5"
                                        style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)' }}
                                    >
                                        <div className="flex gap-3">
                                            <span className="w-[38px] h-[38px] flex-none rounded-[10px] flex items-center justify-center" style={{ background: 'rgba(226,183,100,0.15)' }}>
                                                <Icon className="w-[19px] h-[19px]" style={{ color: 'var(--theme-link)' }} />
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className="text-[15px] font-bold" style={{ color: 'var(--theme-text-head)' }}>{addr.label}</span>
                                                    {addr.is_default && (
                                                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider gold-gradient text-primary-foreground">
                                                            {t.profile.default}
                                                        </span>
                                                    )}
                                                    <span className="px-1.5 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: 'rgba(226,183,100,0.15)', color: 'var(--theme-link)' }}>
                                                        {addr.zone_name}
                                                    </span>
                                                </div>
                                                <p className="text-[13px] mt-0.5 leading-snug truncate" style={{ color: 'var(--theme-text-2)' }}>
                                                    {addr.address}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Actions — always visible (touch has no hover) */}
                                        <div className="flex gap-2 justify-end">
                                            {!addr.is_default && (
                                                <button
                                                    onClick={() => handleSetDefault(addr.id)}
                                                    disabled={settingDefault === addr.id}
                                                    className="h-10 px-3.5 rounded-xl border text-[13px] font-bold"
                                                    style={{ borderColor: 'rgba(226,183,100,0.35)', background: 'var(--theme-card)', color: 'var(--theme-link)' }}
                                                >
                                                    {settingDefault === addr.id
                                                        ? <Loader2 className="w-3.5 h-3.5 animate-spin inline" />
                                                        : (t.profile.setDefault || 'Set Default')}
                                                </button>
                                            )}
                                            <button
                                                onClick={() => setConfirmDeleteId(addr.id)}
                                                disabled={deletingId === addr.id}
                                                aria-label="Delete address"
                                                className="w-10 h-10 rounded-xl border flex items-center justify-center text-destructive"
                                                style={{ borderColor: 'rgba(248,113,113,0.3)', background: 'var(--theme-card)' }}
                                            >
                                                {deletingId === addr.id
                                                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                    : <Trash2 className="w-[18px] h-[18px]" />}
                                            </button>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>

                        {addresses.length === 0 && (
                            <div className="py-6 text-center text-[13px]" style={{ color: 'var(--theme-text-muted)' }}>
                                {t.profile.noAddresses || 'No addresses yet.'} {t.profile.addFirstLocation || 'Add your first location.'}
                            </div>
                        )}
                    </section>

                    {/* Communication Preferences */}
                    <section id="notifications-mobile" className="scroll-mt-36 rounded-[20px] border p-[18px] flex flex-col gap-1"
                        style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-card)' }}>
                        <div className="flex items-center gap-2.5 mb-2">
                            <div className="w-[34px] h-[34px] rounded-[10px] gold-gradient flex items-center justify-center">
                                <Bell className="w-[18px] h-[18px] text-primary-foreground" />
                            </div>
                            <span className="font-display font-bold text-[21px]" style={{ color: 'var(--theme-text-head)' }}>
                                {t.profile.communicationPrefs}
                            </span>
                        </div>

                        {[
                            { key: 'email', label: t.profile.emailNotifications, icon: Mail },
                            { key: 'sms',   label: t.profile.smsNotifications,  icon: MessageSquare },
                            { key: 'push',  label: t.profile.pushNotifications, icon: Bell },
                            { key: 'promo', label: t.profile.promotionalOffers, icon: Tag },
                        ].map(({ key, label, icon: PIcon }) => (
                            <button
                                key={key}
                                type="button"
                                role="switch"
                                aria-checked={prefs[key]}
                                onClick={() => setPrefs(p => ({ ...p, [key]: !p[key] }))}
                                className="flex items-center gap-3 min-h-[52px] text-left"
                                style={{ color: 'var(--theme-text-head)' }}
                            >
                                <span className="w-[34px] h-[34px] flex-none rounded-[10px] flex items-center justify-center" style={{ background: 'var(--theme-btn-bg)' }}>
                                    <PIcon className="w-[17px] h-[17px]" style={{ color: 'var(--theme-text-muted)' }} />
                                </span>
                                <span className="flex-1 text-[15px]">{label}</span>
                                <span
                                    className={`relative flex-none w-12 h-7 rounded-full transition-colors duration-200 ${prefs[key] ? 'gold-gradient' : ''}`}
                                    style={!prefs[key] ? { background: 'var(--theme-btn-bg)' } : undefined}
                                >
                                    <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow-md transition-transform duration-200 ${
                                        prefs[key] ? 'translate-x-[22px]' : 'translate-x-0.5'
                                    }`} />
                                </span>
                            </button>
                        ))}
                    </section>

                    {/* Security */}
                    <section id="security-mobile" className="scroll-mt-36 rounded-[20px] border p-[18px] flex flex-col gap-2.5"
                        style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-card)' }}>
                        <div className="flex items-center gap-2.5 mb-1">
                            <div className="w-[34px] h-[34px] rounded-[10px] gold-gradient flex items-center justify-center">
                                <Shield className="w-[18px] h-[18px] text-primary-foreground" />
                            </div>
                            <span className="font-display font-bold text-[21px]" style={{ color: 'var(--theme-text-head)' }}>
                                {t.profile.security}
                            </span>
                        </div>

                        <div className="flex items-center justify-between gap-2.5 p-3.5 rounded-2xl" style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)' }}>
                            <div className="min-w-0">
                                <p className="text-[14px] font-bold" style={{ color: 'var(--theme-text-head)' }}>{t.profile.twoFactorAuth}</p>
                                <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>{t.profile.twoFactorDesc}</p>
                            </div>
                            <span
                                className="flex-none px-2.5 py-1 rounded-full text-[11px] font-bold"
                                style={profile?.is_otp_enabled
                                    ? { background: 'rgba(16,185,129,0.15)', color: '#10b981' }
                                    : { background: 'var(--theme-card)', color: 'var(--theme-text-muted)' }}
                            >
                                {profile?.is_otp_enabled ? t.profile.enabled : t.profile.disabled}
                            </span>
                        </div>

                        <div className="flex items-center justify-between gap-2.5 p-3.5 rounded-2xl" style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)' }}>
                            <div className="min-w-0">
                                <p className="text-[14px] font-bold" style={{ color: 'var(--theme-text-head)' }}>{t.profile.accountType}</p>
                                <p className="text-xs capitalize" style={{ color: 'var(--theme-text-muted)' }}>
                                    {profile?.role ?? 'customer'} {t.profile.accountTypeDesc}
                                </p>
                            </div>
                            <span className="flex-none text-xs capitalize" style={{ color: 'var(--theme-text-2)' }}>{profile?.role ?? 'customer'}</span>
                        </div>
                    </section>
                </div>

                {/* ── Main Layout (desktop, unchanged) ── */}
                <div className="hidden lg:flex max-w-6xl mx-auto px-4 py-6 gap-6">

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
                                <p className="text-xs truncate w-full" style={{ color: 'var(--theme-text-muted)' }}>{profile?.email}</p>
                                <p className="text-[10px] mt-1.5" style={{ color: 'var(--theme-text-muted)' }}>
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
                                                : ''
                                        }`}
                                        style={!isActive ? { color: 'var(--theme-text-muted)' } : undefined}
                                        onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'var(--theme-btn-bg)'; e.currentTarget.style.color = 'var(--theme-text-head)'; } }}
                                        onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--theme-text-muted)'; } }}
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
                        <section id="personal-desktop" className="scroll-mt-24">
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
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors"
                                            style={{ background: 'var(--theme-btn-bg)', color: 'var(--theme-text-muted)' }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'var(--theme-card-hover)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'var(--theme-btn-bg)'}
                                        >
                                            {t.profile.edit || 'Edit'}
                                        </button>
                                    ) : (
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => { setEditing(false); setDraft({ name: profile.name, phone: profile.phone ?? '' }); }}
                                                className="p-1.5 rounded-lg transition-colors"
                                                style={{ background: 'var(--theme-btn-bg)' }}
                                                onMouseEnter={e => e.currentTarget.style.background = 'var(--theme-card-hover)'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'var(--theme-btn-bg)'}
                                            >
                                                <X className="w-3.5 h-3.5" style={{ color: 'var(--theme-text-muted)' }} />
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
                                        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--theme-btn-bg)' }}>
                                            <User className="w-4 h-4" style={{ color: 'var(--theme-text-muted)' }} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <label className="text-[11px] uppercase tracking-wider block mb-1" style={{ color: 'var(--theme-text-muted)' }}>{t.profile.fullName}</label>
                                            {editing ? (
                                                <input
                                                    type="text"
                                                    value={draft.name}
                                                    onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                                                    className="w-full border rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-1 focus:ring-gold/50 transition-colors"
                                                    style={{ background: 'var(--theme-input-bg)', borderColor: 'var(--theme-border)' }}
                                                />
                                            ) : (
                                                <p className="text-sm font-medium">{profile?.name}</p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Email (read-only) */}
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--theme-btn-bg)' }}>
                                            <Mail className="w-4 h-4" style={{ color: 'var(--theme-text-muted)' }} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <label className="text-[11px] uppercase tracking-wider block mb-1" style={{ color: 'var(--theme-text-muted)' }}>{t.profile.email}</label>
                                            <p className="text-sm font-medium" style={{ color: 'var(--theme-text-muted)' }}>{profile?.email}</p>
                                        </div>
                                    </div>

                                    {/* Phone */}
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--theme-btn-bg)' }}>
                                            <Smartphone className="w-4 h-4" style={{ color: 'var(--theme-text-muted)' }} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <label className="text-[11px] uppercase tracking-wider block mb-1" style={{ color: 'var(--theme-text-muted)' }}>{t.profile.phone}</label>
                                            {editing ? (
                                                <input
                                                    type="tel"
                                                    value={draft.phone}
                                                    onChange={e => setDraft(d => ({ ...d, phone: e.target.value }))}
                                                    placeholder="+971 50 000 0000"
                                                    className="w-full border rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-1 focus:ring-gold/50 transition-colors"
                                                    style={{ background: 'var(--theme-input-bg)', borderColor: 'var(--theme-border)' }}
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
                        <section id="addresses-desktop" className="scroll-mt-24">
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
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors"
                                            style={{ background: 'var(--theme-btn-bg)', color: 'var(--theme-text-muted)' }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'var(--theme-card-hover)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'var(--theme-btn-bg)'}
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
                                                className="flex items-center gap-3 p-4 rounded-xl group transition-all"
                                                style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)' }}
                                                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--theme-link)'}
                                                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--theme-border)'}
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
                                                    <p className="text-xs mt-1" style={{ color: 'var(--theme-text-muted)' }}>{addr.address}</p>
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
                                                        onClick={() => setConfirmDeleteId(addr.id)}
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
                                            <MapPin className="w-8 h-8" style={{ color: 'var(--theme-text-muted)' }} />
                                            <p className="text-sm text-center" style={{ color: 'var(--theme-text-muted)' }}>
                                                {t.profile.noAddresses || 'No addresses yet.'}<br />
                                                {t.profile.addFirstLocation || 'Add your first location.'}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </section>

                        {/* ── SECTION 3: Notifications ── */}
                        <section id="notifications-desktop" className="scroll-mt-24">
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
                                                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--theme-btn-bg)' }}>
                                                    <PIcon className="w-3.5 h-3.5" style={{ color: 'var(--theme-text-muted)' }} />
                                                </div>
                                                <span className="text-sm">{label}</span>
                                            </div>
                                            <button
                                                onClick={() => setPrefs(p => ({ ...p, [key]: !p[key] }))}
                                                className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
                                                    prefs[key] ? 'gold-gradient' : ''
                                                }`}
                                                style={!prefs[key] ? { background: 'var(--theme-btn-bg)' } : undefined}
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
                        <section id="security-desktop" className="scroll-mt-24 pb-10">
                            <div className="glass-card p-6">
                                <div className="flex items-center gap-2.5 mb-6">
                                    <div className="w-8 h-8 rounded-lg gold-gradient flex items-center justify-center">
                                        <Shield className="w-4 h-4 text-primary-foreground" />
                                    </div>
                                    <h3 className="font-display text-base font-semibold">{t.profile.security}</h3>
                                </div>

                                <div className="space-y-3">
                                    <div className="flex items-center justify-between p-4 rounded-xl" style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)' }}>
                                        <div>
                                            <p className="text-sm font-medium">{t.profile.twoFactorAuth}</p>
                                            <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>{t.profile.twoFactorDesc}</p>
                                        </div>
                                        <span
                                            className={`px-2.5 py-1 rounded-full text-[10px] font-semibold ${
                                                profile?.is_otp_enabled ? 'bg-emerald-500/20 text-emerald-400' : ''
                                            }`}
                                            style={!profile?.is_otp_enabled ? { background: 'var(--theme-btn-bg)', color: 'var(--theme-text-muted)' } : undefined}
                                        >
                                            {profile?.is_otp_enabled ? t.profile.enabled : t.profile.disabled}
                                        </span>
                                    </div>

                                    <div className="flex items-center justify-between p-4 rounded-xl" style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)' }}>
                                        <div>
                                            <p className="text-sm font-medium">{t.profile.accountType}</p>
                                            <p className="text-xs capitalize" style={{ color: 'var(--theme-text-muted)' }}>
                                                {profile?.role ?? 'customer'} {t.profile.accountTypeDesc}
                                            </p>
                                        </div>
                                        <span className="text-xs capitalize" style={{ color: 'var(--theme-text-muted)' }}>{profile?.role ?? 'customer'}</span>
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
                                className="relative w-full max-w-md rounded-2xl shadow-2xl z-10 overflow-hidden"
                                style={{ background: 'var(--theme-card)', border: '1px solid var(--theme-border)' }}
                            >
                                {/* Modal Header */}
                                <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--theme-border)' }}>
                                    <div className="flex items-center gap-3">
                                        {modalStep === 2 && (
                                            <button
                                                onClick={() => { setModalStep(1); setSelectedZone(null); }}
                                                className="p-1 rounded-lg transition-colors"
                                                onMouseEnter={e => e.currentTarget.style.background = 'var(--theme-btn-bg)'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                            >
                                                <ChevronLeft className="w-4 h-4" style={{ color: 'var(--theme-text-muted)' }} />
                                            </button>
                                        )}
                                        <h4 className="font-display font-semibold text-base">
                                            {modalStep === 1 ? (t.profile.selectZone || 'Select your zone') : (t.profile.enterAddress || 'Enter your address')}
                                        </h4>
                                    </div>
                                    <button
                                        onClick={closeModal}
                                        style={{ color: 'var(--theme-text-muted)' }}
                                        onMouseEnter={e => e.currentTarget.style.color = 'var(--theme-text-head)'}
                                        onMouseLeave={e => e.currentTarget.style.color = 'var(--theme-text-muted)'}
                                    >
                                        <X className="w-4 h-4 transition-colors" />
                                    </button>
                                </div>

                                {/* Step 1 — Zone Selection */}
                                {modalStep === 1 && (
                                    <div className="p-5 space-y-3">
                                        <p className="text-xs mb-4" style={{ color: 'var(--theme-text-muted)' }}>
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
                                                    style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-btn-bg)' }}
                                                    onMouseEnter={e => {
                                                        e.currentTarget.style.borderColor = '#e2b764';
                                                        e.currentTarget.style.background = 'rgba(226,183,100,0.05)';
                                                    }}
                                                    onMouseLeave={e => {
                                                        e.currentTarget.style.borderColor = 'var(--theme-border)';
                                                        e.currentTarget.style.background = 'var(--theme-btn-bg)';
                                                    }}
                                                >
                                                    <div className="w-7 h-7 rounded-lg bg-gold/10 flex items-center justify-center mb-2">
                                                        <MapPin className="w-3.5 h-3.5 text-gold" />
                                                    </div>
                                                    <p className="text-sm font-semibold" style={{ color: 'var(--theme-text-head)' }}>{zone.label}</p>
                                                    <p className="text-[10px] mt-0.5 line-clamp-1" style={{ color: 'var(--theme-text-muted)' }}>Dubai, UAE</p>
                                                </button>
                                            ))}
                                        </div>

                                        {/* Not in list */}
                                        <div className="mt-4 p-4 rounded-xl border border-dashed text-center" style={{ borderColor: 'var(--theme-border)' }}>
                                            <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>
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
                                            <label className="text-[11px] uppercase tracking-wider block mb-1.5" style={{ color: 'var(--theme-text-muted)' }}>
                                                {t.profile.locationLabel || 'Location Label'}
                                            </label>
                                            <input
                                                type="text"
                                                value={addrLabel}
                                                onChange={e => setAddrLabel(e.target.value)}
                                                placeholder={t.profile.labelPlaceholder || 'e.g. Home, Studio, Office...'}
                                                className="w-full border rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-1 focus:ring-gold/50 transition-colors"
                                                style={{ background: 'var(--theme-input-bg)', borderColor: 'var(--theme-border)' }}
                                                autoFocus
                                            />
                                        </div>

                                        {/* Exact address input */}
                                        <div>
                                            <label className="text-[11px] uppercase tracking-wider block mb-1.5" style={{ color: 'var(--theme-text-muted)' }}>
                                                {t.profile.exactAddress || 'Exact Address'}
                                            </label>
                                            <textarea
                                                value={addrText}
                                                onChange={e => setAddrText(e.target.value)}
                                                placeholder={t.profile.addressPlaceholder || 'e.g. Villa 23, Street 5B, Gate Village, DIFC'}
                                                rows={3}
                                                className="w-full border rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-1 focus:ring-gold/50 transition-colors resize-none"
                                                style={{ background: 'var(--theme-input-bg)', borderColor: 'var(--theme-border)' }}
                                            />
                                        </div>

                                        {/* Submit button */}
                                        <button
                                            onClick={handleAddAddress}
                                            disabled={!addrLabel.trim() || !addrText.trim() || savingAddress}
                                            className="w-full py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                            style={{ background: 'var(--theme-cta)', color: 'var(--theme-cta-ink)' }}
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