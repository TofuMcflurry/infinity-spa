import { useState, useEffect } from 'react';
import { router, usePage } from '@inertiajs/react';
import AdminLayout from '@/Layouts/AdminLayout';
import {
    Search, CheckCircle, XCircle, UserMinus,
    ChevronLeft, ChevronRight, Star, MapPin,
    X, Loader2, BookOpen, MessageSquare, ShieldAlert,
    AlertTriangle, CheckCircle2, Save, ChevronRight as ChevronR,
} from 'lucide-react';

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

// ── Status badge ──────────────────────────────────────────────────────────────
const BOOKING_STATUS = {
    completed: { color: '#22c55e', bg: 'rgba(34,197,94,0.1)',   label: 'Completed' },
    accepted:  { color: '#3b82f6', bg: 'rgba(59,130,246,0.1)',  label: 'Accepted'  },
    pending:   { color: '#e2b764', bg: 'rgba(226,183,100,0.1)', label: 'Pending'   },
    cancelled: { color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', label: 'Cancelled' },
    rejected:  { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   label: 'Rejected'  },
};

function StatusBadge({ isActive, isPending }) {
    if (isPending) return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full"
            style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.25)' }}>
            Pending
        </span>
    );
    if (isActive) return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full"
            style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.25)' }}>
            Active
        </span>
    );
    return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full"
            style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }}>
            Inactive
        </span>
    );
}

function Avatar({ initials, flagged }) {
    return (
        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0"
            style={{
                background: flagged ? 'rgba(239,68,68,0.15)' : 'rgba(226,183,100,0.15)',
                color: flagged ? '#ef4444' : '#e2b764',
                border: `1px solid ${flagged ? 'rgba(239,68,68,0.2)' : 'rgba(226,183,100,0.2)'}`,
            }}>
            {initials}
        </div>
    );
}

// ── Confirm dialog ────────────────────────────────────────────────────────────
function ConfirmDialog({ open, title, message, confirmLabel, confirmStyle, onConfirm, onCancel }) {
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4"
            style={{ background: 'rgba(0,0,0,0.6)' }}>
            <div className="rounded-2xl p-6 w-full max-w-sm glass-card space-y-4">
                <h3 className="font-display font-bold text-base" style={{ color: 'var(--theme-text-head)' }}>
                    {title}
                </h3>
                <p className="text-sm" style={{ color: 'var(--theme-text-2)' }}>{message}</p>
                <div className="flex gap-3 justify-end pt-2">
                    <button onClick={onCancel}
                        className="px-4 py-2 rounded-xl text-sm font-medium border transition-colors"
                        style={{ borderColor: 'var(--theme-border)', color: 'var(--theme-text-2)', background: 'var(--theme-btn-bg)' }}>
                        Cancel
                    </button>
                    <button onClick={onConfirm}
                        className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                        style={confirmStyle}>
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Star rating ───────────────────────────────────────────────────────────────
function StarRating({ value }) {
    return (
        <div className="flex items-center gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} size={12}
                    style={{ fill: i < Math.floor(value) ? '#e2b764' : 'transparent', color: i < Math.ceil(value) ? '#e2b764' : 'var(--theme-border)' }} />
            ))}
            <span className="text-xs ml-1 font-semibold" style={{ color: 'var(--theme-text-head)' }}>
                {Number(value || 0).toFixed(1)}
            </span>
        </div>
    );
}

// ── Therapist Drawer ──────────────────────────────────────────────────────────
function TherapistDrawer({ therapist, onClose, onAction }) {
    const [tab, setTab]         = useState('bookings');
    const [bookings, setBookings] = useState([]);
    const [csatData, setCsatData] = useState(null);
    const [reports, setReports]   = useState([]);
    const [loading, setLoading]   = useState(false);
    const [noteId, setNoteId]     = useState(null);
    const [noteText, setNoteText] = useState('');
    const [saving, setSaving]     = useState(false);

    useEffect(() => {
        if (!therapist) return;
        setTab('bookings');
        setLoading(true);
        Promise.all([
            apiFetch(`/admin/api/therapists/${therapist.id}/bookings`),
            apiFetch(`/admin/api/therapists/${therapist.id}/reviews`),
            apiFetch(`/admin/api/therapists/${therapist.id}/reports`),
        ]).then(([b, c, r]) => {
            setBookings(b);
            setCsatData(c);
            setReports(r);
        }).finally(() => setLoading(false));
    }, [therapist]);

    if (!therapist) return null;

    const handleSaveNote = async (reviewId) => {
        setSaving(true);
        await apiFetch(`/admin/api/therapists/${therapist.id}/reviews/${reviewId}/note`, {
            method: 'POST',
            body: JSON.stringify({ note: noteText }),
        });
        setCsatData(prev => ({
            ...prev,
            reviews: prev.reviews.map(r => r.id === reviewId ? { ...r, admin_note: noteText } : r),
        }));
        setNoteId(null);
        setNoteText('');
        setSaving(false);
    };

    const handleReportAction = async (report, status) => {
        await apiFetch(`/admin/api/therapists/${therapist.id}/reports/${report.id}/review`, {
            method: 'POST',
            body: JSON.stringify({ status }),
        });
        setReports(prev => prev.map(r => r.id === report.id ? { ...r, status } : r));
    };

    const tabs = [
        { key: 'bookings', label: 'Bookings', count: bookings.length },
        { key: 'csat',     label: 'CSAT',     count: csatData?.reviews?.length ?? 0 },
        { key: 'reports',  label: 'Reports',   count: reports.filter(r => r.status === 'pending').length },
    ];

    return (
        <div className="fixed inset-0 z-50 flex">
            <button className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onClose} />
            <div className="absolute inset-y-0 right-0 w-full max-w-lg flex flex-col"
                style={{ background: 'var(--theme-notif-bg)', borderLeft: '1px solid var(--theme-border)' }}>

                {/* Header */}
                <div className="flex items-start justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--theme-border)' }}>
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0"
                            style={{
                                background: therapist.is_flagged ? 'rgba(239,68,68,0.15)' : 'linear-gradient(135deg, #b7882a, #e2b764)',
                                color: therapist.is_flagged ? '#ef4444' : '#0b1120',
                            }}>
                            {therapist.avatar}
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-sm font-display font-bold" style={{ color: 'var(--theme-text-head)' }}>
                                    {therapist.name}
                                </h2>
                                <StatusBadge isActive={therapist.is_active} isPending={!therapist.is_active} />
                                {therapist.is_flagged && (
                                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full"
                                        style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
                                        CSAT Flagged
                                    </span>
                                )}
                            </div>
                            <p className="text-xs mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>
                                {therapist.specialty ?? 'Therapist'} · {therapist.gender === 'male' ? '♂ Male' : '♀ Female'}
                                {therapist.experience_years ? ` · ${therapist.experience_years} yrs exp` : ''}
                            </p>
                            <div className="mt-1">
                                <StarRating value={therapist.rating} />
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)' }}>
                        <X size={15} style={{ color: 'var(--theme-text-2)' }} />
                    </button>
                </div>

                {/* Info row */}
                <div className="px-5 py-3 border-b flex flex-wrap gap-4" style={{ borderColor: 'var(--theme-border)' }}>
                    {therapist.shift_start && (
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--theme-text-muted)' }}>Shift</p>
                            <p className="text-xs" style={{ color: 'var(--theme-text-2)' }}>{therapist.shift_start} – {therapist.shift_end}</p>
                        </div>
                    )}
                    {therapist.day_off && (
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--theme-text-muted)' }}>Day Off</p>
                            <p className="text-xs" style={{ color: 'var(--theme-text-2)' }}>{therapist.day_off}</p>
                        </div>
                    )}
                    {therapist.zones?.length > 0 && (
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--theme-text-muted)' }}>Zones</p>
                            <div className="flex flex-wrap gap-1 mt-0.5">
                                {therapist.zones.map(z => (
                                    <span key={z} className="text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-0.5"
                                        style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-2)' }}>
                                        <MapPin size={8} />{z}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                    <div className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>
                        Since {therapist.created_at}
                    </div>
                </div>

                {/* Action buttons */}
                <div className="px-5 py-3 flex gap-2 border-b" style={{ borderColor: 'var(--theme-border)' }}>
                    {!therapist.is_active && (
                        <button onClick={() => onAction('approve', therapist)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                            style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', color: '#22c55e' }}>
                            <CheckCircle size={13} /> Approve
                        </button>
                    )}
                    {therapist.is_active && (
                        <button onClick={() => onAction('deactivate', therapist)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                            style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)', color: '#fbbf24' }}>
                            <UserMinus size={13} /> Deactivate
                        </button>
                    )}
                    <button onClick={() => onAction('reject', therapist)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                        style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444' }}>
                        <XCircle size={13} /> Reject & Delete
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 px-4 pt-3 pb-2">
                    {tabs.map(t => (
                        <button key={t.key} onClick={() => setTab(t.key)}
                            className="px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5"
                            style={{
                                background: tab === t.key ? 'var(--theme-btn-bg)' : 'transparent',
                                border: `1px solid ${tab === t.key ? 'var(--theme-border)' : 'transparent'}`,
                                color: tab === t.key ? 'var(--theme-text-head)' : 'var(--theme-text-muted)',
                            }}>
                            {t.label}
                            {t.count > 0 && (
                                <span className="w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center"
                                    style={{
                                        background: t.key === 'reports' && t.count > 0 ? '#ef4444' : 'rgba(226,183,100,0.2)',
                                        color: t.key === 'reports' && t.count > 0 ? 'white' : '#e2b764',
                                    }}>
                                    {t.count}
                                </span>
                            )}
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
                        ) : bookings.map(b => {
                            const cfg = BOOKING_STATUS[b.status] ?? { color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', label: b.status };
                            return (
                                <div key={b.id} className="px-4 py-3 rounded-xl"
                                    style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)' }}>
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="text-xs font-semibold" style={{ color: 'var(--theme-text-head)' }}>
                                                {b.ref} — {b.service_name}
                                            </p>
                                            <p className="text-[10px] mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>
                                                {b.customer_name} · {b.zone_name}
                                            </p>
                                            <p className="text-[10px]" style={{ color: 'var(--theme-text-muted)' }}>
                                                {b.scheduled_start ?? b.created_at}
                                            </p>
                                        </div>
                                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 capitalize"
                                            style={{ background: cfg.bg, color: cfg.color }}>
                                            {cfg.label}
                                        </span>
                                    </div>
                                </div>
                            );
                        })
                    ) : tab === 'csat' ? (
                        <>
                            {csatData?.is_flagged && (
                                <div className="px-4 py-3 rounded-xl flex items-start gap-3 mb-3"
                                    style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                                    <AlertTriangle size={15} style={{ color: '#ef4444', flexShrink: 0, marginTop: 1 }} />
                                    <div>
                                        <p className="text-xs font-semibold" style={{ color: '#ef4444' }}>
                                            CSAT Flagged on {csatData.flagged_at}
                                        </p>
                                        <p className="text-xs mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>
                                            {csatData.flag_reason}
                                        </p>
                                    </div>
                                </div>
                            )}
                            {!csatData?.reviews?.length ? (
                                <div className="text-center py-12">
                                    <MessageSquare size={24} className="mx-auto mb-2" style={{ color: 'var(--theme-text-muted)', opacity: 0.3 }} />
                                    <p className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>No reviews yet.</p>
                                </div>
                            ) : csatData.reviews.map(r => (
                                <div key={r.id} className="px-4 py-3 rounded-xl"
                                    style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)' }}>
                                    <div className="flex items-start justify-between gap-2 mb-1.5">
                                        <div>
                                            <p className="text-xs font-semibold" style={{ color: 'var(--theme-text-head)' }}>{r.customer_name}</p>
                                            <p className="text-[10px]" style={{ color: 'var(--theme-text-muted)' }}>{r.created_at}</p>
                                        </div>
                                        <div className="flex items-center gap-1.5 flex-shrink-0">
                                            <StarRating value={r.therapist_rating} />
                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                                                style={{ background: 'rgba(226,183,100,0.1)', color: '#e2b764' }}>
                                                {r.therapist_csat}%
                                            </span>
                                        </div>
                                    </div>
                                    {r.comment && (
                                        <p className="text-xs mb-2 leading-relaxed" style={{ color: 'var(--theme-text-2)' }}>
                                            "{r.comment}"
                                        </p>
                                    )}
                                    {r.admin_note && noteId !== r.id && (
                                        <div className="px-3 py-2 rounded-lg mb-2"
                                            style={{ background: 'rgba(226,183,100,0.08)', border: '1px solid rgba(226,183,100,0.15)' }}>
                                            <p className="text-[10px] font-semibold mb-0.5" style={{ color: '#e2b764' }}>Admin Note</p>
                                            <p className="text-xs" style={{ color: 'var(--theme-text-2)' }}>{r.admin_note}</p>
                                        </div>
                                    )}
                                    {noteId === r.id ? (
                                        <div className="space-y-2">
                                            <textarea value={noteText} onChange={e => setNoteText(e.target.value)}
                                                placeholder="Add coaching note..." rows={3} autoFocus
                                                className="w-full px-3 py-2 rounded-lg text-xs outline-none resize-none"
                                                style={{ background: 'var(--theme-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-head)' }} />
                                            <div className="flex gap-2">
                                                <button onClick={() => handleSaveNote(r.id)} disabled={saving || !noteText.trim()}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
                                                    style={{ background: 'linear-gradient(135deg, #b7882a, #e2b764)', color: '#0b1120' }}>
                                                    {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                                                    Save
                                                </button>
                                                <button onClick={() => { setNoteId(null); setNoteText(''); }}
                                                    className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                                                    style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-2)' }}>
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <button onClick={() => { setNoteId(r.id); setNoteText(r.admin_note ?? ''); }}
                                            className="text-[10px] font-semibold" style={{ color: '#e2b764' }}>
                                            {r.admin_note ? 'Edit note' : '+ Add coaching note'}
                                        </button>
                                    )}
                                </div>
                            ))}
                        </>
                    ) : (
                        reports.length === 0 ? (
                            <div className="text-center py-12">
                                <ShieldAlert size={24} className="mx-auto mb-2" style={{ color: 'var(--theme-text-muted)', opacity: 0.3 }} />
                                <p className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>No reports filed against this therapist.</p>
                            </div>
                        ) : reports.map(r => (
                            <div key={r.id} className="px-4 py-3 rounded-xl"
                                style={{
                                    background: r.status === 'pending' ? 'rgba(239,68,68,0.04)' : 'var(--theme-btn-bg)',
                                    border: `1px solid ${r.status === 'pending' ? 'rgba(239,68,68,0.2)' : 'var(--theme-border)'}`,
                                }}>
                                <div className="flex items-start justify-between gap-2 mb-1.5">
                                    <div>
                                        <p className="text-xs font-semibold" style={{ color: 'var(--theme-text-head)' }}>{r.reason}</p>
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
                                    <p className="text-xs mb-2 leading-relaxed" style={{ color: 'var(--theme-text-2)' }}>{r.description}</p>
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
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Therapists({ therapists, filters }) {
    const { props } = usePage();
    const flash = props.flash ?? {};

    const [search, setSearch] = useState(filters?.search ?? '');
    const [status, setStatus] = useState(filters?.status ?? 'all');
    const [dialog, setDialog] = useState(null);
    const [selected, setSelected] = useState(null);

    const applyFilters = (overrides = {}) => {
        router.get('/admin/therapists', {
            search: overrides.search ?? search,
            status: overrides.status ?? status,
        }, { preserveScroll: true, preserveState: true });
    };

    const handleStatusChange = (val) => {
        setStatus(val);
        applyFilters({ status: val });
    };

    const handleConfirm = () => {
        if (!dialog) return;
        const { type, therapist } = dialog;
        setDialog(null);
        setSelected(null);

        if (type === 'approve') {
            router.post(`/admin/therapists/${therapist.id}/approve`, {}, { preserveScroll: true });
        } else if (type === 'deactivate') {
            router.post(`/admin/therapists/${therapist.id}/deactivate`, {}, { preserveScroll: true });
        } else if (type === 'reject') {
            router.delete(`/admin/therapists/${therapist.id}`, {}, { preserveScroll: true });
        }
    };

    const { data, current_page, last_page, prev_page_url, next_page_url } = therapists;

    const goToPage = (url) => {
        if (!url) return;
        router.get(url, {}, { preserveScroll: true, preserveState: true });
    };

    const dialogConfig = dialog ? {
        approve: {
            title: 'Approve Therapist',
            message: `Approve ${dialog.therapist.name} and make them visible to customers?`,
            confirmLabel: 'Approve',
            confirmStyle: { background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' },
        },
        deactivate: {
            title: 'Deactivate Therapist',
            message: `Deactivate ${dialog.therapist.name}? They will no longer appear in booking flow.`,
            confirmLabel: 'Deactivate',
            confirmStyle: { background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' },
        },
        reject: {
            title: 'Reject & Delete',
            message: `Permanently delete ${dialog.therapist.name}'s account? This cannot be undone.`,
            confirmLabel: 'Delete',
            confirmStyle: { background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' },
        },
    }[dialog.type] : null;

    return (
        <AdminLayout title="Manage Therapists">
            {flash.success && (
                <div className="mb-4 px-4 py-3 rounded-xl text-sm font-medium"
                    style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}>
                    {flash.success}
                </div>
            )}

            <div className="space-y-5">
                {/* Filters */}
                <div className="flex flex-wrap items-center gap-3">
                    <div className="relative flex-1 min-w-[200px] max-w-xs">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--theme-text-muted)' }} />
                        <input type="text" placeholder="Search by name..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && applyFilters()}
                            className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm border outline-none"
                            style={{ background: 'var(--theme-btn-bg)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }} />
                    </div>
                    <div className="flex gap-1.5">
                        {['all', 'active', 'inactive'].map(s => (
                            <button key={s} onClick={() => handleStatusChange(s)}
                                className="px-3 py-2 rounded-xl text-xs font-semibold border transition-all capitalize"
                                style={{
                                    borderColor: status === s ? 'rgba(226,183,100,0.35)' : 'var(--theme-border)',
                                    background:  status === s ? 'rgba(226,183,100,0.10)' : 'var(--theme-btn-bg)',
                                    color:       status === s ? '#e2b764' : 'var(--theme-text-2)',
                                }}>
                                {s === 'all' ? 'All' : s === 'active' ? 'Active' : 'Pending / Inactive'}
                            </button>
                        ))}
                    </div>
                    <div className="ml-auto text-xs" style={{ color: 'var(--theme-text-muted)' }}>
                        {therapists.total} therapist{therapists.total !== 1 ? 's' : ''}
                    </div>
                </div>

                {/* Table */}
                <div className="glass-card rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--theme-border)' }}>
                                    {['Therapist', 'Specialty', 'Rating', 'Zones', 'Shift', 'Status', ''].map(h => (
                                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                                            style={{ color: 'var(--theme-text-muted)' }}>
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {data.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-4 py-12 text-center text-sm" style={{ color: 'var(--theme-text-muted)' }}>
                                            No therapists found.
                                        </td>
                                    </tr>
                                ) : data.map((t, idx) => (
                                    <tr key={t.id}
                                        className="cursor-pointer transition-colors"
                                        style={{ borderTop: idx > 0 ? '1px solid var(--theme-border)' : 'none' }}
                                        onClick={() => setSelected(t)}
                                        onMouseEnter={e => e.currentTarget.style.background = 'var(--theme-btn-bg)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>

                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-3">
                                                <Avatar initials={t.avatar} flagged={t.is_flagged} />
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-1.5">
                                                        <p className="font-semibold truncate" style={{ color: 'var(--theme-text-head)' }}>{t.name}</p>
                                                        {t.is_flagged && (
                                                            <AlertTriangle size={12} style={{ color: '#ef4444', flexShrink: 0 }} />
                                                        )}
                                                    </div>
                                                    <p className="text-[11px] truncate" style={{ color: 'var(--theme-text-muted)' }}>{t.email}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-sm" style={{ color: 'var(--theme-text-2)' }}>
                                            {t.specialty ?? '—'}
                                        </td>
                                        <td className="px-4 py-3">
                                            <StarRating value={t.rating} />
                                        </td>
                                        <td className="px-4 py-3">
                                            {t.zones.length > 0 ? (
                                                <div className="flex flex-wrap gap-1">
                                                    {t.zones.slice(0, 2).map(z => (
                                                        <span key={z} className="inline-flex items-center gap-0.5 text-[10px] px-2 py-0.5 rounded-full"
                                                            style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-2)' }}>
                                                            <MapPin size={9} />{z}
                                                        </span>
                                                    ))}
                                                    {t.zones.length > 2 && (
                                                        <span className="text-[10px]" style={{ color: 'var(--theme-text-muted)' }}>+{t.zones.length - 2}</span>
                                                    )}
                                                </div>
                                            ) : <span className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>No zones</span>}
                                        </td>
                                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--theme-text-2)' }}>
                                            {t.shift_start && t.shift_end ? `${t.shift_start} – ${t.shift_end}` : '—'}
                                        </td>
                                        <td className="px-4 py-3">
                                            <StatusBadge isActive={t.is_active} isPending={!t.is_active} />
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <ChevronR size={14} style={{ color: 'var(--theme-text-muted)' }} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {last_page > 1 && (
                        <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: 'var(--theme-border)' }}>
                            <span className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>
                                Page {current_page} of {last_page}
                            </span>
                            <div className="flex gap-2">
                                <button onClick={() => goToPage(prev_page_url)} disabled={!prev_page_url}
                                    className="w-8 h-8 rounded-lg flex items-center justify-center border transition-all disabled:opacity-40"
                                    style={{ background: 'var(--theme-btn-bg)', borderColor: 'var(--theme-border)', color: 'var(--theme-text-2)' }}>
                                    <ChevronLeft size={14} />
                                </button>
                                <button onClick={() => goToPage(next_page_url)} disabled={!next_page_url}
                                    className="w-8 h-8 rounded-lg flex items-center justify-center border transition-all disabled:opacity-40"
                                    style={{ background: 'var(--theme-btn-bg)', borderColor: 'var(--theme-border)', color: 'var(--theme-text-2)' }}>
                                    <ChevronRight size={14} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Drawer */}
            {selected && (
                <TherapistDrawer
                    therapist={selected}
                    onClose={() => setSelected(null)}
                    onAction={(type, therapist) => {
                        setSelected(null);
                        setDialog({ type, therapist });
                    }}
                />
            )}

            {dialog && dialogConfig && (
                <ConfirmDialog
                    open={true}
                    title={dialogConfig.title}
                    message={dialogConfig.message}
                    confirmLabel={dialogConfig.confirmLabel}
                    confirmStyle={dialogConfig.confirmStyle}
                    onConfirm={handleConfirm}
                    onCancel={() => setDialog(null)}
                />
            )}
        </AdminLayout>
    );
}