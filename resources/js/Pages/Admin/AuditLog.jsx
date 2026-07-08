import { useState, useEffect, useCallback } from 'react';
import {
    Shield, Search, Filter, RefreshCw, Loader2,
    LogIn, LogOut, AlertTriangle, Wrench, Users,
    Package, ChevronLeft, ChevronRight, Activity,
} from 'lucide-react';
import AdminLayout from '@/Layouts/AdminLayout';

// ── API helper ────────────────────────────────────────────────────────────────
function getCsrf() {
    const cookie = document.cookie.split('; ').find(r => r.startsWith('XSRF-TOKEN='));
    return cookie ? decodeURIComponent(cookie.split('=')[1]) : '';
}

async function apiFetch(url) {
    const res = await fetch(url, {
        credentials: 'same-origin',
        headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-XSRF-TOKEN': getCsrf() },
    });
    return res.json();
}

// ── Event config — icon, color, label per event type ─────────────────────────
const EVENT_CONFIG = {
    'auth.login':                   { icon: LogIn,         color: '#22c55e', bg: 'rgba(34,197,94,0.1)',      label: 'Login' },
    'auth.logout':                  { icon: LogOut,        color: '#94a3b8', bg: 'rgba(148,163,184,0.1)',    label: 'Logout' },
    'auth.login_failed':            { icon: AlertTriangle, color: '#ef4444', bg: 'rgba(239,68,68,0.1)',      label: 'Login Failed' },
    'auth.otp_verified':            { icon: Shield,        color: '#3b82f6', bg: 'rgba(59,130,246,0.1)',     label: 'OTP Verified' },
    'auth.google_login':            { icon: LogIn,         color: '#22c55e', bg: 'rgba(34,197,94,0.1)',      label: 'Google Login' },
    'booking.accepted':             { icon: Activity,      color: '#22c55e', bg: 'rgba(34,197,94,0.1)',      label: 'Booking Accepted' },
    'booking.rejected':             { icon: Activity,      color: '#ef4444', bg: 'rgba(239,68,68,0.1)',      label: 'Booking Rejected' },
    'booking.cancelled':            { icon: Activity,      color: '#f97316', bg: 'rgba(249,115,22,0.1)',     label: 'Booking Cancelled' },
    'booking.completed':            { icon: Activity,      color: '#22c55e', bg: 'rgba(34,197,94,0.1)',      label: 'Booking Completed' },
    'booking.downpayment_verified': { icon: Activity,      color: '#e2b764', bg: 'rgba(226,183,100,0.1)',    label: 'Downpayment Verified' },
    'booking.refund_sent':          { icon: Activity,      color: '#3b82f6', bg: 'rgba(59,130,246,0.1)',     label: 'Refund Sent' },
    'service.created':              { icon: Package,       color: '#22c55e', bg: 'rgba(34,197,94,0.1)',      label: 'Service Created' },
    'service.updated':              { icon: Package,       color: '#e2b764', bg: 'rgba(226,183,100,0.1)',    label: 'Service Updated' },
    'service.archived':             { icon: Package,       color: '#94a3b8', bg: 'rgba(148,163,184,0.1)',    label: 'Service Archived' },
    'service.restored':             { icon: Package,       color: '#22c55e', bg: 'rgba(34,197,94,0.1)',      label: 'Service Restored' },
    'service.toggled':              { icon: Package,       color: '#e2b764', bg: 'rgba(226,183,100,0.1)',    label: 'Service Toggled' },
    'therapist.approved':           { icon: Users,         color: '#22c55e', bg: 'rgba(34,197,94,0.1)',      label: 'Therapist Approved' },
    'therapist.deactivated':        { icon: Users,         color: '#f97316', bg: 'rgba(249,115,22,0.1)',     label: 'Therapist Deactivated' },
    'therapist.rejected':           { icon: Users,         color: '#ef4444', bg: 'rgba(239,68,68,0.1)',      label: 'Therapist Rejected' },
    'customer.booking_created':     { icon: Activity,      color: '#3b82f6', bg: 'rgba(59,130,246,0.1)',     label: 'Customer Booked' },
    'customer.booking_cancelled':   { icon: Activity,      color: '#f97316', bg: 'rgba(249,115,22,0.1)',     label: 'Customer Cancelled' },
    'customer.downpayment_uploaded':{ icon: Activity,      color: '#e2b764', bg: 'rgba(226,183,100,0.1)',    label: 'Downpayment Uploaded' },
    'customer.review_submitted':    { icon: Activity,      color: '#22c55e', bg: 'rgba(34,197,94,0.1)',      label: 'Review Submitted' },
    'customer.profile_updated':     { icon: Users,         color: '#94a3b8', bg: 'rgba(148,163,184,0.1)',    label: 'Profile Updated' },
};

const EVENT_GROUPS = [
    { label: 'All Events', value: '' },
    { label: 'Auth', value: 'auth' },
    { label: 'Bookings', value: 'booking' },
    { label: 'Services', value: 'service' },
    { label: 'Therapists', value: 'therapist' },
    { label: 'Customers', value: 'customer' },
];

const ROLES = [
    { label: 'All Roles', value: '' },
    { label: 'Admin', value: 'admin' },
    { label: 'Therapist', value: 'therapist' },
    { label: 'Customer', value: 'customer' },
];

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

// ── Log Row ───────────────────────────────────────────────────────────────────
function LogRow({ log }) {
    const cfg = EVENT_CONFIG[log.event] ?? {
        icon: Wrench, color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', label: log.event,
    };
    const Icon = cfg.icon;
    const [expanded, setExpanded] = useState(false);
    const hasMetadata = log.metadata && Object.keys(log.metadata).length > 0;

    return (
        <>
            <tr
                className="border-b transition-colors cursor-pointer"
                style={{ borderColor: 'var(--theme-border)' }}
                onClick={() => hasMetadata && setExpanded(e => !e)}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--theme-btn-bg)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
                {/* Event */}
                <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ background: cfg.bg }}>
                            <Icon size={13} style={{ color: cfg.color }} />
                        </div>
                        <span className="text-xs font-medium" style={{ color: 'var(--theme-text-head)' }}>
                            {cfg.label}
                        </span>
                    </div>
                </td>

                {/* User */}
                <td className="px-4 py-3">
                    <div className="text-xs" style={{ color: 'var(--theme-text-head)' }}>{log.user_name}</div>
                    <div className="text-[10px] mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>
                        {log.user_role !== '—' ? (
                            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wide"
                                style={{
                                    background: log.user_role === 'admin' ? 'rgba(226,183,100,0.1)' : 'rgba(148,163,184,0.1)',
                                    color: log.user_role === 'admin' ? '#e2b764' : '#94a3b8',
                                }}>
                                {log.user_role}
                            </span>
                        ) : '—'}
                    </div>
                </td>

                {/* Target */}
                <td className="px-4 py-3 text-xs" style={{ color: 'var(--theme-text-2)' }}>
                    {log.target_type && log.target_id
                        ? <span>{log.target_type} <span style={{ color: '#e2b764' }}>#{log.target_id}</span></span>
                        : <span style={{ color: 'var(--theme-text-muted)' }}>—</span>
                    }
                </td>

                {/* IP */}
                <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--theme-text-muted)' }}>
                    {log.ip_address}
                </td>

                {/* Time */}
                <td className="px-4 py-3 text-right">
                    <div className="text-xs" style={{ color: 'var(--theme-text-2)' }}>{log.time_ago}</div>
                    <div className="text-[10px] mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>{log.created_at}</div>
                </td>
            </tr>

            {/* Expanded metadata row */}
            {expanded && hasMetadata && (
                <tr style={{ background: 'var(--theme-btn-bg)' }}>
                    <td colSpan={5} className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                            {Object.entries(log.metadata).map(([key, val]) => (
                                <div key={key} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
                                    style={{ background: 'var(--theme-bg)', border: '1px solid var(--theme-border)' }}>
                                    <span className="text-[10px] font-semibold uppercase tracking-wide"
                                        style={{ color: 'var(--theme-text-muted)' }}>{key}</span>
                                    <span className="text-xs" style={{ color: 'var(--theme-text-head)' }}>
                                        {typeof val === 'boolean' ? (val ? 'Yes' : 'No') : String(val ?? '—')}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AuditLog() {
    const [logs, setLogs]       = useState([]);
    const [stats, setStats]     = useState(null);
    const [loading, setLoading] = useState(true);
    const [page, setPage]       = useState(1);
    const [lastPage, setLastPage] = useState(1);
    const [total, setTotal]     = useState(0);

    const [search, setSearch]   = useState('');
    const [eventGroup, setEventGroup] = useState('');
    const [role, setRole]       = useState('');
    const [from, setFrom]       = useState('');
    const [to, setTo]           = useState('');

    const buildUrl = useCallback((p = 1) => {
        const params = new URLSearchParams({ page: p });
        if (search)     params.set('search', search);
        if (eventGroup) params.set('event', eventGroup);
        if (role)       params.set('role', role);
        if (from)       params.set('from', from);
        if (to)         params.set('to', to);
        return `/admin/api/audit-logs?${params}`;
    }, [search, eventGroup, role, from, to]);

    const load = useCallback((p = 1) => {
        setLoading(true);
        apiFetch(buildUrl(p))
            .then(res => {
                setLogs(res.data);
                setTotal(res.total);
                setLastPage(res.last_page);
                setPage(res.current_page);
            })
            .finally(() => setLoading(false));
    }, [buildUrl]);

    useEffect(() => {
        apiFetch('/admin/api/audit-logs/stats').then(setStats);
    }, []);

    useEffect(() => { load(1); }, [search, eventGroup, role, from, to]);

    return (
        <AdminLayout title="Audit Log">
            <div className="space-y-5">

                {/* KPI Cards */}
                {stats && (
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <KpiCard icon={Activity}      label="Total Events"    value={stats.total}         color="#e2b764" />
                        <KpiCard icon={Shield}        label="Events Today"    value={stats.today}         color="#3b82f6" />
                        <KpiCard icon={AlertTriangle} label="Failed Logins"   value={stats.failed_logins} color="#ef4444" />
                        <KpiCard icon={Wrench}        label="Admin Actions"   value={stats.admin_actions} color="#22c55e" />
                    </div>
                )}

                {/* Filters */}
                <div className="rounded-2xl p-4 glass-card-strong flex flex-wrap items-center gap-3">
                    <div className="relative flex-1 min-w-48">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--theme-text-muted)' }} />
                        <input type="text" placeholder="Search user, event, IP..."
                            value={search} onChange={e => setSearch(e.target.value)}
                            className="w-full pl-8 pr-3 py-2 rounded-xl text-sm outline-none"
                            style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-head)' }}
                        />
                    </div>

                    {/* Event group filter */}
                    <select value={eventGroup} onChange={e => setEventGroup(e.target.value)}
                        className="px-3 py-2 rounded-xl text-sm outline-none"
                        style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-2)' }}>
                        {EVENT_GROUPS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                    </select>

                    {/* Role filter */}
                    <select value={role} onChange={e => setRole(e.target.value)}
                        className="px-3 py-2 rounded-xl text-sm outline-none"
                        style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-2)' }}>
                        {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>

                    {/* Date range */}
                    <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                        className="px-3 py-2 rounded-xl text-sm outline-none"
                        style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-2)' }}
                    />
                    <input type="date" value={to} onChange={e => setTo(e.target.value)}
                        className="px-3 py-2 rounded-xl text-sm outline-none"
                        style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-2)' }}
                    />

                    <button onClick={() => load(page)}
                        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)' }}>
                        <RefreshCw size={14} style={{ color: 'var(--theme-text-2)' }} />
                    </button>
                </div>

                {/* Table */}
                <div className="rounded-2xl glass-card-strong overflow-hidden">
                    <div className="px-4 py-3 border-b flex items-center justify-between"
                        style={{ borderColor: 'var(--theme-border)' }}>
                        <div className="flex items-center gap-2">
                            <Shield size={15} style={{ color: '#e2b764' }} />
                            <span className="text-sm font-display font-bold" style={{ color: 'var(--theme-text-head)' }}>
                                Activity Log
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                                style={{ background: 'rgba(226,183,100,0.1)', color: '#e2b764' }}>
                                {total.toLocaleString()} entries
                            </span>
                        </div>
                        <p className="text-[10px]" style={{ color: 'var(--theme-text-muted)' }}>
                            Click a row to see details
                        </p>
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center py-16">
                            <Loader2 size={24} className="animate-spin" style={{ color: '#e2b764' }} />
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="text-center py-16">
                            <Shield size={28} className="mx-auto mb-3" style={{ color: 'var(--theme-text-muted)', opacity: 0.3 }} />
                            <p className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>No audit logs found.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--theme-border)' }}>
                                        {['Event', 'User', 'Target', 'IP Address', 'Time'].map(h => (
                                            <th key={h} className={`px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest ${h === 'Time' ? 'text-right' : 'text-left'}`}
                                                style={{ color: 'var(--theme-text-muted)', background: 'var(--theme-btn-bg)' }}>
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {logs.map(log => <LogRow key={log.id} log={log} />)}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Pagination */}
                    {lastPage > 1 && (
                        <div className="flex items-center justify-between px-4 py-3 border-t"
                            style={{ borderColor: 'var(--theme-border)' }}>
                            <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>
                                Page {page} of {lastPage}
                            </p>
                            <div className="flex gap-2">
                                <button onClick={() => load(page - 1)} disabled={page <= 1}
                                    className="w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-40"
                                    style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)' }}>
                                    <ChevronLeft size={14} style={{ color: 'var(--theme-text-2)' }} />
                                </button>
                                <button onClick={() => load(page + 1)} disabled={page >= lastPage}
                                    className="w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-40"
                                    style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)' }}>
                                    <ChevronRight size={14} style={{ color: 'var(--theme-text-2)' }} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </AdminLayout>
    );
}