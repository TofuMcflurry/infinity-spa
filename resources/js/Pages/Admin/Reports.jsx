import { useState, useEffect } from 'react';
import {
    TrendingUp, TrendingDown, DollarSign, Calendar,
    Users, CheckCircle2, XCircle, Clock,
} from 'lucide-react';
import {
    LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import AdminLayout from '@/Layouts/AdminLayout';

// ── API helper ────────────────────────────────────────────────────────────────
async function apiFetch(url) {
    const res = await fetch(url, {
        headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'same-origin',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

const STATUS_COLORS = {
    completed: '#22c55e',
    accepted:  '#3b82f6',
    pending:   '#e2b764',
    cancelled: '#94a3b8',
    rejected:  '#ef4444',
};

const STATUS_LABELS = {
    completed: 'Completed',
    accepted:  'Accepted',
    pending:   'Pending',
    cancelled: 'Cancelled',
    rejected:  'Rejected',
};

function formatCurrency(value) {
    return new Intl.NumberFormat('en-AE', {
        style: 'currency',
        currency: 'AED',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(value || 0);
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sublabel, trend }) {
    return (
        <div className="rounded-2xl p-5 glass-card-strong">
            <div className="flex items-start justify-between mb-3">
                <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)' }}
                >
                    <Icon size={18} style={{ color: '#e2b764' }} />
                </div>
                {trend !== undefined && trend !== null && (
                    <div
                        className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full"
                        style={{
                            background: trend >= 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                            color: trend >= 0 ? '#22c55e' : '#ef4444',
                        }}
                    >
                        {trend >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                        {Math.abs(trend)}%
                    </div>
                )}
            </div>
            <div className="text-2xl font-display font-bold" style={{ color: 'var(--theme-text-head)' }}>
                {value}
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--theme-text-muted)' }}>
                {label}
            </div>
            {sublabel && (
                <div className="text-[10px] mt-0.5" style={{ color: 'var(--theme-text-muted)', opacity: 0.7 }}>
                    {sublabel}
                </div>
            )}
        </div>
    );
}

// ── Chart Card wrapper ───────────────────────────────────────────────────────
function ChartCard({ title, subtitle, children, className = '' }) {
    return (
        <div className={`rounded-2xl p-5 glass-card-strong ${className}`}>
            <div className="mb-4">
                <h3 className="text-sm font-display font-bold" style={{ color: 'var(--theme-text-head)' }}>
                    {title}
                </h3>
                {subtitle && (
                    <p className="text-xs mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>
                        {subtitle}
                    </p>
                )}
            </div>
            {children}
        </div>
    );
}

// ── Custom tooltip ────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null;
    return (
        <div
            className="rounded-xl px-3 py-2 text-xs shadow-xl"
            style={{ background: 'var(--theme-notif-bg)', border: '1px solid var(--theme-border)' }}
        >
            <p className="font-semibold mb-1" style={{ color: 'var(--theme-text-head)' }}>{label}</p>
            {payload.map((p, i) => (
                <p key={i} style={{ color: p.color }}>
                    {p.name}: {p.dataKey === 'revenue' ? formatCurrency(p.value) : p.value}
                </p>
            ))}
        </div>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Reports() {
    const [loading, setLoading]           = useState(true);
    const [overview, setOverview]         = useState(null);
    const [revenueTrend, setRevenueTrend] = useState([]);
    const [topServices, setTopServices]   = useState([]);
    const [topTherapists, setTopTherapists] = useState([]);
    const [statusBreakdown, setStatusBreakdown] = useState([]);
    const [bookingsByZone, setBookingsByZone]   = useState([]);

    useEffect(() => {
        Promise.all([
            apiFetch('/admin/api/reports/overview'),
            apiFetch('/admin/api/reports/revenue-trend?months=6'),
            apiFetch('/admin/api/reports/top-services?limit=5'),
            apiFetch('/admin/api/reports/top-therapists?limit=5'),
            apiFetch('/admin/api/reports/status-breakdown'),
            apiFetch('/admin/api/reports/bookings-by-zone'),
        ])
            .then(([ov, trend, services, therapists, status, zones]) => {
                setOverview(ov);
                setRevenueTrend(trend);
                setTopServices(services);
                setTopTherapists(therapists);
                setStatusBreakdown(status.map(s => ({
                    ...s,
                    label: STATUS_LABELS[s.status] ?? s.status,
                    color: STATUS_COLORS[s.status] ?? '#94a3b8',
                })));
                setBookingsByZone(zones);
            })
            .catch(err => console.error('Failed to load reports:', err))
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <AdminLayout title="Reports">
                <div className="flex items-center justify-center py-24">
                    <div
                        className="w-8 h-8 rounded-full border-2 animate-spin"
                        style={{ borderColor: 'var(--theme-border)', borderTopColor: '#e2b764' }}
                    />
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout title="Reports">
            <div className="space-y-6">

                {/* ── KPI Cards ── */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <KpiCard
                        icon={DollarSign}
                        label="Total Revenue"
                        value={formatCurrency(overview?.total_revenue)}
                        sublabel={`${formatCurrency(overview?.this_month_revenue)} this month`}
                        trend={overview?.revenue_change_pct}
                    />
                    <KpiCard
                        icon={Calendar}
                        label="Total Bookings"
                        value={overview?.total_bookings ?? 0}
                        sublabel={`${overview?.completion_rate ?? 0}% completion rate`}
                    />
                    <KpiCard
                        icon={CheckCircle2}
                        label="Completed Sessions"
                        value={overview?.completed_count ?? 0}
                        sublabel={`${overview?.pending_count ?? 0} pending`}
                    />
                    <KpiCard
                        icon={Users}
                        label="Active Therapists"
                        value={overview?.active_therapists ?? 0}
                        sublabel={`${overview?.total_customers ?? 0} total customers`}
                    />
                </div>

                {/* ── Revenue Trend ── */}
                <ChartCard title="Revenue Trend" subtitle="Completed bookings, last 6 months">
                    <ResponsiveContainer width="100%" height={280}>
                        <LineChart data={revenueTrend}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-border)" vertical={false} />
                            <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--theme-text-muted)' }} axisLine={{ stroke: 'var(--theme-border)' }} tickLine={false} />
                            <YAxis tick={{ fontSize: 11, fill: 'var(--theme-text-muted)' }} axisLine={false} tickLine={false} width={60} tickFormatter={(v) => `${v}`} />
                            <Tooltip content={<CustomTooltip />} />
                            <Line
                                type="monotone"
                                dataKey="revenue"
                                name="Revenue"
                                stroke="#e2b764"
                                strokeWidth={2.5}
                                dot={{ fill: '#e2b764', r: 4 }}
                                activeDot={{ r: 6 }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </ChartCard>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                    {/* ── Top Services ── */}
                    <ChartCard title="Top Services" subtitle="By number of bookings">
                        <ResponsiveContainer width="100%" height={260}>
                            <BarChart data={topServices} layout="vertical" margin={{ left: 8 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-border)" horizontal={false} />
                                <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--theme-text-muted)' }} axisLine={false} tickLine={false} />
                                <YAxis
                                    type="category"
                                    dataKey="name"
                                    tick={{ fontSize: 11, fill: 'var(--theme-text-2)' }}
                                    axisLine={false}
                                    tickLine={false}
                                    width={110}
                                />
                                <Tooltip content={<CustomTooltip />} />
                                <Bar dataKey="bookings_count" name="Bookings" fill="#e2b764" radius={[0, 6, 6, 0]} barSize={18} />
                            </BarChart>
                        </ResponsiveContainer>
                    </ChartCard>

                    {/* ── Status Breakdown ── */}
                    <ChartCard title="Booking Status" subtitle="All-time distribution">
                        <ResponsiveContainer width="100%" height={260}>
                            <PieChart>
                                <Pie
                                    data={statusBreakdown}
                                    dataKey="count"
                                    nameKey="label"
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={55}
                                    outerRadius={85}
                                    paddingAngle={3}
                                >
                                    {statusBreakdown.map((entry, i) => (
                                        <Cell key={i} fill={entry.color} stroke="none" />
                                    ))}
                                </Pie>
                                <Tooltip content={<CustomTooltip />} />
                                <Legend
                                    verticalAlign="bottom"
                                    height={36}
                                    iconType="circle"
                                    iconSize={8}
                                    formatter={(value) => <span style={{ color: 'var(--theme-text-2)', fontSize: 11 }}>{value}</span>}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </ChartCard>
                </div>

                {/* ── Top Therapists Table ── */}
                <ChartCard title="Top Therapists" subtitle="Ranked by completed sessions">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b" style={{ borderColor: 'var(--theme-border)' }}>
                                    <th className="text-left py-2 px-3 font-medium text-xs" style={{ color: 'var(--theme-text-muted)' }}>Therapist</th>
                                    <th className="text-right py-2 px-3 font-medium text-xs" style={{ color: 'var(--theme-text-muted)' }}>Completed</th>
                                    <th className="text-right py-2 px-3 font-medium text-xs" style={{ color: 'var(--theme-text-muted)' }}>Revenue</th>
                                    <th className="text-right py-2 px-3 font-medium text-xs" style={{ color: 'var(--theme-text-muted)' }}>Avg Rating</th>
                                </tr>
                            </thead>
                            <tbody>
                                {topTherapists.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="text-center py-8 text-xs" style={{ color: 'var(--theme-text-muted)' }}>
                                            No completed bookings yet
                                        </td>
                                    </tr>
                                ) : (
                                    topTherapists.map((t, i) => (
                                        <tr key={t.id} className="border-b last:border-0" style={{ borderColor: 'var(--theme-border)' }}>
                                            <td className="py-3 px-3" style={{ color: 'var(--theme-text-head)' }}>
                                                <div className="flex items-center gap-2">
                                                    <span
                                                        className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                                                        style={{ background: 'var(--theme-btn-bg)', color: '#e2b764' }}
                                                    >
                                                        {i + 1}
                                                    </span>
                                                    {t.name}
                                                </div>
                                            </td>
                                            <td className="py-3 px-3 text-right" style={{ color: 'var(--theme-text-2)' }}>{t.completed_count}</td>
                                            <td className="py-3 px-3 text-right font-medium" style={{ color: 'var(--theme-text-head)' }}>
                                                {formatCurrency(t.revenue)}
                                            </td>
                                            <td className="py-3 px-3 text-right" style={{ color: 'var(--theme-text-2)' }}>
                                                {t.avg_rating ? Number(t.avg_rating).toFixed(1) : '—'}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </ChartCard>

                {/* ── Bookings by Zone ── */}
                {bookingsByZone.length > 0 && (
                    <ChartCard title="Bookings by Area" subtitle="Top 10 zones in Dubai">
                        <ResponsiveContainer width="100%" height={260}>
                            <BarChart data={bookingsByZone}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-border)" vertical={false} />
                                <XAxis
                                    dataKey="zone_name"
                                    tick={{ fontSize: 10, fill: 'var(--theme-text-muted)' }}
                                    axisLine={{ stroke: 'var(--theme-border)' }}
                                    tickLine={false}
                                    angle={-30}
                                    textAnchor="end"
                                    height={60}
                                />
                                <YAxis tick={{ fontSize: 11, fill: 'var(--theme-text-muted)' }} axisLine={false} tickLine={false} width={36} />
                                <Tooltip content={<CustomTooltip />} />
                                <Bar dataKey="count" name="Bookings" fill="#b7882a" radius={[6, 6, 0, 0]} barSize={28} />
                            </BarChart>
                        </ResponsiveContainer>
                    </ChartCard>
                )}

            </div>
        </AdminLayout>
    );
}