import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import TherapistLayout from '@/Layouts/TherapistLayout';
import {
    TrendingUp, Wallet, Calendar, Clock, Download,
    ChevronDown, ChevronLeft, ChevronRight,
    ArrowUpDown, ArrowUp, ArrowDown,
    CheckCircle2, AlertCircle, RefreshCw, BarChart2,
} from 'lucide-react';

// ── CSRF + API ────────────────────────────────────────────────────────────────
function getCsrf() {
    const c = document.cookie.split('; ').find(r => r.startsWith('XSRF-TOKEN='));
    return c ? decodeURIComponent(c.split('=')[1]) : '';
}
async function apiFetch(url, opts = {}) {
    const res = await fetch(url, {
        ...opts,
        credentials: 'same-origin',
        headers: {
            Accept:              'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-XSRF-TOKEN':     getCsrf(),
            ...(opts.headers ?? {}),
        },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

const fmt = (n) => 'AED ' + Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// ── Summary card ──────────────────────────────────────────────────────────────
function SummaryCard({ icon: Icon, label, value, accent, loading, delay = 0 }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay }}
            className="relative overflow-hidden rounded-2xl border p-5"
            style={{ background: 'var(--theme-card)', borderColor: 'var(--theme-border)' }}
        >
            <div
                className="absolute top-0 right-0 w-36 h-36 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none"
                style={{ background: `${accent}14` }}
            />
            <div className="relative z-10">
                <div className="flex items-start justify-between mb-3">
                    <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--theme-text-muted)' }}>
                        {label}
                    </p>
                    <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: `${accent}1a` }}
                    >
                        <Icon size={16} style={{ color: accent }} />
                    </div>
                </div>
                {loading ? (
                    <div className="h-7 w-28 rounded-lg animate-pulse" style={{ background: 'var(--theme-skeleton)' }} />
                ) : (
                    <p className="text-xl font-display font-bold leading-tight" style={{ color: 'var(--theme-text-head)' }}>
                        {value}
                    </p>
                )}
            </div>
        </motion.div>
    );
}

// ── Bar chart ─────────────────────────────────────────────────────────────────
function EarningsChart({ chartData, chartView, setChartView, chartLoading }) {
    const containerRef = useRef(null);
    const [width, setWidth] = useState(500);

    useEffect(() => {
        if (!containerRef.current) return;
        const ro = new ResizeObserver(entries => {
            setWidth(entries[0].contentRect.width);
        });
        ro.observe(containerRef.current);
        return () => ro.disconnect();
    }, []);

    const data    = chartData ?? [];
    const maxVal  = Math.max(...data.map(d => d.amount), 1);
    const padLeft = 56;
    const padBot  = 32;
    const padTop  = 16;
    const padRight = 16;
    const chartW  = Math.max(width - padLeft - padRight, 100);
    const chartH  = 180;
    const barGap  = 0.3;
    const n       = data.length || 1;
    const barW    = (chartW / n) * (1 - barGap);
    const barOff  = (chartW / n) * (barGap / 2);

    const yTicks = 4;
    const yStep  = maxVal / yTicks;

    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-2xl border overflow-hidden"
            style={{ background: 'var(--theme-card)', borderColor: 'var(--theme-border)' }}
        >
            {/* header */}
            <div
                className="flex items-center justify-between px-5 py-4 border-b"
                style={{ borderColor: 'var(--theme-border)' }}
            >
                <div className="flex items-center gap-2">
                    <BarChart2 size={15} style={{ color: '#e2b764' }} />
                    <h3 className="font-display font-bold text-sm" style={{ color: 'var(--theme-text-head)' }}>
                        Earnings Overview
                    </h3>
                </div>
                <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)' }}>
                    {['weekly', 'monthly'].map(v => (
                        <button
                            key={v}
                            onClick={() => setChartView(v)}
                            className="px-3 py-1 rounded-lg text-xs font-semibold transition-all capitalize"
                            style={chartView === v
                                ? { background: 'rgba(226,183,100,0.2)', color: '#e2b764', border: '1px solid rgba(226,183,100,0.3)' }
                                : { color: 'var(--theme-text-muted)', border: '1px solid transparent' }
                            }
                        >
                            {v === 'weekly' ? 'Weekly' : 'Monthly'}
                        </button>
                    ))}
                </div>
            </div>

            <div className="px-5 py-4">
                {chartLoading ? (
                    <div className="flex items-end gap-3 h-[212px]">
                        {[60, 80, 45, 90].map((h, i) => (
                            <div key={i} className="flex-1 rounded-t-lg animate-pulse" style={{ height: `${h}%`, background: 'var(--theme-skeleton)' }} />
                        ))}
                    </div>
                ) : (
                    <div ref={containerRef} className="w-full">
                        <svg
                            width="100%"
                            height={chartH + padBot + padTop}
                            style={{ overflow: 'visible' }}
                        >
                            {/* Y gridlines + labels */}
                            {Array.from({ length: yTicks + 1 }, (_, i) => {
                                const val  = yStep * i;
                                const y    = padTop + chartH - (val / maxVal) * chartH;
                                const label = val >= 1000 ? `${(val / 1000).toFixed(1)}k` : Math.round(val).toString();
                                return (
                                    <g key={i}>
                                        <line
                                            x1={padLeft} y1={y}
                                            x2={padLeft + chartW} y2={y}
                                            stroke="var(--theme-border)" strokeWidth="1"
                                            strokeDasharray={i === 0 ? 'none' : '3 4'}
                                        />
                                        <text
                                            x={padLeft - 6} y={y + 4}
                                            textAnchor="end"
                                            fontSize="10"
                                            fill="var(--theme-text-muted)"
                                        >
                                            {label}
                                        </text>
                                    </g>
                                );
                            })}

                            {/* Bars */}
                            {data.map((d, i) => {
                                const barHeight = Math.max((d.amount / maxVal) * chartH, d.amount > 0 ? 4 : 0);
                                const x = padLeft + i * (chartW / n) + barOff;
                                const y = padTop + chartH - barHeight;
                                const xCenter = x + barW / 2;
                                return (
                                    <g key={i}>
                                        {/* Bar */}
                                        <rect
                                            x={x} y={y}
                                            width={barW} height={barHeight}
                                            rx="5" ry="5"
                                            fill="url(#barGrad)"
                                        />
                                        {/* Value label on top */}
                                        {d.amount > 0 && (
                                            <text
                                                x={xCenter}
                                                y={y - 5}
                                                textAnchor="middle"
                                                fontSize="9"
                                                fontWeight="600"
                                                fill="#e2b764"
                                            >
                                                {d.amount >= 1000 ? `${(d.amount / 1000).toFixed(1)}k` : Math.round(d.amount)}
                                            </text>
                                        )}
                                        {/* X label */}
                                        <text
                                            x={xCenter}
                                            y={padTop + chartH + 18}
                                            textAnchor="middle"
                                            fontSize="10"
                                            fill="var(--theme-text-muted)"
                                        >
                                            {d.label}
                                        </text>
                                    </g>
                                );
                            })}

                            <defs>
                                <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%"   stopColor="#e2b764" stopOpacity="0.9" />
                                    <stop offset="100%" stopColor="#b7882a" stopOpacity="0.5" />
                                </linearGradient>
                            </defs>
                        </svg>
                    </div>
                )}

                {!chartLoading && data.length > 0 && (
                    <p className="text-[10px] mt-1 text-right" style={{ color: 'var(--theme-text-muted)' }}>
                        Y-axis: AED · 60% commission rate applied
                    </p>
                )}
            </div>
        </motion.div>
    );
}

// ── Sort button ───────────────────────────────────────────────────────────────
function SortBtn({ field, current, onSort }) {
    const isActive = current.startsWith(field);
    const isAsc    = current === `${field}_asc`;

    return (
        <button
            onClick={() => onSort(isActive && !isAsc ? `${field}_asc` : `${field}_desc`)}
            className="inline-flex items-center gap-0.5"
            style={{ color: isActive ? '#e2b764' : 'var(--theme-text-muted)' }}
        >
            {isActive
                ? (isAsc ? <ArrowUp size={11} /> : <ArrowDown size={11} />)
                : <ArrowUpDown size={11} />
            }
        </button>
    );
}

// ── Transactions table ────────────────────────────────────────────────────────
function TransactionsTable({ transactions, meta, page, setPage, sort, setSort, loading }) {
    const rows = transactions ?? [];

    const colHead = (label, field) => (
        <th
            className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider"
            style={{ color: 'var(--theme-text-muted)', borderBottom: '1px solid var(--theme-border)' }}
        >
            <span className="flex items-center gap-1">
                {label}
                {field && <SortBtn field={field} current={sort} onSort={setSort} />}
            </span>
        </th>
    );

    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="rounded-2xl border overflow-hidden"
            style={{ background: 'var(--theme-card)', borderColor: 'var(--theme-border)' }}
        >
            {/* Header */}
            <div
                className="flex items-center justify-between px-5 py-4 border-b"
                style={{ borderColor: 'var(--theme-border)' }}
            >
                <h3 className="font-display font-bold text-sm" style={{ color: 'var(--theme-text-head)' }}>
                    Recent Transactions
                </h3>
                {meta && (
                    <span className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>
                        {meta.total} records
                    </span>
                )}
            </div>

            {/* Table — scroll on mobile */}
            <div className="overflow-x-auto">
                <table className="w-full min-w-[600px]">
                    <thead>
                        <tr style={{ background: 'var(--theme-btn-bg)' }}>
                            {colHead('Service', null)}
                            {colHead('Customer', null)}
                            {colHead('Date', 'date')}
                            {colHead('Service Price', 'amount')}
                            {colHead('You Earned', null)}
                            {colHead('Status', null)}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            Array.from({ length: 5 }, (_, i) => (
                                <tr key={i} className="border-b" style={{ borderColor: 'var(--theme-border)' }}>
                                    {Array.from({ length: 6 }, (__, j) => (
                                        <td key={j} className="px-4 py-3">
                                            <div className="h-3.5 rounded animate-pulse" style={{ background: 'var(--theme-skeleton)', width: j === 0 ? '80%' : '60%' }} />
                                        </td>
                                    ))}
                                </tr>
                            ))
                        ) : rows.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-4 py-12 text-center text-sm" style={{ color: 'var(--theme-text-muted)' }}>
                                    No completed bookings yet
                                </td>
                            </tr>
                        ) : rows.map((row, i) => (
                            <tr
                                key={row.id}
                                className="border-b transition-colors"
                                style={{
                                    borderColor: 'var(--theme-border)',
                                    background: i % 2 === 1 ? 'rgba(226,183,100,0.015)' : 'transparent',
                                }}
                            >
                                <td className="px-4 py-3">
                                    <p className="text-sm font-medium" style={{ color: 'var(--theme-text-head)' }}>{row.service_name}</p>
                                </td>
                                <td className="px-4 py-3">
                                    <p className="text-sm" style={{ color: 'var(--theme-text-2)' }}>{row.customer_name}</p>
                                </td>
                                <td className="px-4 py-3">
                                    <p className="text-sm" style={{ color: 'var(--theme-text-2)' }}>{fmtDate(row.date_completed)}</p>
                                </td>
                                <td className="px-4 py-3">
                                    <p className="text-sm font-mono" style={{ color: 'var(--theme-text-2)' }}>
                                        AED {Number(row.service_price).toFixed(2)}
                                    </p>
                                </td>
                                <td className="px-4 py-3">
                                    <p className="text-sm font-mono font-semibold" style={{ color: '#e2b764' }}>
                                        AED {Number(row.earned).toFixed(2)}
                                    </p>
                                </td>
                                <td className="px-4 py-3">
                                    <span
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
                                        style={row.status === 'released'
                                            ? { background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.25)' }
                                            : { background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.25)' }
                                        }
                                    >
                                        {row.status === 'released'
                                            ? <><CheckCircle2 size={10} /> Released</>
                                            : <><Clock size={10} /> Pending</>
                                        }
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {meta && meta.last_page > 1 && (
                <div
                    className="flex items-center justify-between px-5 py-3 border-t"
                    style={{ borderColor: 'var(--theme-border)' }}
                >
                    <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>
                        Page {meta.current_page} of {meta.last_page}
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page <= 1}
                            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors disabled:opacity-30"
                            style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)' }}
                        >
                            <ChevronLeft size={14} style={{ color: 'var(--theme-text-2)' }} />
                        </button>
                        <button
                            onClick={() => setPage(p => Math.min(meta.last_page, p + 1))}
                            disabled={page >= meta.last_page}
                            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors disabled:opacity-30"
                            style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)' }}
                        >
                            <ChevronRight size={14} style={{ color: 'var(--theme-text-2)' }} />
                        </button>
                    </div>
                </div>
            )}
        </motion.div>
    );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Earnings() {
    const [summary, setSummary]           = useState(null);
    const [summaryLoading, setSummaryLoading] = useState(true);

    const [chartData, setChartData]       = useState(null);
    const [chartView, setChartView]       = useState('weekly');
    const [chartLoading, setChartLoading] = useState(true);

    const [transactions, setTransactions] = useState([]);
    const [txMeta, setTxMeta]             = useState(null);
    const [txPage, setTxPage]             = useState(1);
    const [txSort, setTxSort]             = useState('date_desc');
    const [txLoading, setTxLoading]       = useState(true);

    const [toast, setToast]               = useState(null);
    const [downloading, setDownloading]   = useState(false);

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3500);
    };

    // ── Fetch summary ─────────────────────────────────────────────────────────
    const fetchSummary = useCallback(() => {
        setSummaryLoading(true);
        apiFetch('/therapist/api/earnings')
            .then(data => setSummary(data))
            .catch(() => showToast('Failed to load summary', 'error'))
            .finally(() => setSummaryLoading(false));
    }, []);

    // ── Fetch chart ───────────────────────────────────────────────────────────
    const fetchChart = useCallback((view) => {
        setChartLoading(true);
        apiFetch(`/therapist/api/earnings/chart?view=${view}`)
            .then(data => setChartData(data.data))
            .catch(() => showToast('Failed to load chart', 'error'))
            .finally(() => setChartLoading(false));
    }, []);

    // ── Fetch transactions ────────────────────────────────────────────────────
    const fetchTransactions = useCallback((page, sort) => {
        setTxLoading(true);
        apiFetch(`/therapist/api/earnings/transactions?page=${page}&per_page=10&sort=${sort}`)
            .then(data => {
                setTransactions(data.data);
                setTxMeta({
                    current_page: data.current_page,
                    last_page:    data.last_page,
                    total:        data.total,
                });
            })
            .catch(() => showToast('Failed to load transactions', 'error'))
            .finally(() => setTxLoading(false));
    }, []);

    useEffect(() => { fetchSummary(); }, [fetchSummary]);
    useEffect(() => { fetchChart(chartView); }, [fetchChart, chartView]);
    useEffect(() => { fetchTransactions(txPage, txSort); }, [fetchTransactions, txPage, txSort]);

    // ── Download CSV ──────────────────────────────────────────────────────────
    const handleDownload = async () => {
        setDownloading(true);
        try {
            const res = await fetch('/therapist/api/earnings/export', {
                credentials: 'same-origin',
                headers: { 'X-Requested-With': 'XMLHttpRequest', 'X-XSRF-TOKEN': getCsrf() },
            });
            if (!res.ok) throw new Error();
            const blob = await res.blob();
            const cd   = res.headers.get('Content-Disposition') ?? '';
            const nameMatch = cd.match(/filename="?([^"]+)"?/);
            const filename  = nameMatch ? nameMatch[1] : 'earnings.csv';
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href     = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
            showToast('Report downloaded!');
        } catch {
            showToast('Download failed', 'error');
        } finally {
            setDownloading(false);
        }
    };

    function getCsrf() {
        const c = document.cookie.split('; ').find(r => r.startsWith('XSRF-TOKEN='));
        return c ? decodeURIComponent(c.split('=')[1]) : '';
    }

    const handleChartViewChange = (v) => {
        setChartView(v);
    };

    return (
        <TherapistLayout>
            <div className="min-h-screen pb-24 md:pb-10" style={{ background: 'var(--theme-bg)' }}>

                {/* ── Page header ────────────────────────────────────────────── */}
                <div className="max-w-5xl mx-auto px-4 md:px-8 pt-6 pb-2">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h1 className="font-display font-bold text-2xl" style={{ color: 'var(--theme-text-head)' }}>
                                My Earnings
                            </h1>
                            <p className="text-xs mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>
                                60% commission on completed sessions
                            </p>
                        </div>
                        <button
                            onClick={handleDownload}
                            disabled={downloading}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all flex-shrink-0"
                            style={{
                                background: downloading ? 'rgba(226,183,100,0.08)' : 'rgba(226,183,100,0.15)',
                                border:     '1px solid rgba(226,183,100,0.35)',
                                color:      downloading ? 'rgba(226,183,100,0.5)' : '#e2b764',
                            }}
                            onMouseEnter={e => { if (!downloading) e.currentTarget.style.background = 'rgba(226,183,100,0.22)'; }}
                            onMouseLeave={e => { if (!downloading) e.currentTarget.style.background = 'rgba(226,183,100,0.15)'; }}
                        >
                            {downloading
                                ? <RefreshCw size={14} className="animate-spin" />
                                : <Download size={14} />
                            }
                            {downloading ? 'Preparing…' : 'Download Report'}
                        </button>
                    </div>
                </div>

                <div className="max-w-5xl mx-auto px-4 md:px-8 space-y-6 pt-4">

                    {/* ── Summary cards ───────────────────────────────────────── */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <SummaryCard
                            icon={Wallet}
                            label="Total Earnings"
                            value={summary ? fmt(summary.total_earnings) : '—'}
                            accent="#e2b764"
                            loading={summaryLoading}
                            delay={0}
                        />
                        <SummaryCard
                            icon={Calendar}
                            label="This Month"
                            value={summary ? fmt(summary.this_month) : '—'}
                            accent="#10b981"
                            loading={summaryLoading}
                            delay={0.05}
                        />
                        <SummaryCard
                            icon={TrendingUp}
                            label="This Week"
                            value={summary ? fmt(summary.this_week) : '—'}
                            accent="#3b82f6"
                            loading={summaryLoading}
                            delay={0.1}
                        />
                        <SummaryCard
                            icon={Clock}
                            label="Pending Earnings"
                            value={summary ? fmt(summary.pending_earnings) : '—'}
                            accent="#f59e0b"
                            loading={summaryLoading}
                            delay={0.15}
                        />
                    </div>

                    {/* ── Earnings chart ───────────────────────────────────────── */}
                    <EarningsChart
                        chartData={chartData}
                        chartView={chartView}
                        setChartView={handleChartViewChange}
                        chartLoading={chartLoading}
                    />

                    {/* ── Transactions table ───────────────────────────────────── */}
                    <TransactionsTable
                        transactions={transactions}
                        meta={txMeta}
                        page={txPage}
                        setPage={setTxPage}
                        sort={txSort}
                        setSort={(s) => { setTxSort(s); setTxPage(1); }}
                        loading={txLoading}
                    />

                </div>
            </div>

            {/* ── Toast ─────────────────────────────────────────────────────── */}
            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ opacity: 0, y: 24, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0,  scale: 1    }}
                        exit={{ opacity: 0,  y: 24, scale: 0.95  }}
                        className="fixed bottom-6 left-1/2 z-50 px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 text-sm font-semibold"
                        style={{
                            transform: 'translateX(-50%)',
                            background: toast.type === 'error' ? '#7f1d1d' : 'var(--theme-card)',
                            border:     `1px solid ${toast.type === 'error' ? 'rgba(239,68,68,0.4)' : 'rgba(226,183,100,0.3)'}`,
                            color:      toast.type === 'error' ? '#fca5a5' : '#e2b764',
                            boxShadow:  '0 8px 32px rgba(0,0,0,0.5)',
                        }}
                    >
                        {toast.type === 'error'
                            ? <AlertCircle size={15} />
                            : <CheckCircle2 size={15} />
                        }
                        {toast.msg}
                    </motion.div>
                )}
            </AnimatePresence>
        </TherapistLayout>
    );
}
