import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Flag, X, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

// ── API helper ───────────────────────────────────────────────────────────
// Same CSRF/fetch convention already duplicated per-page across this app
// (see MyBookings.jsx / Therapist/Bookings.jsx) — kept self-contained here
// too, extended to preserve the response status and validation errors so
// the UI can branch on 403/409/422 instead of only a generic message.
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
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = new Error(body.message || `HTTP ${res.status}`);
        err.status = res.status;
        err.errors = body.errors ?? null;
        throw err;
    }
    return body;
}

// Server-owned category codes (App\Http\Controllers\ReportController /
// TherapistReportController — Mission #40B). The backend validates these
// exact strings; only the displayed label is role-aware.
const REASON_CODES = ['no_show', 'unprofessional_conduct', 'payment_dispute', 'safety_concern', 'other'];

const REASON_LABELS = {
    customer: {
        no_show:                'Therapist did not show up',
        unprofessional_conduct: 'Unprofessional conduct',
        payment_dispute:        'Payment dispute',
        safety_concern:         'Safety concern',
        other:                  'Other',
    },
    therapist: {
        no_show:                'Customer was not present',
        unprofessional_conduct: 'Unprofessional conduct',
        payment_dispute:        'Payment dispute',
        safety_concern:         'Safety concern',
        other:                  'Other',
    },
};

function reasonLabel(code, role) {
    return (REASON_LABELS[role] ?? REASON_LABELS.customer)[code] ?? code;
}

const STATUS_CONFIG = {
    pending:   { label: 'Under review', color: 'var(--theme-link)' },
    reviewed:  { label: 'Reviewed',     color: 'var(--theme-success)' },
    dismissed: { label: 'Dismissed',    color: 'var(--theme-text-muted)' },
};

/**
 * Shared Customer/Therapist "Report an Issue" modal (Mission #40C), built
 * on the booking-linked reporting endpoints from Mission #40B.
 *
 * `role` only picks the endpoint prefix (/api vs /therapist/api) — the
 * server independently re-derives booking ownership, reporter identity,
 * and the accused account from the booking itself (see
 * ReportSubmissionService::submit()). This component never sends or
 * displays reported_user_id, reporter_id, status overrides, reviewed_by,
 * or admin_note — the backend response contract already excludes all of
 * those except the read-only `status` the reporter is entitled to see.
 */
export default function ReportIssueModal({ bookingId, role, subjectLabel, onClose }) {
    const basePath = role === 'therapist' ? '/therapist/api' : '/api';
    const endpoint  = `${basePath}/bookings/${bookingId}/report`;

    const [loadingExisting, setLoadingExisting] = useState(true);
    const [existingReport,  setExistingReport]  = useState(null);
    const [reason,          setReason]          = useState(null);
    const [description,     setDescription]     = useState('');
    const [submitting,      setSubmitting]      = useState(false);
    const [error,           setError]           = useState(null);

    useEffect(() => {
        // Capture phase + stopPropagation: this modal can be opened from
        // inside a host modal that has its own bubble-phase Escape listener
        // (e.g. Therapist/Bookings.jsx's BookingModal drawer). Capture-phase
        // listeners on window always run before bubble-phase ones for the
        // same event, so Escape closes only this modal rather than also
        // closing the host underneath it.
        const handle = (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                onClose();
            }
        };
        window.addEventListener('keydown', handle, { capture: true });
        return () => window.removeEventListener('keydown', handle, { capture: true });
    }, [onClose]);

    // Pre-check for an existing report so the form never renders for a
    // booking already reported by this user — the server would reject a
    // second submission with 409 anyway, but this avoids showing a form
    // that can't succeed. A failure here (network blip, etc.) is swallowed
    // on purpose: the form still loads, and POST re-validates everything
    // (ownership + duplicate) authoritatively regardless.
    useEffect(() => {
        let cancelled = false;
        apiFetch(endpoint)
            .then(body => { if (!cancelled) setExistingReport(body.report ?? null); })
            .catch(() => {})
            .finally(() => { if (!cancelled) setLoadingExisting(false); });
        return () => { cancelled = true; };
    }, [endpoint]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!reason || submitting) return;

        setSubmitting(true);
        setError(null);
        try {
            const created = await apiFetch(endpoint, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ reason, description: description.trim() || undefined }),
            });
            setExistingReport(created);
        } catch (err) {
            if (err.status === 409) {
                // Another tab/session already filed one since this modal
                // loaded — refetch so the UI reflects the real state
                // instead of a stale "you can still submit" form.
                try {
                    const refreshed = await apiFetch(endpoint);
                    setExistingReport(refreshed.report);
                } catch {
                    setError('You have already reported this booking.');
                }
            } else if (err.status === 422) {
                setError(err.errors?.reason?.[0] ?? err.errors?.description?.[0] ?? 'Please check your submission and try again.');
            } else if (err.status === 403) {
                setError("You don't have access to report this booking.");
            } else {
                // Never surface the raw error/exception — generic, safe message only.
                setError('Something went wrong submitting your report. Please try again.');
            }
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 backdrop-blur-sm"
                style={{ background: 'rgba(0,0,0,0.75)' }}
                onClick={onClose}
            />

            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1,    y: 0  }}
                exit={{ opacity: 0,  scale: 0.95, y: 20  }}
                role="dialog"
                aria-modal="true"
                aria-labelledby="report-issue-title"
                className="relative w-full max-w-md rounded-2xl shadow-2xl z-10 overflow-hidden max-h-[90vh] flex flex-col"
                style={{ background: 'var(--theme-card)', border: '1px solid var(--theme-border)' }}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0"
                    style={{ borderColor: 'var(--theme-border)' }}>
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                            style={{ background: 'rgba(226,183,100,0.15)' }}>
                            <Flag size={15} style={{ color: 'var(--theme-link)' }} />
                        </div>
                        <h3 id="report-issue-title" className="font-display font-bold text-sm" style={{ color: 'var(--theme-text-head)' }}>
                            Report an Issue
                        </h3>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="p-1.5 rounded-lg transition-colors"
                        style={{ color: 'var(--theme-text-muted)' }}
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Scrollable body */}
                <div className="overflow-y-auto flex-1 p-5 space-y-4">
                    {loadingExisting ? (
                        <div className="flex items-center justify-center py-10">
                            <Loader2 size={20} className="animate-spin" style={{ color: 'var(--theme-text-muted)' }} />
                        </div>
                    ) : existingReport ? (
                        <ExistingReportPanel report={existingReport} role={role} />
                    ) : (
                        <form id="report-issue-form" onSubmit={handleSubmit} className="space-y-4">
                            <p className="text-xs" style={{ color: 'var(--theme-text-2)' }}>
                                This report concerns {subjectLabel}. Our Trust &amp; Safety team will review it —
                                submitting a report does not automatically restrict the other party's account.
                            </p>

                            <fieldset>
                                <legend className="text-xs font-medium mb-3" style={{ color: 'var(--theme-text-2)' }}>
                                    What happened? *
                                </legend>
                                <div className="grid grid-cols-1 gap-2">
                                    {REASON_CODES.map(code => {
                                        const isActive = reason === code;
                                        return (
                                            <label
                                                key={code}
                                                className="flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all cursor-pointer"
                                                style={{
                                                    borderColor: isActive ? 'rgba(226,183,100,0.5)' : 'var(--theme-border)',
                                                    background:  isActive ? 'rgba(226,183,100,0.08)' : 'var(--theme-btn-bg)',
                                                }}
                                            >
                                                <input
                                                    type="radio"
                                                    name="report-reason"
                                                    value={code}
                                                    checked={isActive}
                                                    onChange={() => setReason(code)}
                                                    className="sr-only"
                                                />
                                                <span
                                                    aria-hidden="true"
                                                    className="w-3.5 h-3.5 rounded-full border flex-shrink-0 flex items-center justify-center"
                                                    style={{ borderColor: isActive ? 'var(--theme-link)' : 'var(--theme-border)' }}
                                                >
                                                    {isActive && <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--theme-link)' }} />}
                                                </span>
                                                <span className="text-xs font-medium" style={{ color: isActive ? 'var(--theme-link)' : 'var(--theme-text-2)' }}>
                                                    {reasonLabel(code, role)}
                                                </span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </fieldset>

                            <div>
                                <label htmlFor="report-description" className="text-xs font-medium mb-2 block" style={{ color: 'var(--theme-text-2)' }}>
                                    Additional details (optional)
                                </label>
                                <textarea
                                    id="report-description"
                                    value={description}
                                    onChange={e => setDescription(e.target.value.slice(0, 1000))}
                                    maxLength={1000}
                                    rows={3}
                                    placeholder="Add any details that might help our team review this report..."
                                    className="w-full px-4 py-2.5 rounded-xl border text-sm focus:outline-none resize-none"
                                    style={{ background: 'var(--theme-btn-bg)', borderColor: 'var(--theme-border)', color: 'var(--theme-text-head)' }}
                                />
                                <p className="text-[10px] mt-1 text-right" style={{ color: 'var(--theme-text-muted)' }}>
                                    {description.length}/1000
                                </p>
                            </div>

                            {error && (
                                <div className="flex items-center gap-2 p-3 rounded-xl text-sm"
                                    style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--theme-danger)' }}>
                                    <AlertCircle size={14} className="flex-shrink-0" /> {error}
                                </div>
                            )}
                        </form>
                    )}
                </div>

                {/* ── Footer ── */}
                {!loadingExisting && (
                    <div className="px-5 pb-5 pt-3 border-t flex-shrink-0 flex gap-3"
                        style={{ borderColor: 'var(--theme-border)' }}>
                        {existingReport ? (
                            <button
                                type="button"
                                onClick={onClose}
                                className="w-full py-2.5 rounded-xl text-sm font-medium transition-colors"
                                style={{ background: 'var(--theme-btn-bg)', color: 'var(--theme-text-2)', border: '1px solid var(--theme-border)' }}
                            >
                                Close
                            </button>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    onClick={onClose}
                                    disabled={submitting}
                                    className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                                    style={{ background: 'var(--theme-btn-bg)', color: 'var(--theme-text-2)' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    form="report-issue-form"
                                    disabled={!reason || submitting}
                                    className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all"
                                    style={{
                                        background:  (!reason || submitting) ? 'var(--theme-btn-bg)' : 'rgba(226,183,100,0.15)',
                                        border:      '1px solid',
                                        borderColor: (!reason || submitting) ? 'var(--theme-border)' : 'rgba(226,183,100,0.4)',
                                        color:       (!reason || submitting) ? 'var(--theme-text-muted)' : 'var(--theme-link)',
                                        cursor:      (!reason || submitting) ? 'not-allowed' : 'pointer',
                                    }}
                                >
                                    {submitting ? <Loader2 size={14} className="animate-spin" /> : <Flag size={14} />}
                                    {submitting ? 'Submitting…' : 'Submit Report'}
                                </button>
                            </>
                        )}
                    </div>
                )}
            </motion.div>
        </div>
    );
}

function ExistingReportPanel({ report, role }) {
    const status = STATUS_CONFIG[report.status] ?? { label: report.status, color: 'var(--theme-text-muted)' };

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 rounded-xl"
                style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)' }}>
                <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(16,185,129,0.15)' }}>
                    <CheckCircle2 size={18} style={{ color: 'var(--theme-success)' }} />
                </div>
                <div>
                    <p className="text-sm font-bold" style={{ color: 'var(--theme-success)' }}>Report submitted</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>
                        Only one report is allowed per booking.
                    </p>
                </div>
            </div>

            <div className="rounded-xl p-4 space-y-2.5"
                style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)' }}>
                <div className="flex justify-between items-center">
                    <span className="text-[11px]" style={{ color: 'var(--theme-text-2)' }}>Category</span>
                    <span className="text-[11px] font-semibold" style={{ color: 'var(--theme-text-head)' }}>
                        {reasonLabel(report.reason, role)}
                    </span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-[11px]" style={{ color: 'var(--theme-text-2)' }}>Status</span>
                    <span className="text-[11px] font-semibold" style={{ color: status.color }}>{status.label}</span>
                </div>
                {report.description && (
                    <div className="pt-2.5 border-t" style={{ borderColor: 'var(--theme-border)' }}>
                        <p className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--theme-text-muted)' }}>
                            Your details
                        </p>
                        <p className="text-xs" style={{ color: 'var(--theme-text-2)' }}>{report.description}</p>
                    </div>
                )}
            </div>

            <p className="text-[11px]" style={{ color: 'var(--theme-text-muted)' }}>
                This does not automatically restrict the other party's account — our Trust &amp; Safety team
                reviews every report before any action is taken.
            </p>
        </div>
    );
}
