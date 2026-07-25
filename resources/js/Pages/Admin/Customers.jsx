import { useState, useEffect, useCallback } from 'react';
import {
    Search, Users, UserX, UserCheck, ShieldAlert,
    ChevronLeft, ChevronRight, X, Loader2, Calendar,
    DollarSign, BookOpen, AlertTriangle, CheckCircle2,
    TrendingUp, Ban, Phone, Mail,
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

function formatCurrency(value) {
    return new Intl.NumberFormat('en-AE', {
        style: 'currency', currency: 'AED',
        minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(value || 0);
}

// ── Status badge ──────────────────────────────────────────────────────────────
const STATUS_COLORS = {
    completed: { color: '#22c55e', bg: 'rgba(34,197,94,0.1)',   label: 'Completed' },
    accepted:  { color: '#3b82f6', bg: 'rgba(59,130,246,0.1)',  label: 'Accepted'  },
    pending:   { color: '#e2b764', bg: 'rgba(226,183,100,0.1)', label: 'Pending'   },
    cancelled: { color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', label: 'Cancelled' },
    rejected:  { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   label: 'Rejected'  },
};

function StatusBadge({ status }) {
    const cfg = STATUS_COLORS[status] ?? { color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', label: status };
    return (
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize"
            style={{ background: cfg.bg, color: cfg.color }}>
            {cfg.label}
        </span>
    );
}

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

// ── Block Modal ───────────────────────────────────────────────────────────────
function BlockModal({ open, customer, onClose, onBlocked }) {
    const [reason, setReason] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => { if (open) setReason(''); }, [open]);

    if (!open) return null;

    const handleBlock = async () => {
        if (!reason.trim()) return;
        setLoading(true);
        const res = await apiFetch(`/admin/api/customers/${customer.id}/block`, {
            method: 'POST',
            body: JSON.stringify({ reason }),
        });
        onBlocked(res.customer);
        setLoading(false);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <button className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose} />
            <div className="relative w-full max-w-sm rounded-2xl p-5"
                style={{ background: 'var(--theme-notif-bg)', border: '1px solid var(--theme-border)' }}>
                <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-3"
                    style={{ background: 'rgba(239,68,68,0.1)' }}>
                    <Ban size={20} style={{ color: '#ef4444' }} />
                </div>
                <h3 className="text-sm font-display font-bold mb-1" style={{ color: 'var(--theme-text-head)' }}>
                    Block {customer?.name}?
                </h3>
                <p className="text-xs mb-4" style={{ color: 'var(--theme-text-muted)' }}>
                    This customer will not be able to log in or make bookings. You can unblock them anytime.
                </p>
                <textarea
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="Reason for blocking..."
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none mb-4"
                    style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-head)' }}
                />
                <div className="flex gap-3">
                    <button onClick={onClose}
                        className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold"
                        style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-2)' }}>
                        Cancel
                    </button>
                    <button onClick={handleBlock} disabled={loading || !reason.trim()}
                        className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                        style={{ background: '#ef4444', color: 'white' }}>
                        {loading && <Loader2 size={14} className="animate-spin" />}
                        Block Customer
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Customer Drawer ───────────────────────────────────────────────────────────
function CustomerDrawer({ customer, onClose, onUpdated }) {
    const [tab, setTab]         = useState('bookings');
    const [bookings, setBookings] = useState([]);
    const [reports, setReports]   = useState([]);
    const [loading, setLoading]   = useState(false);
    const [blockOpen, setBlockOpen] = useState(false);
    const [unblocking, setUnblocking] = useState(false);

    useEffect(() => {
        if (!customer) return;
        setTab('bookings');
        setLoading(true);
        Promise.all([
            apiFetch(`/admin/api/customers/${customer.id}/bookings`),
            apiFetch(`/admin/api/customers/${customer.id}/reports`),
        ]).then(([b, r]) => {
            setBookings(b);
            setReports(r);
        }).finally(() => setLoading(false));
    }, [customer]);

    if (!customer) return null;

    const handleUnblock = async () => {
        setUnblocking(true);
        const res = await apiFetch(`/admin/api/customers/${customer.id}/unblock`, { method: 'POST' });
        onUpdated(res.customer);
        setUnblocking(false);
    };

    const handleReportAction = async (report, status) => {
        await apiFetch(`/admin/api/customers/${customer.id}/reports/${report.id}/review`, {
            method: 'POST',
            body: JSON.stringify({ status }),
        });
        setReports(prev => prev.map(r => r.id === report.id ? { ...r, status } : r));
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
                            {/* Avatar */}
                            <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0">
                                {customer.avatar
                                    ? <img src={customer.avatar} alt={customer.name} className="w-full h-full object-cover" />
                                    : <div className="w-full h-full flex items-center justify-center text-sm font-bold"
                                        style={{ background: customer.is_blocked ? 'rgba(239,68,68,0.15)' : 'linear-gradient(135deg, #b7882a, #e2b764)', color: customer.is_blocked ? '#ef4444' : '#0b1120' }}>
                                        {customer.initials}
                                      </div>
                                }
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h2 className="text-sm font-display font-bold" style={{ color: 'var(--theme-text-head)' }}>
                                        {customer.name}
                                    </h2>
                                    {customer.is_blocked && (
                                        <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full"
                                            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
                                            Blocked
                                        </span>
                                    )}
                                    {customer.pending_reports > 0 && (
                                        <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full"
                                            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
                                            {customer.pending_reports} report{customer.pending_reports > 1 ? 's' : ''}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-3 mt-0.5">
                                    <span className="text-xs flex items-center gap-1" style={{ color: 'var(--theme-text-muted)' }}>
                                        <Mail size={10} /> {customer.email}
                                    </span>
                                    {customer.phone && (
                                        <span className="text-xs flex items-center gap-1" style={{ color: 'var(--theme-text-muted)' }}>
                                            <Phone size={10} /> {customer.phone}
                                        </span>
                                    )}
                                </div>
                                <p className="text-[10px] mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>
                                    Member since {customer.member_since}
                                </p>
                            </div>
                        </div>
                        <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)' }}>
                            <X size={15} style={{ color: 'var(--theme-text-2)' }} />
                        </button>
                    </div>

                    {/* Stats row */}
                    <div className="grid grid-cols-3 gap-3 px-5 py-3 border-b" style={{ borderColor: 'var(--theme-border)' }}>
                        {[
                            { icon: BookOpen,    label: 'Bookings',  value: customer.total_bookings },
                            { icon: CheckCircle2,label: 'Completed', value: customer.completed_bookings },
                            { icon: DollarSign,  label: 'Total Spent', value: formatCurrency(customer.total_spent) },
                        ].map(({ icon: Icon, label, value }) => (
                            <div key={label} className="flex flex-col items-center gap-0.5 py-2 rounded-xl"
                                style={{ background: 'var(--theme-btn-bg)' }}>
                                <Icon size={14} style={{ color: '#e2b764' }} />
                                <span className="text-sm font-bold" style={{ color: 'var(--theme-text-head)' }}>{value}</span>
                                <span className="text-[10px]" style={{ color: 'var(--theme-text-muted)' }}>{label}</span>
                            </div>
                        ))}
                    </div>

                    {/* Block info banner */}
                    {customer.is_blocked && (
                        <div className="mx-4 mt-3 px-4 py-3 rounded-xl flex items-start gap-3"
                            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                            <Ban size={15} style={{ color: '#ef4444', flexShrink: 0, marginTop: 1 }} />
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold" style={{ color: '#ef4444' }}>
                                    Blocked on {customer.blocked_at}
                                </p>
                                <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--theme-text-muted)' }}>
                                    {customer.block_reason}
                                </p>
                            </div>
                            <button onClick={handleUnblock} disabled={unblocking}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0 disabled:opacity-60"
                                style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', color: '#22c55e' }}>
                                {unblocking ? <Loader2 size={11} className="animate-spin" /> : <UserCheck size={11} />}
                                Unblock
                            </button>
                        </div>
                    )}

                    {/* Action buttons */}
                    {!customer.is_blocked && (
                        <div className="px-4 pt-3">
                            <button onClick={() => setBlockOpen(true)}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold w-full justify-center"
                                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
                                <Ban size={13} /> Block Account
                            </button>
                        </div>
                    )}

                    {/* Tabs */}
                    <div className="flex gap-1 px-4 pt-4 pb-2">
                        {['bookings', 'reports'].map(t => (
                            <button key={t} onClick={() => setTab(t)}
                                className="px-4 py-2 rounded-xl text-xs font-semibold capitalize flex items-center gap-1.5"
                                style={{
                                    background: tab === t ? 'var(--theme-btn-bg)' : 'transparent',
                                    border: `1px solid ${tab === t ? 'var(--theme-border)' : 'transparent'}`,
                                    color: tab === t ? 'var(--theme-text-head)' : 'var(--theme-text-muted)',
                                }}>
                                {t === 'reports' && reports.filter(r => r.status === 'pending').length > 0 && (
                                    <span className="w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center"
                                        style={{ background: '#ef4444', color: 'white' }}>
                                        {reports.filter(r => r.status === 'pending').length}
                                    </span>
                                )}
                                {t}
                            </button>
                        ))}
                    </div>

                    {/* Tab content */}
                    <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
                        {loading ? (
                            <div className="flex justify-center py-12">
                                <Loader2 size={22} className="animate-spin" style={{ color: '#e2b764' }} />
                            </div>
                        ) : tab === 'bookings' ? (
                            bookings.length === 0 ? (
                                <div className="text-center py-12">
                                    <BookOpen size={24} className="mx-auto mb-2" style={{ color: 'var(--theme-text-muted)', opacity: 0.3 }} />
                                    <p className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>No bookings yet.</p>
                                </div>
                            ) : bookings.map(b => (
                                <div key={b.id} className="px-4 py-3 rounded-xl"
                                    style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)' }}>
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="text-xs font-semibold" style={{ color: 'var(--theme-text-head)' }}>
                                                {b.ref} — {b.service_name}
                                            </p>
                                            <p className="text-[10px] mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>
                                                {b.therapist_name} · {b.zone_name}
                                            </p>
                                            <p className="text-[10px]" style={{ color: 'var(--theme-text-muted)' }}>
                                                {b.scheduled_start ?? b.created_at}
                                            </p>
                                        </div>
                                        <StatusBadge status={b.status} />
                                    </div>
                                </div>
                            ))
                        ) : (
                            reports.length === 0 ? (
                                <div className="text-center py-12">
                                    <ShieldAlert size={24} className="mx-auto mb-2" style={{ color: 'var(--theme-text-muted)', opacity: 0.3 }} />
                                    <p className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>No reports filed against this customer.</p>
                                </div>
                            ) : reports.map(r => (
                                <div key={r.id} className="px-4 py-3 rounded-xl"
                                    style={{
                                        background: r.status === 'pending' ? 'rgba(239,68,68,0.04)' : 'var(--theme-btn-bg)',
                                        border: `1px solid ${r.status === 'pending' ? 'rgba(239,68,68,0.2)' : 'var(--theme-border)'}`,
                                    }}>
                                    <div className="flex items-start justify-between gap-2 mb-2">
                                        <div>
                                            <p className="text-xs font-semibold" style={{ color: 'var(--theme-text-head)' }}>
                                                {r.reason}
                                            </p>
                                            <p className="text-[10px]" style={{ color: 'var(--theme-text-muted)' }}>
                                                Filed by {r.reporter_name} ({r.reporter_type}) · {r.created_at}
                                            </p>
                                        </div>
                                        <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full flex-shrink-0"
                                            style={{
                                                background: r.status === 'pending' ? 'rgba(239,68,68,0.1)' : r.status === 'reviewed' ? 'rgba(34,197,94,0.1)' : 'rgba(148,163,184,0.1)',
                                                color: r.status === 'pending' ? '#ef4444' : r.status === 'reviewed' ? '#22c55e' : '#94a3b8',
                                            }}>
                                            {r.status}
                                        </span>
                                    </div>
                                    {r.description && (
                                        <p className="text-xs mb-2 leading-relaxed" style={{ color: 'var(--theme-text-2)' }}>
                                            {r.description}
                                        </p>
                                    )}
                                    {r.status === 'pending' && (
                                        <div className="flex gap-2 mt-2">
                                            <button onClick={() => handleReportAction(r, 'reviewed')}
                                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold"
                                                style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', color: '#22c55e' }}>
                                                <CheckCircle2 size={10} /> Mark Reviewed
                                            </button>
                                            <button onClick={() => handleReportAction(r, 'dismissed')}
                                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold"
                                                style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-muted)' }}>
                                                Dismiss
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            <BlockModal
                open={blockOpen}
                customer={customer}
                onClose={() => setBlockOpen(false)}
                onBlocked={(updated) => { onUpdated(updated); setBlockOpen(false); }}
            />
        </>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Customers() {
    const [stats, setStats]       = useState(null);
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading]   = useState(true);
    const [search, setSearch]     = useState('');
    const [status, setStatus]     = useState('');
    const [page, setPage]         = useState(1);
    const [lastPage, setLastPage] = useState(1);
    const [total, setTotal]       = useState(0);
    const [selected, setSelected] = useState(null);

    const load = useCallback((p = 1) => {
        setLoading(true);
        const params = new URLSearchParams({ page: p });
        if (search) params.set('search', search);
        if (status) params.set('status', status);

        Promise.all([
            apiFetch(`/admin/api/customers?${params}`),
            apiFetch('/admin/api/customers/stats'),
        ]).then(([res, st]) => {
            setCustomers(res.data);
            setTotal(res.total);
            setLastPage(res.last_page);
            setPage(res.current_page);
            setStats(st);
        }).finally(() => setLoading(false));
    }, [search, status]);

    useEffect(() => { load(1); }, [search, status]);

    const handleUpdated = (updated) => {
        setCustomers(prev => prev.map(c => c.id === updated.id ? updated : c));
        if (selected?.id === updated.id) setSelected(updated);
        apiFetch('/admin/api/customers/stats').then(setStats);
    };

    return (
        <AdminLayout title="Customers">
            <div className="space-y-5">

                {/* KPI Cards */}
                {stats && (
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <KpiCard icon={Users}        label="Total Customers"  value={stats.total}          color="#3b82f6" />
                        <KpiCard icon={UserCheck}    label="Active"           value={stats.active}         color="#22c55e" />
                        <KpiCard icon={UserX}        label="Blocked"          value={stats.blocked}        color="#ef4444" />
                        <KpiCard icon={TrendingUp}   label="New This Month"   value={stats.new_this_month} color="#e2b764" />
                    </div>
                )}

                {/* Filters */}
                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--theme-text-muted)' }} />
                        <input type="text" placeholder="Search by name, email or phone..."
                            value={search} onChange={e => setSearch(e.target.value)}
                            className="w-full pl-8 pr-3 py-2.5 rounded-xl text-sm outline-none"
                            style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-head)' }}
                        />
                    </div>
                    <select value={status} onChange={e => setStatus(e.target.value)}
                        className="px-3 py-2.5 rounded-xl text-sm outline-none"
                        style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-2)' }}>
                        <option value="">All Status</option>
                        <option value="active">Active</option>
                        <option value="blocked">Blocked</option>
                    </select>
                </div>

                {/* Table */}
                <div className="rounded-2xl glass-card-strong overflow-hidden">
                    <div className="px-4 py-3 border-b flex items-center justify-between"
                        style={{ borderColor: 'var(--theme-border)' }}>
                        <div className="flex items-center gap-2">
                            <Users size={15} style={{ color: '#e2b764' }} />
                            <span className="text-sm font-display font-bold" style={{ color: 'var(--theme-text-head)' }}>
                                Customer Accounts
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                                style={{ background: 'rgba(226,183,100,0.1)', color: '#e2b764' }}>
                                {total} total
                            </span>
                        </div>
                    </div>

                    {loading ? (
                        <div className="flex justify-center py-16">
                            <Loader2 size={24} className="animate-spin" style={{ color: '#e2b764' }} />
                        </div>
                    ) : customers.length === 0 ? (
                        <div className="text-center py-16">
                            <Users size={28} className="mx-auto mb-3" style={{ color: 'var(--theme-text-muted)', opacity: 0.3 }} />
                            <p className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>No customers found.</p>
                        </div>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--theme-border)' }}>
                                            {['Customer', 'Contact', 'Bookings', 'Total Spent', 'Status', ''].map(h => (
                                                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest"
                                                    style={{ color: 'var(--theme-text-muted)', background: 'var(--theme-btn-bg)' }}>
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {customers.map(c => (
                                            <tr key={c.id} className="border-b transition-colors cursor-pointer"
                                                style={{ borderColor: 'var(--theme-border)' }}
                                                onClick={() => setSelected(c)}
                                                onMouseEnter={e => e.currentTarget.style.background = 'var(--theme-btn-bg)'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>

                                                {/* Customer */}
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2.5">
                                                        <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
                                                            {c.avatar
                                                                ? <img src={c.avatar} alt={c.name} className="w-full h-full object-cover" />
                                                                : <div className="w-full h-full flex items-center justify-center text-xs font-bold"
                                                                    style={{ background: c.is_blocked ? 'rgba(239,68,68,0.15)' : 'linear-gradient(135deg, #b7882a, #e2b764)', color: c.is_blocked ? '#ef4444' : '#0b1120' }}>
                                                                    {c.initials}
                                                                  </div>
                                                            }
                                                        </div>
                                                        <div>
                                                            <p className="text-xs font-semibold" style={{ color: 'var(--theme-text-head)' }}>{c.name}</p>
                                                            <p className="text-[10px]" style={{ color: 'var(--theme-text-muted)' }}>Since {c.member_since}</p>
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* Contact */}
                                                <td className="px-4 py-3">
                                                    <p className="text-xs" style={{ color: 'var(--theme-text-2)' }}>{c.email}</p>
                                                    {c.phone && <p className="text-[10px]" style={{ color: 'var(--theme-text-muted)' }}>{c.phone}</p>}
                                                </td>

                                                {/* Bookings */}
                                                <td className="px-4 py-3 text-xs" style={{ color: 'var(--theme-text-2)' }}>
                                                    {c.total_bookings} total
                                                    <span className="ml-1" style={{ color: '#22c55e' }}>({c.completed_bookings} done)</span>
                                                </td>

                                                {/* Spent */}
                                                <td className="px-4 py-3 text-xs font-semibold" style={{ color: 'var(--theme-text-head)' }}>
                                                    {formatCurrency(c.total_spent)}
                                                </td>

                                                {/* Status */}
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                                                            style={{
                                                                background: c.is_blocked ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                                                                color: c.is_blocked ? '#ef4444' : '#22c55e',
                                                            }}>
                                                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.is_blocked ? '#ef4444' : '#22c55e' }} />
                                                            {c.is_blocked ? 'Blocked' : 'Active'}
                                                        </span>
                                                        {c.pending_reports > 0 && (
                                                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                                                                style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                                                                {c.pending_reports} report{c.pending_reports > 1 ? 's' : ''}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>

                                                {/* Arrow */}
                                                <td className="px-4 py-3 text-right">
                                                    <ChevronRight size={14} style={{ color: 'var(--theme-text-muted)' }} />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination */}
                            {lastPage > 1 && (
                                <div className="flex items-center justify-between px-4 py-3 border-t"
                                    style={{ borderColor: 'var(--theme-border)' }}>
                                    <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>
                                        Page {page} of {lastPage} · {total} customers
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
                        </>
                    )}
                </div>
            </div>

            {/* Customer Detail Drawer */}
            {selected && (
                <CustomerDrawer
                    customer={selected}
                    onClose={() => setSelected(null)}
                    onUpdated={handleUpdated}
                />
            )}
        </AdminLayout>
    );
}