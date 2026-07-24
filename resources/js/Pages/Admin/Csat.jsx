import { useState, useEffect, useCallback } from 'react';
import {
    Star, AlertTriangle, CheckCircle2, Users, MessageSquare,
    TrendingUp, ChevronRight, X, Loader2, Save, ShieldCheck,
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

// ── Star display ──────────────────────────────────────────────────────────────
function StarRating({ value, max = 5 }) {
    return (
        <div className="flex items-center gap-0.5">
            {Array.from({ length: max }).map((_, i) => (
                <Star
                    key={i}
                    size={13}
                    style={{
                        fill: i < Math.floor(value) ? '#e2b764' : 'transparent',
                        color: i < Math.ceil(value) ? '#e2b764' : 'var(--theme-border)',
                    }}
                />
            ))}
            <span className="text-xs ml-1 font-semibold" style={{ color: 'var(--theme-text-head)' }}>
                {Number(value).toFixed(1)}
            </span>
        </div>
    );
}

// ── CSAT Score badge ──────────────────────────────────────────────────────────
function CsatBadge({ score }) {
    const color = score >= 80 ? '#22c55e' : score >= 60 ? '#e2b764' : '#ef4444';
    const bg    = score >= 80 ? 'rgba(34,197,94,0.1)' : score >= 60 ? 'rgba(226,183,100,0.1)' : 'rgba(239,68,68,0.1)';
    const border = score >= 80 ? 'rgba(34,197,94,0.2)' : score >= 60 ? 'rgba(226,183,100,0.2)' : 'rgba(239,68,68,0.2)';
    return (
        <span
            className="text-xs font-bold px-2 py-0.5 rounded-full"
            style={{ background: bg, border: `1px solid ${border}`, color }}
        >
            {score}%
        </span>
    );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, color, sublabel }) {
    return (
        <div className="rounded-2xl p-4 glass-card-strong flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: `${color}18`, border: `1px solid ${color}30` }}>
                <Icon size={18} style={{ color }} />
            </div>
            <div>
                <div className="text-xl font-display font-bold" style={{ color: 'var(--theme-text-head)' }}>{value}</div>
                <div className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>{label}</div>
                {sublabel && <div className="text-[10px] mt-0.5" style={{ color: 'var(--theme-text-muted)', opacity: 0.7 }}>{sublabel}</div>}
            </div>
        </div>
    );
}

// ── Therapist Detail Drawer ───────────────────────────────────────────────────
function TherapistDrawer({ therapist, onClose, onFlagResolved }) {
    const [reviews, setReviews]   = useState([]);
    const [loading, setLoading]   = useState(true);
    const [noteId, setNoteId]     = useState(null);
    const [noteText, setNoteText] = useState('');
    const [saving, setSaving]     = useState(false);
    const [resolving, setResolving] = useState(false);

    useEffect(() => {
        if (!therapist) return;
        setLoading(true);
        apiFetch(`/admin/api/csat/therapist/${therapist.id}/reviews`)
            .then(setReviews)
            .finally(() => setLoading(false));
    }, [therapist]);

    if (!therapist) return null;

    const handleSaveNote = async (reviewId) => {
        setSaving(true);
        await apiFetch(`/admin/api/csat/review/${reviewId}/note`, {
            method: 'POST',
            body: JSON.stringify({ note: noteText }),
        });
        setReviews(prev => prev.map(r => r.id === reviewId ? { ...r, admin_note: noteText } : r));
        setNoteId(null);
        setNoteText('');
        setSaving(false);
    };

    const handleResolveFlag = async () => {
        setResolving(true);
        await apiFetch(`/admin/api/csat/therapist/${therapist.id}/resolve-flag`, { method: 'POST' });
        onFlagResolved(therapist.id);
        setResolving(false);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex">
            <button className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onClose} />
            <div
                className="absolute inset-y-0 right-0 w-full max-w-lg flex flex-col"
                style={{ background: 'var(--theme-notif-bg)', borderLeft: '1px solid var(--theme-border)' }}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--theme-border)' }}>
                    <div className="flex items-center gap-3">
                        <div
                            className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                            style={{ background: 'linear-gradient(135deg, #b7882a, #e2b764)', color: '#0b1120' }}
                        >
                            {therapist.initials}
                        </div>
                        <div>
                            <h2 className="text-sm font-display font-bold" style={{ color: 'var(--theme-text-head)' }}>
                                {therapist.name}
                            </h2>
                            <div className="flex items-center gap-2 mt-0.5">
                                <StarRating value={therapist.rating} />
                                <CsatBadge score={therapist.csat_score} />
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)' }}>
                        <X size={15} style={{ color: 'var(--theme-text-2)' }} />
                    </button>
                </div>

                {/* Flag banner */}
                {therapist.is_flagged && (
                    <div className="mx-4 mt-4 px-4 py-3 rounded-xl flex items-start gap-3"
                        style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                        <AlertTriangle size={16} style={{ color: '#ef4444', flexShrink: 0, marginTop: 2 }} />
                        <div className="flex-1">
                            <p className="text-xs font-semibold" style={{ color: '#ef4444' }}>
                                Flagged on {therapist.flagged_at}
                            </p>
                            <p className="text-xs mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>
                                {therapist.flag_reason}
                            </p>
                        </div>
                        <button
                            onClick={handleResolveFlag}
                            disabled={resolving}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0 disabled:opacity-60"
                            style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', color: '#22c55e' }}
                        >
                            {resolving ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                            Resolve
                        </button>
                    </div>
                )}

                {/* Reviews */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    <p className="text-[10px] font-semibold uppercase tracking-widest"
                        style={{ color: 'var(--theme-text-muted)', opacity: 0.7 }}>
                        {reviews.length} Customer Review{reviews.length !== 1 ? 's' : ''}
                    </p>

                    {loading ? (
                        <div className="flex justify-center py-12">
                            <Loader2 size={22} className="animate-spin" style={{ color: '#e2b764' }} />
                        </div>
                    ) : reviews.length === 0 ? (
                        <div className="text-center py-12">
                            <MessageSquare size={24} className="mx-auto mb-2" style={{ color: 'var(--theme-text-muted)', opacity: 0.3 }} />
                            <p className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>No reviews yet.</p>
                        </div>
                    ) : reviews.map(review => (
                        <div key={review.id} className="rounded-xl p-4"
                            style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)' }}>

                            {/* Review header */}
                            <div className="flex items-start justify-between gap-2 mb-2">
                                <div>
                                    <p className="text-xs font-semibold" style={{ color: 'var(--theme-text-head)' }}>
                                        {review.customer_name}
                                    </p>
                                    <p className="text-[10px]" style={{ color: 'var(--theme-text-muted)' }}>
                                        {review.created_at}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <StarRating value={review.therapist_rating} />
                                    <CsatBadge score={review.therapist_csat} />
                                </div>
                            </div>

                            {/* Comment */}
                            {review.comment && (
                                <p className="text-xs mb-3 leading-relaxed" style={{ color: 'var(--theme-text-2)' }}>
                                    "{review.comment}"
                                </p>
                            )}

                            {/* Admin note */}
                            {review.admin_note && noteId !== review.id && (
                                <div className="px-3 py-2 rounded-lg mb-2"
                                    style={{ background: 'rgba(226,183,100,0.08)', border: '1px solid rgba(226,183,100,0.15)' }}>
                                    <p className="text-[10px] font-semibold mb-0.5" style={{ color: '#e2b764' }}>
                                        Admin Note
                                    </p>
                                    <p className="text-xs" style={{ color: 'var(--theme-text-2)' }}>{review.admin_note}</p>
                                </div>
                            )}

                            {/* Note editor */}
                            {noteId === review.id ? (
                                <div className="space-y-2">
                                    <textarea
                                        value={noteText}
                                        onChange={e => setNoteText(e.target.value)}
                                        placeholder="Add coaching note..."
                                        rows={3}
                                        autoFocus
                                        className="w-full px-3 py-2 rounded-lg text-xs outline-none resize-none"
                                        style={{ background: 'var(--theme-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-head)' }}
                                    />
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleSaveNote(review.id)}
                                            disabled={saving || !noteText.trim()}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
                                            style={{ background: 'linear-gradient(135deg, #b7882a, #e2b764)', color: '#0b1120' }}
                                        >
                                            {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                                            Save Note
                                        </button>
                                        <button
                                            onClick={() => { setNoteId(null); setNoteText(''); }}
                                            className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                                            style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-2)' }}
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    onClick={() => { setNoteId(review.id); setNoteText(review.admin_note ?? ''); }}
                                    className="text-[10px] font-semibold"
                                    style={{ color: '#e2b764' }}
                                >
                                    {review.admin_note ? 'Edit note' : '+ Add coaching note'}
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ── Therapist Row ─────────────────────────────────────────────────────────────
function TherapistRow({ therapist, onSelect }) {
    return (
        <div
            className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-colors"
            style={{ background: 'var(--theme-btn-bg)', border: `1px solid ${therapist.is_flagged ? 'rgba(239,68,68,0.25)' : 'var(--theme-border)'}` }}
            onClick={() => onSelect(therapist)}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >
            {/* Avatar */}
            <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                style={{ background: therapist.is_flagged ? 'rgba(239,68,68,0.15)' : 'linear-gradient(135deg, #b7882a, #e2b764)', color: therapist.is_flagged ? '#ef4444' : '#0b1120' }}
            >
                {therapist.initials}
            </div>

            {/* Name + specialty */}
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--theme-text-head)' }}>
                        {therapist.name}
                    </p>
                    {therapist.is_flagged && (
                        <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full flex-shrink-0"
                            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
                            Flagged
                        </span>
                    )}
                </div>
                <p className="text-xs truncate" style={{ color: 'var(--theme-text-muted)' }}>
                    {therapist.specialty ?? 'Therapist'} · {therapist.review_count} review{therapist.review_count !== 1 ? 's' : ''}
                </p>
            </div>

            {/* Rating + CSAT */}
            <div className="flex items-center gap-2 flex-shrink-0">
                <StarRating value={therapist.rating} />
                <CsatBadge score={therapist.csat_score} />
            </div>

            <ChevronRight size={14} style={{ color: 'var(--theme-text-muted)', flexShrink: 0 }} />
        </div>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Csat() {
    const [overview, setOverview]     = useState(null);
    const [therapists, setTherapists] = useState([]);
    const [loading, setLoading]       = useState(true);
    const [selected, setSelected]     = useState(null);
    const [showAll, setShowAll]       = useState(false);

    const load = useCallback(() => {
        setLoading(true);
        const url = showAll ? '/admin/api/csat/all-therapists' : '/admin/api/csat/flagged-therapists';
        Promise.all([
            apiFetch('/admin/api/csat/overview'),
            apiFetch(url),
        ]).then(([ov, th]) => {
            setOverview(ov);
            setTherapists(th);
        }).finally(() => setLoading(false));
    }, [showAll]);

    useEffect(() => { load(); }, [showAll]);

    const handleFlagResolved = (therapistId) => {
        setTherapists(prev => prev.filter(t => t.id !== therapistId));
        apiFetch('/admin/api/csat/overview').then(setOverview);
    };

    return (
        <AdminLayout title="CSAT & Performance">
            <div className="space-y-5">

                {/* KPI Cards */}
                {overview && (
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <KpiCard icon={MessageSquare} label="Total Reviews"       value={overview.total_reviews}      color="#3b82f6" />
                        <KpiCard icon={Star}          label="Avg Therapist CSAT"  value={`${overview.avg_therapist_csat}%`} color="#e2b764"
                            sublabel={`${(overview.avg_therapist_csat / 20).toFixed(1)} stars`} />
                        <KpiCard icon={TrendingUp}    label="Avg Service CSAT"    value={`${overview.avg_service_csat}%`}  color="#22c55e"
                            sublabel={`${(overview.avg_service_csat / 20).toFixed(1)} stars`} />
                        <KpiCard icon={AlertTriangle} label="Flagged Therapists"  value={overview.flagged_therapists} color="#ef4444"
                            sublabel="Below 3.5 stars threshold" />
                    </div>
                )}

                {/* Threshold info */}
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl"
                    style={{ background: 'rgba(226,183,100,0.06)', border: '1px solid rgba(226,183,100,0.15)' }}>
                    <ShieldCheck size={14} style={{ color: '#e2b764', flexShrink: 0 }} />
                    <p className="text-xs" style={{ color: 'var(--theme-text-2)' }}>
                        Therapists are automatically flagged when their average rating drops below
                        <span className="font-semibold" style={{ color: '#e2b764' }}> 3.5 stars (70% CSAT)</span>.
                        Review their feedback below and add coaching notes as needed.
                    </p>
                </div>

                {/* Therapist list */}
                <div className="rounded-2xl glass-card-strong overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b"
                        style={{ borderColor: 'var(--theme-border)' }}>
                        <div className="flex items-center gap-2">
                            <Users size={15} style={{ color: '#e2b764' }} />
                            <span className="text-sm font-display font-bold" style={{ color: 'var(--theme-text-head)' }}>
                                {showAll ? 'All Therapists' : 'Flagged Therapists'}
                            </span>
                            {!showAll && overview?.flagged_therapists > 0 && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                                    style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                                    {overview.flagged_therapists} flagged
                                </span>
                            )}
                        </div>
                        <button
                            onClick={() => setShowAll(a => !a)}
                            className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                            style={{
                                background: showAll ? 'rgba(226,183,100,0.1)' : 'var(--theme-btn-bg)',
                                border: `1px solid ${showAll ? 'rgba(226,183,100,0.3)' : 'var(--theme-border)'}`,
                                color: showAll ? '#e2b764' : 'var(--theme-text-2)',
                            }}
                        >
                            {showAll ? 'Show Flagged Only' : 'View All Therapists'}
                        </button>
                    </div>

                    <div className="p-4 space-y-2">
                        {loading ? (
                            <div className="flex justify-center py-12">
                                <Loader2 size={24} className="animate-spin" style={{ color: '#e2b764' }} />
                            </div>
                        ) : therapists.length === 0 ? (
                            <div className="text-center py-12">
                                <CheckCircle2 size={28} className="mx-auto mb-2" style={{ color: '#22c55e', opacity: 0.6 }} />
                                <p className="text-sm font-semibold" style={{ color: 'var(--theme-text-head)' }}>
                                    No flagged therapists
                                </p>
                                <p className="text-xs mt-1" style={{ color: 'var(--theme-text-muted)' }}>
                                    All therapists are performing above the 3.5 star threshold.
                                </p>
                            </div>
                        ) : therapists.map(t => (
                            <TherapistRow key={t.id} therapist={t} onSelect={setSelected} />
                        ))}
                    </div>
                </div>
            </div>

            {/* Drawer */}
            {selected && (
                <TherapistDrawer
                    therapist={selected}
                    onClose={() => setSelected(null)}
                    onFlagResolved={handleFlagResolved}
                />
            )}
        </AdminLayout>
    );
}