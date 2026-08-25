import { useState, useEffect, useCallback } from 'react';
import {
    Shield, AlertTriangle, Ban, Clock, CheckCircle2,
    ChevronRight, X, Loader2, Users, TrendingUp,
    ShieldAlert, ShieldCheck, Info,
} from 'lucide-react';
import AdminLayout from '@/Layouts/AdminLayout';

// ── API helper ────────────────────────────────────────────────────────────────
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
            'Content-Type': 'application/json',
            ...(options.headers ?? {}),
        },
    });
    return res.json();
}

// ── Level config ──────────────────────────────────────────────────────────────
const LEVEL_CONFIG = {
    none:                { color: '#22c55e', bg: 'rgba(34,197,94,0.1)',   border: 'rgba(34,197,94,0.2)',   label: 'No Restriction', icon: ShieldCheck },
    warned:              { color: '#e2b764', bg: 'rgba(226,183,100,0.1)', border: 'rgba(226,183,100,0.2)', label: 'Warned',         icon: AlertTriangle },
    temp_blocked:        { color: '#f97316', bg: 'rgba(249,115,22,0.1)',  border: 'rgba(249,115,22,0.2)',  label: 'Temp Blocked',   icon: Clock },
    permanently_blocked: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.2)',   label: 'Permanently Blocked', icon: Ban },
};

const VIOLATION_LEVEL = {
    warning:        { color: '#e2b764', bg: 'rgba(226,183,100,0.1)', label: 'Warning' },
    temp_block:     { color: '#f97316', bg: 'rgba(249,115,22,0.1)',  label: 'Temp Block' },
    permanent_block:{ color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   label: 'Permanent Block' },
};

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, color }) {
    return (
        <div className="rounded-2xl p-4 glass-card-strong flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: `${color}18`, border: `1px solid ${color}30` }}>
                <Icon size={18} style={{ color }} />
            </div>
            <div>
                <div className="text-xl font-display font-bold" style={{ color: 'var(--theme-text-head)' }}>{value}</div>
                <div className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>{label}</div>
            </div>
        </div>
    );
}

// ── Violation Action Modal ────────────────────────────────────────────────────
function ViolationModal({ open, user, action, onClose, onSuccess }) {
    const [reason, setReason]           = useState('');
    const [description, setDescription] = useState('');
    const [duration, setDuration]       = useState(7);
    const [loading, setLoading]         = useState(false);
    const [error, setError]             = useState(null);

    useEffect(() => {
        if (open) { setReason(''); setDescription(''); setDuration(7); setError(null); }
    }, [open]);

    if (!open || !user) return null;

    const config = {
        warn: {
            title: `Issue Warning to ${user.name}`,
            subtitle: `Strike ${(user.strike_count ?? 0) + 1} — formal warning recorded`,
            color: '#e2b764',
            bg: 'rgba(226,183,100,0.1)',
            icon: AlertTriangle,
            btnLabel: 'Issue Warning',
            btnStyle: { background: 'linear-gradient(135deg, #b7882a, #e2b764)', color: '#0b1120' },
        },
        temp_block: {
            title: `Temporarily Block ${user.name}`,
            subtitle: 'Customer will be unable to login or book during this period',
            color: '#f97316',
            bg: 'rgba(249,115,22,0.1)',
            icon: Clock,
            btnLabel: 'Apply Temp Block',
            btnStyle: { background: '#f97316', color: 'white' },
        },
        permanent_block: {
            title: `Permanently Block ${user.name}`,
            subtitle: 'This action will permanently suspend the account',
            color: '#ef4444',
            bg: 'rgba(239,68,68,0.1)',
            icon: Ban,
            btnLabel: 'Permanently Block',
            btnStyle: { background: '#ef4444', color: 'white' },
        },
        lift: {
            title: `Lift Restriction for ${user.name}`,
            subtitle: 'All active restrictions will be removed',
            color: '#22c55e',
            bg: 'rgba(34,197,94,0.1)',
            icon: ShieldCheck,
            btnLabel: 'Lift Restriction',
            btnStyle: { background: '#22c55e', color: 'white' },
        },
    }[action] ?? {};

    const Icon = config.icon;

    const handleSubmit = async () => {
        if (action !== 'lift' && !reason.trim()) { setError('Reason is required.'); return; }
        setLoading(true);
        setError(null);

        const urls = {
            warn:            `/admin/api/trust-safety/user/${user.id}/warn`,
            temp_block:      `/admin/api/trust-safety/user/${user.id}/temp-block`,
            permanent_block: `/admin/api/trust-safety/user/${user.id}/permanent-block`,
            lift:            `/admin/api/trust-safety/user/${user.id}/lift`,
        };

        const body = action === 'temp_block'
            ? { reason, description, duration_days: duration }
            : action === 'lift'
            ? { note: description }
            : { reason, description };

        try {
            const res = await apiFetch(urls[action], { method: 'POST', body: JSON.stringify(body) });
            onSuccess(res);
            onClose();
        } catch (e) {
            setError('Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <button className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose} />
            <div className="relative w-full max-w-md rounded-2xl p-5"
                style={{ background: 'var(--theme-notif-bg)', border: '1px solid var(--theme-border)' }}>

                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: config.bg }}>
                        <Icon size={18} style={{ color: config.color }} />
                    </div>
                    <div>
                        <h3 className="text-sm font-display font-bold" style={{ color: 'var(--theme-text-head)' }}>
                            {config.title}
                        </h3>
                        <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>{config.subtitle}</p>
                    </div>
                </div>

                {error && (
                    <div className="px-3 py-2 rounded-lg mb-3 text-xs"
                        style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                        {error}
                    </div>
                )}

                {action === 'temp_block' && (
                    <div className="mb-3">
                        <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--theme-text-2)' }}>
                            Duration
                        </label>
                        <div className="flex gap-2">
                            {[7, 30].map(d => (
                                <button key={d} type="button"
                                    onClick={() => setDuration(d)}
                                    className="flex-1 py-2 rounded-xl text-sm font-semibold"
                                    style={{
                                        background: duration === d ? 'rgba(249,115,22,0.15)' : 'var(--theme-btn-bg)',
                                        border: `1px solid ${duration === d ? 'rgba(249,115,22,0.4)' : 'var(--theme-border)'}`,
                                        color: duration === d ? '#f97316' : 'var(--theme-text-2)',
                                    }}>
                                    {d} days
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {action !== 'lift' && (
                    <div className="mb-3">
                        <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--theme-text-2)' }}>
                            Reason *
                        </label>
                        <input type="text" value={reason} onChange={e => setReason(e.target.value)}
                            placeholder="e.g. Harassment of therapist, Inappropriate behavior..."
                            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                            style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-head)' }} />
                    </div>
                )}

                <div className="mb-4">
                    <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--theme-text-2)' }}>
                        {action === 'lift' ? 'Admin Note (optional)' : 'Additional Details (optional)'}
                    </label>
                    <textarea value={description} onChange={e => setDescription(e.target.value)}
                        placeholder={action === 'lift' ? 'Why is this restriction being lifted?' : 'Provide more context...'}
                        rows={3}
                        className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                        style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-head)' }} />
                </div>

                <div className="flex gap-3">
                    <button onClick={onClose}
                        className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold"
                        style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-2)' }}>
                        Cancel
                    </button>
                    <button onClick={handleSubmit} disabled={loading}
                        className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
                        style={config.btnStyle}>
                        {loading && <Loader2 size={14} className="animate-spin" />}
                        {config.btnLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── User Drawer ───────────────────────────────────────────────────────────────
function UserDrawer({ user, onClose, onUpdated }) {
    const [violations, setViolations] = useState([]);
    const [meta, setMeta]             = useState(null);
    const [loading, setLoading]       = useState(true);
    const [modal, setModal]           = useState(null);

    useEffect(() => {
        if (!user) return;
        setLoading(true);
        apiFetch(`/admin/api/trust-safety/user/${user.id}/violations`)
            .then(res => {
                setViolations(res.violations);
                setMeta(res);
            })
            .finally(() => setLoading(false));
    }, [user]);

    if (!user) return null;

    const levelCfg = LEVEL_CONFIG[user.restriction_level] ?? LEVEL_CONFIG.none;
    const LevelIcon = levelCfg.icon;

    const handleSuccess = (res) => {
        onUpdated(res.user);
        // Reload violations
        apiFetch(`/admin/api/trust-safety/user/${user.id}/violations`)
            .then(r => { setViolations(r.violations); setMeta(r); });
    };

    return (
        <>
            <div className="fixed inset-0 z-50 flex">
                <button className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onClose} />
                <div className="absolute inset-y-0 right-0 w-full max-w-lg flex flex-col"
                    style={{ background: 'var(--theme-notif-bg)', borderLeft: '1px solid var(--theme-border)' }}>

                    {/* Header */}
                    <div className="flex items-start justify-between px-5 py-4 border-b"
                        style={{ borderColor: 'var(--theme-border)' }}>
                        <div className="flex items-center gap-3">
                            <div className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                                style={{ background: 'linear-gradient(135deg, #b7882a, #e2b764)', color: '#0b1120' }}>
                                {user.initials}
                            </div>
                            <div>
                                <h2 className="text-sm font-display font-bold" style={{ color: 'var(--theme-text-head)' }}>
                                    {user.name}
                                </h2>
                                <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>{user.email}</p>
                                <div className="flex items-center gap-1.5 mt-1">
                                    <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                                        style={{ background: levelCfg.bg, border: `1px solid ${levelCfg.border}`, color: levelCfg.color }}>
                                        <LevelIcon size={10} />
                                        {levelCfg.label}
                                    </span>
                                    <span className="text-[10px]" style={{ color: 'var(--theme-text-muted)' }}>
                                        {user.strike_count} strike{user.strike_count !== 1 ? 's' : ''}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center"
                            style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)' }}>
                            <X size={15} style={{ color: 'var(--theme-text-2)' }} />
                        </button>
                    </div>

                    {/* Auto-escalation suggestion */}
                    {meta?.suggest_temp_block && (
                        <div className="mx-4 mt-4 px-4 py-3 rounded-xl flex items-start gap-3"
                            style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.25)' }}>
                            <Info size={15} style={{ color: '#f97316', flexShrink: 0, marginTop: 1 }} />
                            <div className="flex-1">
                                <p className="text-xs font-semibold" style={{ color: '#f97316' }}>
                                    Auto-escalation Suggested
                                </p>
                                <p className="text-xs mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>
                                    This user has received 3+ warnings in the last 6 months. Consider issuing a temporary block.
                                </p>
                            </div>
                            <button onClick={() => setModal('temp_block')}
                                className="text-xs font-semibold px-2.5 py-1.5 rounded-lg flex-shrink-0"
                                style={{ background: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.3)', color: '#f97316' }}>
                                Block Now
                            </button>
                        </div>
                    )}

                    {/* Temp block expiry */}
                    {user.restriction_level === 'temp_blocked' && user.restricted_until && (
                        <div className="mx-4 mt-4 px-4 py-3 rounded-xl"
                            style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.2)' }}>
                            <p className="text-xs font-semibold" style={{ color: '#f97316' }}>
                                <Clock size={12} className="inline mr-1" />
                                Blocked until {user.restricted_until}
                            </p>
                        </div>
                    )}

                    {/* Action buttons */}
                    <div className="px-4 pt-4 flex flex-wrap gap-2">
                        {user.restriction_level === 'none' || user.restriction_level === 'warned' ? (
                            <>
                                <button onClick={() => setModal('warn')}
                                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold"
                                    style={{ background: 'rgba(226,183,100,0.1)', border: '1px solid rgba(226,183,100,0.25)', color: '#e2b764' }}>
                                    <AlertTriangle size={12} /> Issue Warning
                                </button>
                                <button onClick={() => setModal('temp_block')}
                                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold"
                                    style={{ background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.25)', color: '#f97316' }}>
                                    <Clock size={12} /> Temp Block
                                </button>
                                <button onClick={() => setModal('permanent_block')}
                                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold"
                                    style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444' }}>
                                    <Ban size={12} /> Permanent Block
                                </button>
                            </>
                        ) : (
                            <button onClick={() => setModal('lift')}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold"
                                style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', color: '#22c55e' }}>
                                <ShieldCheck size={12} /> Lift Restriction
                            </button>
                        )}
                    </div>

                    {/* Violation history */}
                    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
                        <p className="text-[10px] font-semibold uppercase tracking-widest mb-3"
                            style={{ color: 'var(--theme-text-muted)', opacity: 0.7 }}>
                            Violation History
                        </p>

                        {loading ? (
                            <div className="flex justify-center py-8">
                                <Loader2 size={22} className="animate-spin" style={{ color: '#e2b764' }} />
                            </div>
                        ) : violations.length === 0 ? (
                            <div className="text-center py-10">
                                <ShieldCheck size={24} className="mx-auto mb-2" style={{ color: '#22c55e', opacity: 0.5 }} />
                                <p className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>No violations on record.</p>
                            </div>
                        ) : violations.map(v => {
                            const vcfg = VIOLATION_LEVEL[v.level] ?? { color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', label: v.level };
                            return (
                                <div key={v.id} className="px-4 py-3 rounded-xl"
                                    style={{
                                        background: v.is_active && !v.is_expired ? vcfg.bg : 'var(--theme-btn-bg)',
                                        border: `1px solid ${v.is_active && !v.is_expired ? vcfg.color + '40' : 'var(--theme-border)'}`,
                                        opacity: !v.is_active || v.is_expired ? 0.6 : 1,
                                    }}>
                                    <div className="flex items-start justify-between gap-2 mb-1">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full"
                                                    style={{ background: vcfg.bg, color: vcfg.color }}>
                                                    {vcfg.label}
                                                </span>
                                                {v.strike_number && (
                                                    <span className="text-[10px]" style={{ color: 'var(--theme-text-muted)' }}>
                                                        Strike #{v.strike_number}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs font-semibold mt-1" style={{ color: 'var(--theme-text-head)' }}>
                                                {v.reason}
                                            </p>
                                        </div>
                                        {(!v.is_active || v.is_expired) && (
                                            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full flex-shrink-0"
                                                style={{ background: 'rgba(148,163,184,0.1)', color: '#94a3b8' }}>
                                                {v.is_expired ? 'Expired' : 'Lifted'}
                                            </span>
                                        )}
                                    </div>
                                    {v.description && (
                                        <p className="text-xs" style={{ color: 'var(--theme-text-2)' }}>{v.description}</p>
                                    )}
                                    <div className="flex items-center justify-between mt-1.5">
                                        <p className="text-[10px]" style={{ color: 'var(--theme-text-muted)' }}>
                                            Issued by {v.issued_by} · {v.created_at}
                                        </p>
                                        {v.expires_at && (
                                            <p className="text-[10px]" style={{ color: '#f97316' }}>
                                                Until {v.expires_at}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <ViolationModal
                open={!!modal}
                user={user}
                action={modal}
                onClose={() => setModal(null)}
                onSuccess={handleSuccess}
            />
        </>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TrustSafety() {
    const [overview, setOverview]   = useState(null);
    const [users, setUsers]         = useState([]);
    const [loading, setLoading]     = useState(true);
    const [selected, setSelected]   = useState(null);

    const load = useCallback(() => {
        setLoading(true);
        Promise.all([
            apiFetch('/admin/api/trust-safety/overview'),
            apiFetch('/admin/api/trust-safety/flagged-users'),
        ]).then(([ov, u]) => {
            setOverview(ov);
            setUsers(u);
        }).finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(); }, []);

    const handleUpdated = (updatedUser) => {
        setUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));
        if (selected?.id === updatedUser.id) setSelected(updatedUser);
        apiFetch('/admin/api/trust-safety/overview').then(setOverview);
    };

    return (
        <AdminLayout title="Trust & Safety">
            <div className="space-y-5">

                {/* KPI Cards */}
                {overview && (
                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                        <KpiCard icon={Shield}      label="Total Violations"    value={overview.total_violations}    color="#e2b764" />
                        <KpiCard icon={AlertTriangle} label="Active Warnings"   value={overview.active_warnings}     color="#e2b764" />
                        <KpiCard icon={Clock}       label="Temp Blocked"        value={overview.temp_blocked}        color="#f97316" />
                        <KpiCard icon={Ban}         label="Permanently Blocked" value={overview.permanently_blocked} color="#ef4444" />
                        <KpiCard icon={TrendingUp}  label="Pending Escalation"  value={overview.pending_escalation}  color="#3b82f6" />
                    </div>
                )}

                {/* Info banner */}
                <div className="flex items-start gap-3 px-4 py-3 rounded-xl"
                    style={{ background: 'rgba(226,183,100,0.06)', border: '1px solid rgba(226,183,100,0.15)' }}>
                    <Shield size={15} style={{ color: '#e2b764', flexShrink: 0, marginTop: 1 }} />
                    <div>
                        <p className="text-xs font-semibold" style={{ color: 'var(--theme-text-head)' }}>
                            3-Tier Violation System
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>
                            <span style={{ color: '#e2b764' }}>Strike 1-2</span> → Warning &nbsp;·&nbsp;
                            <span style={{ color: '#f97316' }}>3 warnings in 6 months</span> → Suggested Temp Block &nbsp;·&nbsp;
                            <span style={{ color: '#ef4444' }}>Severe violations</span> → Permanent Block
                        </p>
                    </div>
                </div>

                {/* Flagged Users */}
                <div className="rounded-2xl glass-card-strong overflow-hidden">
                    <div className="px-4 py-3 border-b flex items-center gap-2"
                        style={{ borderColor: 'var(--theme-border)' }}>
                        <ShieldAlert size={15} style={{ color: '#e2b764' }} />
                        <span className="text-sm font-display font-bold" style={{ color: 'var(--theme-text-head)' }}>
                            Users with Violations
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                            style={{ background: 'rgba(226,183,100,0.1)', color: '#e2b764' }}>
                            {users.length} users
                        </span>
                    </div>

                    {loading ? (
                        <div className="flex justify-center py-16">
                            <Loader2 size={24} className="animate-spin" style={{ color: '#e2b764' }} />
                        </div>
                    ) : users.length === 0 ? (
                        <div className="text-center py-16">
                            <ShieldCheck size={28} className="mx-auto mb-3" style={{ color: '#22c55e', opacity: 0.5 }} />
                            <p className="text-sm font-semibold" style={{ color: 'var(--theme-text-head)' }}>
                                No violations on record
                            </p>
                            <p className="text-xs mt-1" style={{ color: 'var(--theme-text-muted)' }}>
                                All customers are in good standing.
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y" style={{ borderColor: 'var(--theme-border)' }}>
                            {users.map(u => {
                                const lcfg = LEVEL_CONFIG[u.restriction_level] ?? LEVEL_CONFIG.none;
                                const LIcon = lcfg.icon;
                                return (
                                    <div key={u.id}
                                        className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors"
                                        onClick={() => setSelected(u)}
                                        onMouseEnter={e => e.currentTarget.style.background = 'var(--theme-btn-bg)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>

                                        {/* Avatar */}
                                        <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                                            style={{ background: 'linear-gradient(135deg, #b7882a, #e2b764)', color: '#0b1120' }}>
                                            {u.initials}
                                        </div>

                                        {/* Info */}
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm font-semibold truncate" style={{ color: 'var(--theme-text-head)' }}>
                                                    {u.name}
                                                </p>
                                                {u.suggest_temp_block && (
                                                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full flex-shrink-0"
                                                        style={{ background: 'rgba(249,115,22,0.1)', color: '#f97316', border: '1px solid rgba(249,115,22,0.2)' }}>
                                                        Escalation Suggested
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs truncate" style={{ color: 'var(--theme-text-muted)' }}>
                                                {u.email} · {u.strike_count} strike{u.strike_count !== 1 ? 's' : ''}
                                            </p>
                                        </div>

                                        {/* Level badge */}
                                        <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full flex-shrink-0"
                                            style={{ background: lcfg.bg, border: `1px solid ${lcfg.border}`, color: lcfg.color }}>
                                            <LIcon size={10} />
                                            {lcfg.label}
                                        </span>

                                        <ChevronRight size={14} style={{ color: 'var(--theme-text-muted)', flexShrink: 0 }} />
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {selected && (
                <UserDrawer
                    user={selected}
                    onClose={() => setSelected(null)}
                    onUpdated={handleUpdated}
                />
            )}
        </AdminLayout>
    );
}