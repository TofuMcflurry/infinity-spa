import { useState } from 'react';
import { router, usePage } from '@inertiajs/react';
import AdminLayout from '@/Layouts/AdminLayout';
import {
    Search, CheckCircle, XCircle, UserMinus,
    ChevronLeft, ChevronRight, Star, MapPin
} from 'lucide-react';

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ isActive, isPending }) {
    if (isPending) {
        return (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full"
                style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.25)' }}>
                Pending
            </span>
        );
    }
    if (isActive) {
        return (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full"
                style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.25)' }}>
                Active
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full"
            style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }}>
            Inactive
        </span>
    );
}

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ initials }) {
    return (
        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0"
            style={{ background: 'rgba(226,183,100,0.15)', color: '#e2b764', border: '1px solid rgba(226,183,100,0.2)' }}>
            {initials}
        </div>
    );
}

// ── Confirm dialog ────────────────────────────────────────────────────────────
function ConfirmDialog({ open, title, message, confirmLabel, confirmStyle, onConfirm, onCancel }) {
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
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

export default function Therapists({ therapists, filters }) {
    const { props } = usePage();
    const flash = props.flash ?? {};

    // ── Local filter state ────────────────────────────────────────────────────
    const [search, setSearch]   = useState(filters?.search ?? '');
    const [status, setStatus]   = useState(filters?.status ?? 'all');

    // ── Confirm dialog state ──────────────────────────────────────────────────
    const [dialog, setDialog] = useState(null);
    // { type: 'approve'|'deactivate'|'reject', therapist }

    // ── Apply filters ─────────────────────────────────────────────────────────
    const applyFilters = (overrides = {}) => {
        router.get('/admin/therapists', {
            search: overrides.search  ?? search,
            status: overrides.status  ?? status,
        }, { preserveScroll: true, preserveState: true });
    };

    const handleSearchKeyDown = (e) => {
        if (e.key === 'Enter') applyFilters();
    };

    const handleStatusChange = (val) => {
        setStatus(val);
        applyFilters({ status: val });
    };

    // ── Actions ───────────────────────────────────────────────────────────────
    const handleConfirm = () => {
        if (!dialog) return;
        const { type, therapist } = dialog;
        setDialog(null);

        if (type === 'approve') {
            router.post(`/admin/therapists/${therapist.id}/approve`, {}, { preserveScroll: true });
        } else if (type === 'deactivate') {
            router.post(`/admin/therapists/${therapist.id}/deactivate`, {}, { preserveScroll: true });
        } else if (type === 'reject') {
            router.delete(`/admin/therapists/${therapist.id}`, {}, { preserveScroll: true });
        }
    };

    // ── Pagination ────────────────────────────────────────────────────────────
    const { data, current_page, last_page, prev_page_url, next_page_url } = therapists;

    const goToPage = (url) => {
        if (!url) return;
        router.get(url, {}, { preserveScroll: true, preserveState: true });
    };

    // ── Dialog configs ────────────────────────────────────────────────────────
    const dialogConfig = dialog ? {
        approve: {
            title:        'Approve Therapist',
            message:      `Approve ${dialog.therapist.name} and make them visible to customers?`,
            confirmLabel: 'Approve',
            confirmStyle: { background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' },
        },
        deactivate: {
            title:        'Deactivate Therapist',
            message:      `Deactivate ${dialog.therapist.name}? They will no longer appear in booking flow.`,
            confirmLabel: 'Deactivate',
            confirmStyle: { background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' },
        },
        reject: {
            title:        'Reject & Delete',
            message:      `Permanently delete ${dialog.therapist.name}'s account? This cannot be undone.`,
            confirmLabel: 'Delete',
            confirmStyle: { background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' },
        },
    }[dialog.type] : null;

    return (
        <AdminLayout title="Manage Therapists">

            {/* Flash message */}
            {flash.success && (
                <div className="mb-4 px-4 py-3 rounded-xl text-sm font-medium"
                    style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}>
                    {flash.success}
                </div>
            )}

            <div className="space-y-5">

                {/* ── Filters ── */}
                <div className="flex flex-wrap items-center gap-3">

                    {/* Search */}
                    <div className="relative flex-1 min-w-[200px] max-w-xs">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2"
                            style={{ color: 'var(--theme-text-muted)' }} />
                        <input
                            type="text"
                            placeholder="Search by name..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            onKeyDown={handleSearchKeyDown}
                            className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm border outline-none"
                            style={{
                                background:   'var(--theme-btn-bg)',
                                borderColor:  'var(--theme-border)',
                                color:        'var(--theme-text)',
                            }}
                        />
                    </div>

                    {/* Status filter */}
                    <div className="flex gap-1.5">
                        {['all', 'active', 'inactive'].map(s => (
                            <button key={s}
                                onClick={() => handleStatusChange(s)}
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

                    {/* Summary */}
                    <div className="ml-auto text-xs" style={{ color: 'var(--theme-text-muted)' }}>
                        {therapists.total} therapist{therapists.total !== 1 ? 's' : ''}
                    </div>
                </div>

                {/* ── Table ── */}
                <div className="glass-card rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--theme-border)' }}>
                                    {['Therapist', 'Specialty', 'Gender', 'Rating', 'Zones', 'Shift', 'Status', 'Actions'].map(h => (
                                        <th key={h}
                                            className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                                            style={{ color: 'var(--theme-text-muted)' }}>
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {data.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="px-4 py-12 text-center text-sm"
                                            style={{ color: 'var(--theme-text-muted)' }}>
                                            No therapists found.
                                        </td>
                                    </tr>
                                ) : data.map((t, idx) => {
                                    const isPending = !t.is_active;
                                    return (
                                        <tr key={t.id}
                                            style={{
                                                borderTop: idx > 0 ? '1px solid var(--theme-border)' : 'none',
                                                color: 'var(--theme-text)',
                                            }}>

                                            {/* Therapist */}
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-3">
                                                    <Avatar initials={t.avatar} />
                                                    <div className="min-w-0">
                                                        <p className="font-semibold truncate" style={{ color: 'var(--theme-text-head)' }}>
                                                            {t.name}
                                                        </p>
                                                        <p className="text-[11px] truncate" style={{ color: 'var(--theme-text-muted)' }}>
                                                            {t.email}
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Specialty */}
                                            <td className="px-4 py-3 text-sm" style={{ color: 'var(--theme-text-2)' }}>
                                                {t.specialty ?? '—'}
                                            </td>

                                            {/* Gender */}
                                            <td className="px-4 py-3 text-sm capitalize" style={{ color: 'var(--theme-text-2)' }}>
                                                {t.gender === 'male' ? '♂ Male' : '♀ Female'}
                                            </td>

                                            {/* Rating */}
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-1">
                                                    <Star size={12} style={{ color: '#e2b764', fill: '#e2b764' }} />
                                                    <span className="text-sm font-medium" style={{ color: 'var(--theme-text-head)' }}>
                                                        {Number(t.rating).toFixed(1)}
                                                    </span>
                                                </div>
                                            </td>

                                            {/* Zones */}
                                            <td className="px-4 py-3">
                                                {t.zones.length > 0 ? (
                                                    <div className="flex flex-wrap gap-1">
                                                        {t.zones.slice(0, 2).map(z => (
                                                            <span key={z}
                                                                className="inline-flex items-center gap-0.5 text-[10px] px-2 py-0.5 rounded-full"
                                                                style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-2)' }}>
                                                                <MapPin size={9} />
                                                                {z}
                                                            </span>
                                                        ))}
                                                        {t.zones.length > 2 && (
                                                            <span className="text-[10px]" style={{ color: 'var(--theme-text-muted)' }}>
                                                                +{t.zones.length - 2}
                                                            </span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>No zones</span>
                                                )}
                                            </td>

                                            {/* Shift */}
                                            <td className="px-4 py-3 text-xs" style={{ color: 'var(--theme-text-2)' }}>
                                                {t.shift_start && t.shift_end ? (
                                                    <>
                                                        <div>{t.shift_start} –</div>
                                                        <div>{t.shift_end}</div>
                                                        {t.day_off && (
                                                            <div className="text-[10px] mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>
                                                                Off: {t.day_off}
                                                            </div>
                                                        )}
                                                    </>
                                                ) : '—'}
                                            </td>

                                            {/* Status */}
                                            <td className="px-4 py-3">
                                                <StatusBadge isActive={t.is_active} isPending={isPending} />
                                            </td>

                                            {/* Actions */}
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-1.5">
                                                    {/* Pending → show Approve + Reject */}
                                                    {isPending && (
                                                        <>
                                                            <button
                                                                onClick={() => setDialog({ type: 'approve', therapist: t })}
                                                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all"
                                                                style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', borderColor: 'rgba(34,197,94,0.25)' }}
                                                                title="Approve">
                                                                <CheckCircle size={13} />
                                                                Approve
                                                            </button>
                                                            <button
                                                                onClick={() => setDialog({ type: 'reject', therapist: t })}
                                                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all"
                                                                style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', borderColor: 'rgba(239,68,68,0.25)' }}
                                                                title="Reject & Delete">
                                                                <XCircle size={13} />
                                                                Reject
                                                            </button>
                                                        </>
                                                    )}

                                                    {/* Active → show Deactivate */}
                                                    {t.is_active && (
                                                        <button
                                                            onClick={() => setDialog({ type: 'deactivate', therapist: t })}
                                                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all"
                                                            style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24', borderColor: 'rgba(251,191,36,0.25)' }}
                                                            title="Deactivate">
                                                            <UserMinus size={13} />
                                                            Deactivate
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* ── Pagination ── */}
                    {last_page > 1 && (
                        <div className="flex items-center justify-between px-4 py-3 border-t"
                            style={{ borderColor: 'var(--theme-border)' }}>
                            <span className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>
                                Page {current_page} of {last_page}
                            </span>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => goToPage(prev_page_url)}
                                    disabled={!prev_page_url}
                                    className="w-8 h-8 rounded-lg flex items-center justify-center border transition-all disabled:opacity-40"
                                    style={{ background: 'var(--theme-btn-bg)', borderColor: 'var(--theme-border)', color: 'var(--theme-text-2)' }}>
                                    <ChevronLeft size={14} />
                                </button>
                                <button
                                    onClick={() => goToPage(next_page_url)}
                                    disabled={!next_page_url}
                                    className="w-8 h-8 rounded-lg flex items-center justify-center border transition-all disabled:opacity-40"
                                    style={{ background: 'var(--theme-btn-bg)', borderColor: 'var(--theme-border)', color: 'var(--theme-text-2)' }}>
                                    <ChevronRight size={14} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Confirm Dialog ── */}
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