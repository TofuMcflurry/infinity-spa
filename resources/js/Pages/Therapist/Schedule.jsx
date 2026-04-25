import { useState, useEffect, useCallback } from 'react';
import { addDays, format, startOfWeek, getDay, parseISO, isToday } from 'date-fns';
import { cn } from '@/lib/utils';
import TherapistLayout from '@/Layouts/TherapistLayout';
import {
    ChevronLeft, ChevronRight, Plus, RefreshCw,
    Clock, AlertCircle, X, CalendarOff,
    BedDouble, Send, Info, Loader2,
} from 'lucide-react';

// ── CSRF + API ────────────────────────────────────────────────────────────────
function getCsrf() {
    const c = document.cookie.split('; ').find(r => r.startsWith('XSRF-TOKEN='));
    return c ? decodeURIComponent(c.split('=')[1]) : '';
}
async function api(url, opts = {}) {
    const isJson = opts.body && typeof opts.body === 'object';
    const res = await fetch(url, {
        ...opts,
        credentials: 'same-origin',
        headers: {
            Accept:              'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-XSRF-TOKEN':     getCsrf(),
            ...(isJson ? { 'Content-Type': 'application/json' } : {}),
            ...(opts.headers ?? {}),
        },
        body: isJson ? JSON.stringify(opts.body) : opts.body,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw data;
    return data;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const HOURS = Array.from({ length: 13 }, (_, i) => i + 9); // 9–21

const DAYS = [
    { dow: 1, short: 'Mon' },
    { dow: 2, short: 'Tue', isRest: true },
    { dow: 3, short: 'Wed' },
    { dow: 4, short: 'Thu' },
    { dow: 5, short: 'Fri' },
    { dow: 6, short: 'Sat' },
    { dow: 0, short: 'Sun' },
];

const TIME_OPTIONS = HOURS.map(h => ({
    value: `${String(h).padStart(2, '0')}:00`,
    label: h < 12 ? `${h}:00 AM` : h === 12 ? '12:00 PM' : `${h - 12}:00 PM`,
}));

const STATUS = {
    pending:   { label: 'Pending',   color: '#f59e0b', bg: 'rgba(245,158,11,0.18)',  dot: '#f59e0b' },
    accepted:  { label: 'Accepted',  color: '#10b981', bg: 'rgba(16,185,129,0.18)',  dot: '#10b981' },
    en_route:  { label: 'En Route',  color: '#3b82f6', bg: 'rgba(59,130,246,0.18)',  dot: '#3b82f6' },
    arrived:   { label: 'Arrived',   color: '#6366f1', bg: 'rgba(99,102,241,0.18)',  dot: '#6366f1' },
    completed: { label: 'Completed', color: '#6b7280', bg: 'rgba(114,107,128,0.18)', dot: '#6b7280' },
};

const REQ_STATUS = {
    pending:  { label: 'Pending',  bg: 'rgba(245,158,11,0.12)',  color: '#f59e0b' },
    approved: { label: 'Approved', bg: 'rgba(16,185,129,0.12)',  color: '#10b981' },
    rejected: { label: 'Rejected', bg: 'rgba(239,68,68,0.12)',   color: '#ef4444' },
};

// ── Toast ─────────────────────────────────────────────────────────────────────
function useToast() {
    const [toasts, setToasts] = useState([]);
    const add = useCallback((msg, type = 'success') => {
        const id = Date.now();
        setToasts(p => [...p, { id, msg, type }]);
        setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500);
    }, []);
    return { toasts, add };
}

function Toasts({ toasts }) {
    return (
        <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none">
            {toasts.map(t => (
                <div key={t.id}
                    className="px-4 py-3 rounded-xl text-sm font-medium shadow-xl"
                    style={{
                        background: t.type === 'error' ? 'rgba(239,68,68,0.95)' : 'rgba(16,185,129,0.95)',
                        color: '#fff',
                        backdropFilter: 'blur(12px)',
                    }}
                >
                    {t.msg}
                </div>
            ))}
        </div>
    );
}

// ── Modal wrapper ─────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
             style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
             onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="w-full max-w-md rounded-2xl p-6 bg-card border border-gold/20">
                <div className="flex items-center justify-between mb-5">
                    <h3 className="font-semibold text-foreground">{title}</h3>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
                        <X size={18} />
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}

// ── Input helpers ─────────────────────────────────────────────────────────────
const inputCls = "w-full rounded-lg px-3 py-2.5 text-sm bg-background border border-gold/20 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold/30 transition-colors";
const labelCls = "block text-xs font-semibold uppercase tracking-wider mb-1.5 text-gold" ;

function SubmitBtn({ loading, children }) {
    return (
        <button type="submit" disabled={loading}
            className="w-full py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all"
            style={{ background: 'linear-gradient(135deg,#c8a45d,#a07840)', color: '#000' }}>
            {loading ? <Loader2 size={15} className="animate-spin" /> : children}
        </button>
    );
}

// ── UNAVAILABLE MODAL ─────────────────────────────────────────────────────────
function UnavailableModal({ slot, onClose, onSaved, toast }) {
    const [form, setForm] = useState({
        is_full_day: false,
        reason: '',
    });
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const body = {
                date:        slot.date,
                is_full_day: form.is_full_day,
                start_time:  form.is_full_day ? null : `${String(slot.hour).padStart(2,'0')}:00`,
                end_time:    form.is_full_day ? null : `${String(slot.hour + 1).padStart(2,'0')}:00`,
                reason:      form.reason || null,
            };
            const data = await api('/therapist/api/unavailable', { method: 'POST', body });
            toast(data.message ?? 'Slot marked unavailable.');
            onSaved(data.slot);
            onClose();
        } catch (err) {
            toast(err?.message ?? 'Failed to save.', 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal title="Mark as Unavailable" onClose={onClose}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="rounded-lg p-3 text-sm bg-card border border-gold/15">
                    <div className="font-medium text-gold">{format(parseISO(slot.date), 'EEEE, d MMMM yyyy')}</div>
                    {!form.is_full_day && (
                        <div className="text-muted-foreground text-xs mt-0.5">
                            {TIME_OPTIONS.find(t => t.value === `${String(slot.hour).padStart(2,'0')}:00`)?.label}
                        </div>
                    )}
                </div>

                <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={form.is_full_day}
                        onChange={e => setForm(p => ({ ...p, is_full_day: e.target.checked }))}
                        className="w-4 h-4 accent-gold rounded" />
                    <span className="text-sm text-foreground">Mark entire day as unavailable</span>
                </label>

                <div>
                    <label className={labelCls}>Reason (optional)</label>
                    <input className={inputCls} placeholder="e.g. Personal appointment"
                        value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} />
                </div>

                <SubmitBtn loading={saving}>
                    <CalendarOff size={14} /> Mark Unavailable
                </SubmitBtn>
            </form>
        </Modal>
    );
}

// ── RESCHEDULE MODAL ──────────────────────────────────────────────────────────
function RescheduleModal({ booking, onClose, onSaved, toast }) {
    const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
    const maxDate  = format(addDays(new Date(), 30), 'yyyy-MM-dd');
    const [form, setForm] = useState({ date: '', time: '', reason: '' });
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.date || !form.time) return;
        setSaving(true);
        try {
            const data = await api('/therapist/api/reschedule-request', {
                method: 'POST',
                body: {
                    booking_id:     booking.id,
                    requested_date: form.date,
                    requested_time: form.time,
                    reason:         form.reason || null,
                },
            });
            toast(data.message ?? 'Reschedule request submitted.');
            onSaved();
            onClose();
        } catch (err) {
            toast(err?.message ?? 'Failed to submit.', 'error');
        } finally {
            setSaving(false);
        }
    };

    const st = STATUS[booking.status] ?? STATUS.pending;

    return (
        <Modal title="Request Reschedule" onClose={onClose}>
            <div className="rounded-lg p-3 mb-4 text-sm bg-card border border-border">
                <div className="font-medium text-foreground">{booking.service_name}</div>
                <div className="text-muted-foreground text-xs mt-0.5">{booking.customer_name} · {booking.date} {booking.start_time}</div>
                <span className="inline-block mt-1.5 text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: st.bg, color: st.color }}>{st.label}</span>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className={labelCls}>New Date *</label>
                    <input type="date" required min={tomorrow} max={maxDate}
                        className={inputCls} value={form.date}
                        onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
                </div>
                <div>
                    <label className={labelCls}>New Time *</label>
                    <select required className={inputCls} value={form.time}
                        onChange={e => setForm(p => ({ ...p, time: e.target.value }))}>
                        <option value="">Select time</option>
                        {TIME_OPTIONS.map(t => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className={labelCls}>Reason</label>
                    <textarea rows={2} className={inputCls} placeholder="Why do you need to reschedule?"
                        value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} />
                </div>

                <div className="flex items-start gap-2 p-3 rounded-lg text-xs bg-blue-500/10 border border-blue-500/20 text-blue-400">
                    <Info size={13} className="mt-0.5 shrink-0" />
                    <span>
                        This request will be sent to admin for approval. The booking remains unchanged until approved.
                    </span>
                </div>

                <SubmitBtn loading={saving}>
                    <Send size={14} /> Submit Request
                </SubmitBtn>
            </form>
        </Modal>
    );
}

// ── REST DAY MODAL ────────────────────────────────────────────────────────────
function RestDayModal({ onClose, onSaved, toast }) {
    const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
    const maxDate  = format(addDays(new Date(), 60), 'yyyy-MM-dd');
    const [form, setForm] = useState({ date: '', reason: '' });
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.date || !form.reason.trim()) return;
        setSaving(true);
        try {
            const data = await api('/therapist/api/rest-day-request', {
                method: 'POST',
                body: { requested_date: form.date, reason: form.reason },
            });
            toast(data.message ?? 'Rest day request submitted.');
            onSaved();
            onClose();
        } catch (err) {
            toast(err?.message ?? 'Failed to submit.', 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal title="Request Rest Day" onClose={onClose}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className={labelCls}>Date *</label>
                    <input type="date" required min={tomorrow} max={maxDate}
                        className={inputCls} value={form.date}
                        onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
                    <p className="mt-1 text-xs text-muted-foreground">
                        Tuesday is already a rest day. Requests for other days need admin approval.
                    </p>
                </div>
                <div>
                    <label className={labelCls}>Reason *</label>
                    <textarea rows={3} required className={inputCls} placeholder="Why do you need this day off?"
                        value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} />
                </div>

                <SubmitBtn loading={saving}>
                    <BedDouble size={14} /> Submit Request
                </SubmitBtn>
            </form>
        </Modal>
    );
}

// ── REST DAY REQUESTS LIST ────────────────────────────────────────────────────
function RestDayRequestsList({ requests }) {
    if (!requests.length) {
        return (
            <p className="text-sm py-4 text-center text-muted-foreground">
                No rest day requests yet.
            </p>
        );
    }
    return (
        <div className="space-y-2">
            {requests.map(r => {
                const s = REQ_STATUS[r.status] ?? REQ_STATUS.pending;
                return (
                    <div key={r.id} className="flex items-center gap-3 py-2.5 px-3 rounded-xl bg-card border border-border">
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-foreground">
                                {format(parseISO(r.requested_date), 'EEEE, d MMM yyyy')}
                            </div>
                            <div className="text-xs mt-0.5 truncate text-muted-foreground">
                                {r.reason}
                            </div>
                            {r.admin_notes && (
                                <div className="text-xs mt-1 text-blue-400">
                                    Admin: {r.admin_notes}
                                </div>
                            )}
                        </div>
                        <span className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full"
                            style={{ background: s.bg, color: s.color }}>
                            {s.label}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

// ── BOOKING CELL ──────────────────────────────────────────────────────────────
function BookingCell({ booking, onClick }) {
    const s = STATUS[booking.status] ?? STATUS.pending;
    return (
        <button onClick={onClick} className="w-full h-full text-left px-1.5 py-1 rounded-lg transition-all hover:brightness-110 active:scale-95"
            style={{ background: s.bg, border: `1px solid ${s.color}33` }}>
            <div className="flex items-center gap-1 mb-0.5">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: s.dot }} />
                <span className="text-[10px] font-semibold truncate" style={{ color: s.color }}>{s.label}</span>
            </div>
            <div className="text-[11px] font-medium text-foreground leading-tight truncate">{booking.customer_name}</div>
            <div className="text-[10px] leading-tight truncate text-muted-foreground">{booking.service_name}</div>
        </button>
    );
}

// ── UNAVAILABLE CELL ──────────────────────────────────────────────────────────
function UnavailableCell({ slot, onRemove }) {
    return (
        <div className="w-full h-full px-1.5 py-1 rounded-lg relative group"
             style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)' }}>
            <div className="flex items-center gap-1">
                <CalendarOff size={9} style={{ color: '#ef4444' }} className="shrink-0" />
                <span className="text-[10px] font-semibold" style={{ color: '#ef4444' }}>Unavailable</span>
            </div>
            {slot.reason && (
                <div className="text-[10px] mt-0.5 truncate text-muted-foreground">{slot.reason}</div>
            )}
            <button onClick={onRemove}
                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded"
                style={{ color: '#ef4444' }}
                title="Remove">
                <X size={10} />
            </button>
        </div>
    );
}

// ── EMPTY CELL ────────────────────────────────────────────────────────────────
function EmptyCell({ onClick }) {
    return (
        <button onClick={onClick}
            className="w-full h-full flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity group rounded-lg"
            style={{ border: '1px dashed transparent' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(200,164,93,0.3)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}>
            <Plus size={12} style={{ color: 'rgba(200,164,93,0.6)' }} />
        </button>
    );
}

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────
export default function Schedule() {
    const { toasts, add: addToast } = useToast();

    const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
    const [data, setData]           = useState({ bookings: [], unavailable_slots: [], rest_day_requests: [] });
    const [loading, setLoading]     = useState(true);

    // Modal states
    const [unavailModal, setUnavailModal]       = useState(null); // { date, hour }
    const [rescheduleModal, setRescheduleModal] = useState(null); // booking obj
    const [restDayModal, setRestDayModal]       = useState(false);
    const [showRequests, setShowRequests]       = useState(false);

    const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

    const fetchSchedule = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api(`/therapist/api/schedule?week_start=${format(weekStart, 'yyyy-MM-dd')}`);
            setData(res);
        } catch {
            addToast('Failed to load schedule.', 'error');
        } finally {
            setLoading(false);
        }
    }, [weekStart]);

    useEffect(() => { fetchSchedule(); }, [fetchSchedule]);

    // ── Cell data lookup ──────────────────────────────────────────────────────
    const getBooking = (date, hour) => {
        const d = format(date, 'yyyy-MM-dd');
        const h = String(hour).padStart(2, '0');
        return data.bookings.find(b => b.date === d && b.start_time.startsWith(h));
    };

    const getUnavailable = (date, hour) => {
        const d    = format(date, 'yyyy-MM-dd');
        const hNum = hour;
        return data.unavailable_slots.find(s => {
            if (s.date !== d) return false;
            if (s.is_full_day) return true;
            const start = parseInt(s.start_time);
            const end   = parseInt(s.end_time);
            return hNum >= start && hNum < end;
        });
    };

    // ── Actions ───────────────────────────────────────────────────────────────
    const removeUnavailable = async (slotId) => {
        if (!confirm('Remove this unavailable slot?')) return;
        try {
            await api(`/therapist/api/unavailable/${slotId}`, { method: 'DELETE' });
            addToast('Slot removed.');
            setData(p => ({ ...p, unavailable_slots: p.unavailable_slots.filter(s => s.id !== slotId) }));
        } catch (err) {
            addToast(err?.message ?? 'Failed to remove.', 'error');
        }
    };

    const formatHour = (h) => {
        if (h < 12) return `${h}:00 AM`;
        if (h === 12) return '12:00 PM';
        return `${h - 12}:00 PM`;
    };

    const pendingRequests = data.rest_day_requests.filter(r => r.status === 'pending').length;

    // ── RENDER ────────────────────────────────────────────────────────────────
    return (
        <TherapistLayout title="My Schedule">
            <div className="max-w-7xl mx-auto px-1 sm:px-2 md:px-4 py-3">
                <Toasts toasts={toasts} />

                {/* ── Header ── */}
                <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                    <div>
                        <h1 className="text-xl font-display font-bold text-foreground">My Schedule</h1>
                        <p className="text-sm mt-0.5 text-muted-foreground">
                            {format(weekStart, 'd MMM')} — {format(addDays(weekStart, 6), 'd MMM yyyy')}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <button onClick={fetchSchedule}
                            className="p-2 rounded-lg transition-colors hover:bg-foreground/5 text-muted-foreground">
                            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                        </button>
                        <button
                            onClick={() => setShowRequests(p => !p)}
                            className={cn(
                                "flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all border",
                                showRequests
                                    ? "bg-gold/15 border-gold/30 text-gold"
                                    : "bg-foreground/5 border-border text-foreground/70"
                            )}>
                            <Clock size={14} />
                            Rest Requests
                            {pendingRequests > 0 && (
                                <span className="ml-1 w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center"
                                    style={{ background: '#f59e0b', color: '#000' }}>
                                    {pendingRequests}
                                </span>
                            )}
                        </button>
                        <button
                            onClick={() => setRestDayModal(true)}
                            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all"
                            style={{
                                background: 'linear-gradient(135deg,rgba(200,164,93,0.2),rgba(160,120,64,0.2))',
                                border: '1px solid rgba(200,164,93,0.3)',
                                color: '#c8a45d',
                            }}>
                            <BedDouble size={14} />
                            Request Rest Day
                        </button>
                    </div>
                </div>

                {/* ── Rest Day Requests Panel ── */}
                {showRequests && (
                    <div className="mb-5 rounded-2xl p-5 bg-card border border-border">
                        <h3 className="text-sm font-semibold text-foreground mb-3">Rest Day Requests</h3>
                        <RestDayRequestsList requests={data.rest_day_requests} />
                    </div>
                )}

                {/* ── Week Navigation ── */}
                <div className="flex items-center justify-between mb-3">
                    <button
                        onClick={() => setWeekStart(p => addDays(p, -7))}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm transition-all hover:bg-foreground/5 text-muted-foreground border border-border">
                        <ChevronLeft size={15} /> Prev Week
                    </button>

                    <button
                        onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all hover:bg-foreground/5 text-gold border border-gold/20">
                        This Week
                    </button>

                    <button
                        onClick={() => setWeekStart(p => addDays(p, 7))}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm transition-all hover:bg-foreground/5 text-muted-foreground border border-border">
                        Next Week <ChevronRight size={15} />
                    </button>
                </div>

                {/* ── Status Legend ── */}
                <div className="flex flex-wrap items-center gap-3 mb-4">
                    {Object.entries(STATUS).map(([key, s]) => (
                        <div key={key} className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full" style={{ background: s.dot }} />
                            <span className="text-xs text-muted-foreground">{s.label}</span>
                        </div>
                    ))}
                    <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ background: '#ef4444' }} />
                        <span className="text-xs text-muted-foreground">Unavailable</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-foreground/20" />
                        <span className="text-xs text-muted-foreground">Rest Day (Tue)</span>
                    </div>
                </div>

                {/* ── Calendar Grid ── */}
                <div className="rounded-2xl overflow-hidden border border-border/30">
                    <div className="overflow-x-auto">
                        <div style={{ minWidth: '720px' }}>

                            {/* Day Headers */}
                            <div className="grid" style={{ gridTemplateColumns: '64px repeat(7, 1fr)' }}>
                                <div className="p-2 bg-background" />
                                {DAYS.map((day, idx) => {
                                    const date    = weekDates[idx];
                                    const today   = isToday(date);
                                    const isTue   = day.isRest;
                                    return (
                                        <div key={day.dow}
                                            className={cn("p-2 text-center border-l border-border/20",
                                            isTue ? 'bg-muted/30' : today ? 'bg-gold/[0.07]' : 'bg-background'
                                        )}>
                                            <div className="text-xs font-semibold text-muted-foreground">
                                                {day.short}
                                            </div>
                                            <div className={cn("text-sm font-bold mt-0.5", isTue ? 'text-muted-foreground' : today ? 'text-gold' : 'text-foreground')}>
                                                {format(date, 'd')}
                                            </div>
                                            {isTue && (
                                                <div className="text-[9px] mt-0.5 font-medium text-muted-foreground">REST</div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Time Rows */}
                            {HOURS.map(hour => (
                                <div key={hour} className="grid border-t border-border/20" style={{
                                    gridTemplateColumns: '64px repeat(7, 1fr)',
                                    minHeight: '60px',
                                }}>
                                    {/* Hour Label */}
                                    <div className="flex items-center justify-end pr-3 text-[11px] font-medium shrink-0 text-muted-foreground bg-background">
                                        {formatHour(hour)}
                                    </div>

                                    {/* Day Cells */}
                                    {DAYS.map((day, idx) => {
                                        const date    = weekDates[idx];
                                        const isTue   = day.isRest;
                                        const today   = isToday(date);
                                        const booking = !isTue ? getBooking(date, hour) : null;
                                        const unavail = !isTue ? getUnavailable(date, hour) : null;

                                        return (
                                            <div key={day.dow}
                                                className={cn("border-l p-1 relative border-border/20",
                                                    isTue ? 'bg-foreground/[0.015]' : today ? 'bg-gold/[0.025]' : ''
                                                )}>
                                                {isTue ? (
                                                    <div className="w-full h-full flex items-center justify-center opacity-30">
                                                        <span className="text-[9px] font-medium text-muted-foreground">—</span>
                                                    </div>
                                                ) : booking ? (
                                                    <BookingCell
                                                        booking={booking}
                                                        onClick={() => setRescheduleModal(booking)}
                                                    />
                                                ) : unavail ? (
                                                    <UnavailableCell
                                                        slot={unavail}
                                                        onRemove={() => removeUnavailable(unavail.id)}
                                                    />
                                                ) : (
                                                    <EmptyCell
                                                        onClick={() => setUnavailModal({ date: format(date, 'yyyy-MM-dd'), hour })}
                                                    />
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Loading overlay */}
                {loading && (
                    <div className="flex justify-center py-8">
                        <Loader2 className="animate-spin" style={{ color: '#c8a45d' }} size={22} />
                    </div>
                )}

                {/* ── Instruction hint ── */}
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                    <AlertCircle size={12} />
                    <span>Click an empty slot to mark unavailable · Click a booking to request reschedule</span>
                </div>

                {/* ── Modals ── */}
                {unavailModal && (
                    <UnavailableModal
                        slot={unavailModal}
                        onClose={() => setUnavailModal(null)}
                        toast={addToast}
                        onSaved={(slot) => setData(p => ({ ...p, unavailable_slots: [...p.unavailable_slots, slot] }))}
                    />
                )}
                {rescheduleModal && (
                    <RescheduleModal
                        booking={rescheduleModal}
                        onClose={() => setRescheduleModal(null)}
                        toast={addToast}
                        onSaved={fetchSchedule}
                    />
                )}
                {restDayModal && (
                    <RestDayModal
                        onClose={() => setRestDayModal(false)}
                        toast={addToast}
                        onSaved={fetchSchedule}
                    />
                )}
            </div>
        </TherapistLayout>
    );
}