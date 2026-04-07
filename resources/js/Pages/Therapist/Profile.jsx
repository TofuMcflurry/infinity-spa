import TherapistLayout from '@/Layouts/TherapistLayout';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    User, Mail, Phone, Briefcase, Star, MapPin,
    Clock, Calendar, Edit3, Camera, Save, X,
    CheckCircle2, AlertCircle, Shield, ToggleLeft, ToggleRight,
} from 'lucide-react';

// ── CSRF + API helper ────────────────────────────────────────────────────────
function getCsrf() {
    const cookie = document.cookie.split('; ').find(r => r.startsWith('XSRF-TOKEN='));
    return cookie ? decodeURIComponent(cookie.split('=')[1]) : '';
}

async function apiFetch(url, options = {}) {
    const res = await fetch(url, {
        ...options,
        credentials: 'same-origin',
        headers: {
            'Accept': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-XSRF-TOKEN': getCsrf(),
            ...(options.headers ?? {}),
        },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

// ── Dubai zones ───────────────────────────────────────────────────────────────
const DUBAI_ZONES = [
    'JAFZA', 'DAFZ', 'DMCC/JLT', 'Dubai South',
    'Dubai Silicon Oasis', 'Dubai Internet City',
    'Dubai Design District', 'DIFC',
];

// ── Section label ─────────────────────────────────────────────────────────────
function SectionLabel({ children }) {
    return (
        <div className="mb-4 pb-2 border-b" style={{ borderColor: 'var(--theme-border)' }}>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--theme-text-muted)' }}>
                {children}
            </p>
        </div>
    );
}

// ── Info row ──────────────────────────────────────────────────────────────────
function InfoRow({ icon: Icon, iconColor, label, value }) {
    return (
        <div className="flex items-start gap-3 py-2">
            <div className="flex-shrink-0 mt-0.5">
                <Icon size={16} style={{ color: iconColor }} />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--theme-text-muted)' }}>{label}</p>
                <p className="text-sm font-medium mt-0.5" style={{ color: 'var(--theme-text-head)' }}>{value || '—'}</p>
            </div>
        </div>
    );
}

// ── Star rating ───────────────────────────────────────────────────────────────
function StarRating({ rating }) {
    const val = parseFloat(rating) || 0;
    return (
        <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map(n => (
                <Star
                    key={n}
                    size={14}
                    fill={n <= Math.round(val) ? '#e2b764' : 'none'}
                    className={n <= Math.round(val) ? 'text-[#e2b764]' : 'text-gray-500'}
                />
            ))}
            <span className="text-xs font-semibold ml-1 text-[#e2b764]">
                {val > 0 ? val.toFixed(1) : 'No rating'}
            </span>
        </div>
    );
}

// ── Card component ────────────────────────────────────────────────────────────
function Card({ children, className = '' }) {
    return (
        <div
            className={`rounded-xl overflow-hidden ${className}`}
            style={{ background: 'var(--theme-card)', border: '1px solid var(--theme-border)' }}
        >
            {children}
        </div>
    );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function Skeleton() {
    return (
        <div className="space-y-4">
            {[1, 2, 3, 4].map(i => (
                <Card key={i}>
                    <div className="p-5 animate-pulse">
                        <div className="h-4 rounded w-1/4 mb-4" style={{ background: 'var(--theme-skeleton)' }}></div>
                        <div className="space-y-3">
                            <div className="h-10 rounded" style={{ background: 'var(--theme-skeleton)' }}></div>
                            <div className="h-10 rounded" style={{ background: 'var(--theme-skeleton)' }}></div>
                        </div>
                    </div>
                </Card>
            ))}
        </div>
    );
}

// ── Main Profile page ─────────────────────────────────────────────────────────
export default function Profile() {
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState(null);

    // Contact edit
    const [editingContact, setEditingContact] = useState(false);
    const [phoneValue, setPhoneValue] = useState('');
    const [savingContact, setSavingContact] = useState(false);

    // Avatar
    const [avatarUploading, setAvatarUploading] = useState(false);
    const fileInputRef = useRef(null);

    // Availability toggle
    const [togglingActive, setTogglingActive] = useState(false);

    // Location
    const [editingLocation, setEditingLocation] = useState(false);
    const [zoneValue, setZoneValue] = useState('');
    const [savingLocation, setSavingLocation] = useState(false);

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3500);
    };

    useEffect(() => {
        apiFetch('/therapist/api/profile')
            .then(data => {
                setProfile(data);
                setPhoneValue(data.phone ?? '');
                setZoneValue(data.current_zone ?? '');
            })
            .catch(() => showToast('Failed to load profile.', 'error'))
            .finally(() => setLoading(false));
    }, []);

    const saveContact = async () => {
        setSavingContact(true);
        try {
            const data = await apiFetch('/therapist/api/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: phoneValue }),
            });
            setProfile(prev => ({ ...prev, phone: phoneValue }));
            setEditingContact(false);
            showToast(data.message ?? 'Contact updated!');
        } catch {
            showToast('Failed to save contact.', 'error');
        } finally {
            setSavingContact(false);
        }
    };

    const handleAvatarChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('avatar', file);
        setAvatarUploading(true);
        try {
            const data = await apiFetch('/therapist/api/profile/avatar', {
                method: 'POST',
                body: formData,
            });
            setProfile(prev => ({ ...prev, avatar: data.avatar ?? prev.avatar }));
            showToast(data.message ?? 'Avatar updated!');
        } catch {
            showToast('Failed to upload avatar.', 'error');
        } finally {
            setAvatarUploading(false);
            e.target.value = '';
        }
    };

    const toggleAvailability = async () => {
        if (togglingActive) return;
        const next = !profile.is_active;
        setTogglingActive(true);
        setProfile(prev => ({ ...prev, is_active: next }));
        try {
            await apiFetch('/therapist/api/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: next }),
            });
            showToast(next ? 'You are now available.' : 'You are now unavailable.');
        } catch {
            setProfile(prev => ({ ...prev, is_active: !next }));
            showToast('Failed to update availability.', 'error');
        } finally {
            setTogglingActive(false);
        }
    };

    const saveLocation = async () => {
        if (!zoneValue) return;
        setSavingLocation(true);
        try {
            const data = await apiFetch('/therapist/api/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ current_zone: zoneValue }),
            });
            setProfile(prev => ({ ...prev, current_zone: zoneValue }));
            setEditingLocation(false);
            showToast(data.message ?? 'Location updated!');
        } catch {
            showToast('Failed to update location.', 'error');
        } finally {
            setSavingLocation(false);
        }
    };

    const initials = (name = '') =>
        name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'T';

    const shiftLabel = (p) => {
        if (!p?.shift_start || !p?.shift_end) return '—';
        return p.crosses_midnight
            ? `${p.shift_start} – ${p.shift_end} (next day)`
            : `${p.shift_start} – ${p.shift_end}`;
    };

    const currentZoneTravelTime = profile?.zones?.find(z => z.zone_name === profile?.current_zone)?.travel_minutes;

    return (
        <TherapistLayout>
            <div className="min-h-screen" style={{ background: 'var(--theme-bg)' }}>
                
                {/* Page header */}
                <div className="max-w-5xl mx-auto px-4 md:px-6 pt-8 pb-4">
                    <h1 className="text-3xl font-bold tracking-tight" style={{ color: 'var(--theme-text-head)' }}>My Profile</h1>
                    <p className="mt-1" style={{ color: 'var(--theme-text-muted)' }}>Manage your account and professional details</p>
                </div>

                <div className="max-w-5xl mx-auto px-4 md:px-6 pb-12">
                    {loading ? (
                        <Skeleton />
                    ) : profile ? (
                        <div className="space-y-5">
                            
                            {/* Header Card - Avatar + Identity + Availability */}
                            <Card>
                                <div className="p-6">
                                    <div className="flex flex-col lg:flex-row items-start lg:items-center gap-6">
                                        
                                        {/* Avatar Section */}
                                        <div className="relative flex-shrink-0">
                                            <div className="relative">
                                                <div className="w-24 h-24 rounded-full overflow-hidden bg-gradient-to-br from-[#e2b764] to-[#c49a3a] flex items-center justify-center">
                                                    {profile.avatar ? (
                                                        <img src={profile.avatar} alt={profile.name} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <span className="text-3xl font-bold text-gray-900">{initials(profile.name)}</span>
                                                    )}
                                                </div>
                                                <button
                                                    onClick={() => fileInputRef.current?.click()}
                                                    disabled={avatarUploading}
                                                    className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-[#e2b764] border-2 border-gray-900 flex items-center justify-center hover:bg-[#d4a94e] transition-colors disabled:opacity-50"
                                                >
                                                    <Camera size={14} className="text-gray-900" />
                                                </button>
                                                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                                                {avatarUploading && (
                                                    <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                                                        <div className="w-6 h-6 border-2 border-[#e2b764] border-t-transparent rounded-full animate-spin"></div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Identity Section */}
                                        <div className="flex-1">
                                            <h2 className="text-2xl font-bold" style={{ color: 'var(--theme-text-head)' }}>{profile.name}</h2>
                                            <div className="flex flex-wrap items-center gap-2 mt-2">
                                                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold bg-[#e2b764]/10 border border-[#e2b764]/30 text-[#e2b764]">
                                                    <Shield size={12} /> Therapist
                                                </span>
                                                {profile.is_active ? (
                                                    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                                                        <CheckCircle2 size={12} /> Available
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold" style={{ background: 'rgba(107,114,128,0.1)', border: '1px solid rgba(107,114,128,0.3)', color: 'var(--theme-text-muted)' }}>
                                                        Unavailable
                                                    </span>
                                                )}
                                            </div>
                                            <div className="mt-2">
                                                <StarRating rating={profile.rating} />
                                            </div>
                                        </div>

                                        {/* Availability Toggle */}
                                        <div className="flex-shrink-0">
                                            <button
                                                onClick={toggleAvailability}
                                                disabled={togglingActive}
                                                className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all disabled:opacity-50"
                                                style={{
                                                    background: profile.is_active ? 'rgba(16,185,129,0.1)' : 'rgba(107,114,128,0.1)',
                                                    border: `1px solid ${profile.is_active ? 'rgba(16,185,129,0.3)' : 'rgba(107,114,128,0.3)'}`,
                                                    color: profile.is_active ? '#10b981' : 'var(--theme-text-muted)',
                                                }}
                                            >
                                                {profile.is_active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                                                {profile.is_active ? 'Available' : 'Unavailable'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </Card>

                            {/* Two Column Grid */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                                
                                {/* Professional Info */}
                                <Card>
                                    <div className="p-5">
                                        <SectionLabel>Professional Info</SectionLabel>
                                        <div className="space-y-1">
                                            <InfoRow icon={Briefcase} iconColor="#e2b764" label="Specialty" value={profile.specialty} />
                                            <InfoRow icon={Clock} iconColor="#8b5cf6" label="Experience" value={profile.experience_years ? `${profile.experience_years} year${profile.experience_years !== 1 ? 's' : ''}` : null} />
                                            <InfoRow icon={MapPin} iconColor="#3b82f6" label="Base Location" value={profile.base_location} />
                                            <InfoRow icon={User} iconColor="#10b981" label="Gender" value={profile.gender ? profile.gender.charAt(0).toUpperCase() + profile.gender.slice(1) : null} />
                                            <InfoRow icon={Calendar} iconColor="#f59e0b" label="Day Off" value={profile.day_off} />
                                            <InfoRow icon={Clock} iconColor="#94a3b8" label="Shift Hours" value={shiftLabel(profile)} />
                                        </div>
                                    </div>
                                </Card>

                                {/* Service Zones */}
                                <Card>
                                    <div className="p-5">
                                        <SectionLabel>Service Areas</SectionLabel>
                                        {profile.zones && profile.zones.length > 0 ? (
                                            <div className="space-y-2">
                                                {profile.zones.map((zone, idx) => (
                                                    <div
                                                        key={idx}
                                                        className="flex items-center justify-between p-3 rounded-lg transition-all"
                                                        style={zone.zone_name === profile.current_zone
                                                            ? { background: 'rgba(226,183,100,0.06)', border: '1px solid rgba(226,183,100,0.2)' }
                                                            : { background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)' }
                                                        }
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <MapPin size={14} className="text-[#e2b764]" />
                                                            <span className="text-sm font-medium" style={{ color: 'var(--theme-text-head)' }}>{zone.zone_name}</span>
                                                            {zone.zone_name === profile.current_zone && (
                                                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#e2b764]/20 text-[#e2b764]">
                                                                    Current
                                                                </span>
                                                            )}
                                                        </div>
                                                        <span className="text-xs font-semibold px-2 py-1 rounded bg-blue-500/10 text-blue-400">
                                                            {zone.travel_minutes} min
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="text-center py-8">
                                                <MapPin size={32} className="mx-auto mb-2" style={{ color: 'var(--theme-text-muted)' }} />
                                                <p className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>No service zones configured</p>
                                            </div>
                                        )}
                                    </div>
                                </Card>
                            </div>

                            {/* Bio Section */}
                            <Card>
                                <div className="p-5">
                                    <SectionLabel>About Me</SectionLabel>
                                    <p className="leading-relaxed" style={{ color: 'var(--theme-text)' }}>
                                        {profile.bio || 'No bio has been added yet.'}
                                    </p>
                                </div>
                            </Card>

                            {/* Contact Info */}
                            <Card>
                                <div className="p-5">
                                    <div className="flex items-center justify-between mb-4">
                                        <SectionLabel>Contact</SectionLabel>
                                        {!editingContact && (
                                            <button
                                                onClick={() => { setPhoneValue(profile.phone ?? ''); setEditingContact(true); }}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#e2b764]/10 text-[#e2b764] hover:bg-[#e2b764]/20 transition-colors"
                                            >
                                                <Edit3 size={12} /> Edit
                                            </button>
                                        )}
                                    </div>

                                    <div className="space-y-3">
                                        {/* Email */}
                                        <div className="flex items-start gap-3 py-2">
                                            <Mail size={16} className="mt-0.5" style={{ color: 'var(--theme-text-muted)' }} />
                                            <div className="flex-1">
                                                <p className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--theme-text-muted)' }}>Email</p>
                                                <p className="text-sm mt-0.5" style={{ color: 'var(--theme-text-2)' }}>{profile.email}</p>
                                            </div>
                                            <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: 'var(--theme-btn-bg)', color: 'var(--theme-text-muted)', border: '1px solid var(--theme-border)' }}>read-only</span>
                                        </div>

                                        {/* Phone */}
                                        <AnimatePresence mode="wait">
                                            {editingContact ? (
                                                <motion.div key="edit" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-3 pt-2">
                                                    <div>
                                                        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--theme-text-muted)' }}>Phone Number</label>
                                                        <input
                                                            type="tel"
                                                            value={phoneValue}
                                                            onChange={e => setPhoneValue(e.target.value)}
                                                            placeholder="+971 50 000 0000"
                                                            className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none transition-colors" style={{ background: 'var(--theme-input-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-head)' }}
                                                        />
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button onClick={() => setEditingContact(false)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors" style={{ background: 'var(--theme-btn-bg)', color: 'var(--theme-text-2)', border: '1px solid var(--theme-border)' }}>
                                                            <X size={12} /> Cancel
                                                        </button>
                                                        <button onClick={saveContact} disabled={savingContact} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#e2b764] text-gray-900 hover:bg-[#d4a94e] transition-colors disabled:opacity-50">
                                                            {savingContact ? <div className="w-3 h-3 border-2 border-gray-900 border-t-transparent rounded-full animate-spin"></div> : <Save size={12} />}
                                                            Save
                                                        </button>
                                                    </div>
                                                </motion.div>
                                            ) : (
                                                <motion.div key="view" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-start gap-3 py-2">
                                                    <Phone size={16} className="text-emerald-400 mt-0.5" />
                                                    <div className="flex-1">
                                                        <p className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--theme-text-muted)' }}>Phone</p>
                                                        <p className="text-sm mt-0.5" style={{ color: 'var(--theme-text-head)' }}>{profile.phone || 'Not set'}</p>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                </div>
                            </Card>

                            {/* My Location */}
                            <Card>
                                <div className="p-5">
                                    <div className="flex items-center justify-between mb-4">
                                        <SectionLabel>My Location</SectionLabel>
                                        {!editingLocation && (
                                            <button
                                                onClick={() => { setZoneValue(profile.current_zone ?? ''); setEditingLocation(true); }}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#e2b764]/10 text-[#e2b764] hover:bg-[#e2b764]/20 transition-colors"
                                            >
                                                <Edit3 size={12} /> Edit
                                            </button>
                                        )}
                                    </div>

                                    <AnimatePresence mode="wait">
                                        {editingLocation ? (
                                            <motion.div key="edit" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-3">
                                                <select
                                                    value={zoneValue}
                                                    onChange={e => setZoneValue(e.target.value)}
                                                    className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none transition-colors" style={{ background: 'var(--theme-input-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-head)' }}
                                                >
                                                    <option value="" disabled className="">Select a zone…</option>
                                                    {DUBAI_ZONES.map(zone => (
                                                        <option key={zone} value={zone}>{zone}</option>
                                                    ))}
                                                </select>
                                                <div className="flex gap-2">
                                                    <button onClick={() => setEditingLocation(false)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors" style={{ background: 'var(--theme-btn-bg)', color: 'var(--theme-text-2)', border: '1px solid var(--theme-border)' }}>
                                                        <X size={12} /> Cancel
                                                    </button>
                                                    <button onClick={saveLocation} disabled={savingLocation || !zoneValue} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#e2b764] text-gray-900 hover:bg-[#d4a94e] transition-colors disabled:opacity-50">
                                                        {savingLocation ? <div className="w-3 h-3 border-2 border-gray-900 border-t-transparent rounded-full animate-spin"></div> : <Save size={12} />}
                                                        Save
                                                    </button>
                                                </div>
                                            </motion.div>
                                        ) : (
                                            <motion.div key="view" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                                {profile.current_zone ? (
                                                    <div className="flex items-center justify-between p-3 rounded-lg bg-[#e2b764]/5 border border-[#e2b764]/20">
                                                        <div className="flex items-center gap-3">
                                                            <MapPin size={18} className="text-[#e2b764]" />
                                                            <div>
                                                                <p className="text-sm font-semibold" style={{ color: 'var(--theme-text-head)' }}>{profile.current_zone}</p>
                                                                <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>Current zone</p>
                                                            </div>
                                                        </div>
                                                        {currentZoneTravelTime && (
                                                            <span className="text-xs font-semibold px-2 py-1 rounded bg-blue-500/10 text-blue-400">
                                                                {currentZoneTravelTime} min travel
                                                            </span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="text-center py-6">
                                                        <MapPin size={32} className="mx-auto mb-2" style={{ color: 'var(--theme-text-muted)' }} />
                                                        <p className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>No current location set</p>
                                                    </div>
                                                )}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </Card>
                        </div>
                    ) : null}
                </div>
            </div>

            {/* Toast Notification */}
            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.95 }}
                        className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 px-4 py-2.5 rounded-lg shadow-lg flex items-center gap-2 text-sm font-medium"
                        style={{
                            background: toast.type === 'error' ? '#991b1b' : '#065f46',
                            border: `1px solid ${toast.type === 'error' ? '#ef4444' : '#10b981'}`,
                            color: '#ffffff',
                        }}
                    >
                        {toast.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
                        {toast.message}
                    </motion.div>
                )}
            </AnimatePresence>
        </TherapistLayout>
    );
}