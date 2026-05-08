import { useState } from 'react';
import { router } from '@inertiajs/react';
import { motion, AnimatePresence } from 'framer-motion';
import AdminLayout from '@/Layouts/AdminLayout';
import { 
    Check, X, CircleCheck, Mail, UserPlus, Clock, Archive, 
    AlertCircle, Eye, ChevronRight, Loader2, Calendar, 
    MapPin, Phone, Sparkles, Trash2, Send
} from 'lucide-react';
import { fmtDateTimeAdmin } from '@/lib/utils';

// ── Status Badge ──────────────────────────────────────────────────────────
function StatusBadge({ status }) {
    const config = {
        pending:   { label: 'Pending',     bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)', color: '#f59e0b' },
        accepted:  { label: 'Accepted',    bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.3)',  color: '#22c55e' },
        completed: { label: 'Completed',   bg: 'rgba(99,102,241,0.12)', border: 'rgba(99,102,241,0.3)', color: '#6366f1' },
        rejected:  { label: 'Rejected',    bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.3)',  color: '#ef4444' },
    };
    const s = config[status] || { label: status, bg: 'rgba(100,116,139,0.12)', border: 'rgba(100,116,139,0.3)', color: '#94a3b8' };
    
    return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
            style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.color }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
            {s.label}
        </span>
    );
}

// ── Stat Card ──────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color, onClick }) {
    return (
        <div 
            onClick={onClick}
            className="rounded-2xl p-5 glass-card transition-all cursor-pointer hover:scale-105"
            style={{ background: 'var(--theme-card)', border: '1px solid var(--theme-border)' }}
        >
            <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
                    style={{ background: `${color}15`, border: `1px solid ${color}30` }}>
                    <Icon size={18} style={{ color }} />
                </div>
                <div>
                    <p className="text-xs uppercase tracking-wider font-medium" style={{ color: 'var(--theme-text-muted)' }}>{label}</p>
                    <p className="mt-1 text-2xl font-display font-bold" style={{ color: 'var(--theme-text-head)' }}>{value}</p>
                </div>
            </div>
        </div>
    );
}

// ── Action Button ─────────────────────────────────────────────────────────
function ActionBtn({ onClick, variant, icon: Icon, label, disabled, loading }) {
    const variants = {
        approve: { bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.35)', text: '#22c55e', hover: 'rgba(34,197,94,0.2)' },
        reject:  { bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.35)',  text: '#ef4444', hover: 'rgba(239,68,68,0.2)'  },
        complete:{ bg: 'rgba(99,102,241,0.12)', border: 'rgba(99,102,241,0.35)', text: '#6366f1', hover: 'rgba(99,102,241,0.2)' },
        promo:   { bg: 'rgba(226,183,100,0.12)',border: 'rgba(226,183,100,0.35)',text: '#e2b764', hover: 'rgba(226,183,100,0.2)'},
    };
    const v = variants[variant] || variants.approve;
    
    return (
        <button
            type="button"
            disabled={disabled || loading}
            onClick={onClick}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold border transition-all disabled:opacity-40"
            style={{ background: v.bg, borderColor: v.border, color: v.text }}
            onMouseEnter={e => e.currentTarget.style.background = v.hover}
            onMouseLeave={e => e.currentTarget.style.background = v.bg}
        >
            {loading ? <Loader2 size={11} className="animate-spin" /> : <Icon size={11} />}
            {label}
        </button>
    );
}

// ── Rejection Modal ───────────────────────────────────────────────────────
function RejectionModal({ booking, onClose, onConfirm, loading }) {
    const [reason, setReason] = useState('');
    const [selectedReason, setSelectedReason] = useState('');

    const commonReasons = [
        'Invalid payment proof',
        'Service not available',
        'Therapist unavailable',
        'Customer requested cancellation',
        'Duplicate booking',
        'Incomplete information',
    ];

    const handleConfirm = () => {
        const finalReason = selectedReason || reason;
        if (!finalReason.trim()) {
            alert('Please provide a reason for rejection');
            return;
        }
        onConfirm(booking.id, finalReason);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0"
                style={{ background: 'rgba(0,0,0,0.75)' }}
                onClick={onClose}
            />
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-md rounded-2xl overflow-hidden"
                style={{ background: 'var(--theme-card)', border: '1px solid var(--theme-border)' }}
            >
                <div className="p-5 border-b" style={{ borderColor: 'var(--theme-border)' }}>
                    <div className="flex items-center gap-2">
                        <AlertCircle size={18} style={{ color: '#ef4444' }} />
                        <h3 className="text-lg font-semibold" style={{ color: 'var(--theme-text-head)' }}>Reject Booking</h3>
                    </div>
                    <p className="text-sm mt-1" style={{ color: 'var(--theme-text-muted)' }}>
                        Booking for <span className="font-semibold text-white">{booking?.guest_name}</span>
                    </p>
                </div>
                
                <div className="p-5 space-y-4">
                    <div>
                        <label className="text-xs font-semibold uppercase tracking-wider mb-2 block" style={{ color: 'var(--theme-text-muted)' }}>
                            Reason for Rejection
                        </label>
                        <select
                            value={selectedReason}
                            onChange={(e) => setSelectedReason(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl text-sm outline-none mb-3"
                            style={{ background: 'var(--theme-input-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text)' }}
                        >
                            <option value="">Select a common reason...</option>
                            {commonReasons.map(r => (
                                <option key={r} value={r}>{r}</option>
                            ))}
                        </select>
                        <textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Or type custom reason..."
                            rows="3"
                            className="w-full px-3 py-2 rounded-xl text-sm outline-none resize-none"
                            style={{ background: 'var(--theme-input-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text)' }}
                        />
                    </div>
                </div>
                
                <div className="flex gap-3 p-5 border-t" style={{ borderColor: 'var(--theme-border)' }}>
                    <button
                        onClick={onClose}
                        className="flex-1 py-2.5 rounded-xl text-sm font-medium transition"
                        style={{ background: 'var(--theme-btn-bg)', color: 'var(--theme-text-2)', border: '1px solid var(--theme-border)' }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={loading}
                        className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition"
                        style={{ background: '#dc2626', color: 'white' }}
                    >
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                        Confirm Rejection
                    </button>
                </div>
            </motion.div>
        </div>
    );
}

// ── Booking Card (for active bookings) ─────────────────────────────────────
function ActiveBookingCard({ booking, onApprove, onReject, onComplete, loading }) {
    const fmtDate = fmtDateTimeAdmin;
    
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-2xl p-5 border transition-all hover:border-opacity-50"
            style={{ background: 'var(--theme-card)', borderColor: 'var(--theme-border)' }}
        >
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                {/* Left - Guest Info */}
                <div className="flex-1">
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{ background: 'linear-gradient(135deg, #b7882a, #e2b764)' }}>
                            <UserPlus size={16} style={{ color: '#0b1120' }} />
                        </div>
                        <div>
                            <h4 className="font-semibold text-base" style={{ color: 'var(--theme-text-head)' }}>{booking.guest_name}</h4>
                            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                                <span className="text-xs flex items-center gap-1" style={{ color: 'var(--theme-text-muted)' }}>
                                    <Mail size={10} /> {booking.guest_email}
                                </span>
                                <span className="text-xs flex items-center gap-1" style={{ color: 'var(--theme-text-muted)' }}>
                                    <Phone size={10} /> {booking.guest_phone}
                                </span>
                            </div>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-3 border-t" style={{ borderColor: 'var(--theme-border)' }}>
                        <div>
                            <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--theme-text-muted)' }}>Service</p>
                            <p className="text-sm font-medium mt-0.5" style={{ color: 'var(--theme-text-head)' }}>{booking.service?.name ?? booking.service_name}</p>
                        </div>
                        <div>
                            <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--theme-text-muted)' }}>Date & Time</p>
                            <p className="text-sm font-medium mt-0.5" style={{ color: 'var(--theme-text-head)' }}>{fmtDate(booking.scheduled_start)}</p>
                        </div>
                        <div>
                            <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--theme-text-muted)' }}>Location</p>
                            <p className="text-sm font-medium mt-0.5 truncate" style={{ color: 'var(--theme-text-head)' }}>{booking.location?.split(',')[0]}</p>
                        </div>
                        <div>
                            <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--theme-text-muted)' }}>Status</p>
                            <div className="mt-0.5"><StatusBadge status={booking.status} /></div>
                        </div>
                    </div>
                </div>
                
                {/* Right - Actions */}
                <div className="flex flex-wrap items-center gap-2">
                    {booking.status === 'pending' && (
                        <>
                            <ActionBtn
                                variant="approve"
                                icon={Check}
                                label="Approve"
                                onClick={() => onApprove(booking.id)}
                                loading={loading[`approve-${booking.id}`]}
                            />
                            <ActionBtn
                                variant="reject"
                                icon={X}
                                label="Reject"
                                onClick={() => onReject(booking)}
                                loading={loading[`reject-${booking.id}`]}
                            />
                        </>
                    )}
                    {booking.status === 'accepted' && (
                        <>
                            <ActionBtn
                                variant="complete"
                                icon={CircleCheck}
                                label="Mark Completed"
                                onClick={() => onComplete(booking.id)}
                                loading={loading[`complete-${booking.id}`]}
                            />
                            <ActionBtn
                                variant="reject"
                                icon={X}
                                label="Reject"
                                onClick={() => onReject(booking)}
                                loading={loading[`reject-${booking.id}`]}
                            />
                        </>
                    )}
                </div>
            </div>
        </motion.div>
    );
}

// ── Completed Booking Card ─────────────────────────────────────────────────
function CompletedBookingCard({ booking, onSendPromo, loading }) {
    const fmtDate = fmtDateTimeAdmin;
    
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-2xl p-5 border transition-all"
            style={{ background: 'var(--theme-card)', borderColor: 'var(--theme-border)' }}
        >
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex-1">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{ background: 'rgba(99,102,241,0.15)' }}>
                            <Sparkles size={16} style={{ color: '#6366f1' }} />
                        </div>
                        <div>
                            <h4 className="font-semibold text-base" style={{ color: 'var(--theme-text-head)' }}>{booking.guest_name}</h4>
                            <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>{booking.guest_email}</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-4 mt-3">
                        <div>
                            <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--theme-text-muted)' }}>Service</p>
                            <p className="text-sm font-medium" style={{ color: 'var(--theme-text-head)' }}>{booking.service?.name ?? booking.service_name}</p>
                        </div>
                        <div>
                            <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--theme-text-muted)' }}>Completed</p>
                            <p className="text-sm font-medium" style={{ color: 'var(--theme-text-head)' }}>{fmtDate(booking.updated_at)}</p>
                        </div>
                    </div>
                </div>
                <ActionBtn
                    variant="promo"
                    icon={Send}
                    label="Send Promo Email"
                    onClick={() => onSendPromo(booking.id)}
                    loading={loading[`promo-${booking.id}`]}
                />
            </div>
        </motion.div>
    );
}

// ── Rejected Booking Card ──────────────────────────────────────────────────
function RejectedBookingCard({ booking }) {
    const fmtDate = fmtDateTimeAdmin;
    
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl p-5 border opacity-80"
            style={{ background: 'var(--theme-card)', borderColor: 'rgba(239,68,68,0.3)' }}
        >
            <div className="flex flex-col md:flex-row md:items-start gap-4">
                <div className="flex-1">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{ background: 'rgba(239,68,68,0.15)' }}>
                            <Trash2 size={16} style={{ color: '#ef4444' }} />
                        </div>
                        <div>
                            <h4 className="font-semibold text-base" style={{ color: 'var(--theme-text-head)' }}>{booking.guest_name}</h4>
                            <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>{booking.guest_email}</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                        <div>
                            <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--theme-text-muted)' }}>Service</p>
                            <p className="text-sm" style={{ color: 'var(--theme-text-2)' }}>{booking.service?.name ?? booking.service_name}</p>
                        </div>
                        <div>
                            <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--theme-text-muted)' }}>Date</p>
                            <p className="text-sm" style={{ color: 'var(--theme-text-2)' }}>{fmtDate(booking.scheduled_start)}</p>
                        </div>
                        <div className="col-span-2">
                            <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--theme-text-muted)' }}>Rejection Reason</p>
                            <p className="text-sm" style={{ color: '#ef4444' }}>{booking.rejection_reason || 'No reason provided'}</p>
                        </div>
                    </div>
                </div>
                <div>
                    <p className="text-xs whitespace-nowrap" style={{ color: 'var(--theme-text-muted)' }}>
                        Rejected: {fmtDate(booking.updated_at)}
                    </p>
                </div>
            </div>
        </motion.div>
    );
}

// ── Empty State ────────────────────────────────────────────────────────────
function EmptyState({ title, message, icon: Icon }) {
    return (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(226,183,100,0.08)', border: '1px solid rgba(226,183,100,0.15)' }}>
                <Icon size={24} style={{ color: '#e2b764' }} />
            </div>
            <div className="text-center">
                <p className="font-semibold mb-1" style={{ color: 'var(--theme-text-head)' }}>{title}</p>
                <p className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>{message}</p>
            </div>
        </div>
    );
}

// ── MAIN PAGE ──────────────────────────────────────────────────────────────
export default function GuestBookings({ pending_bookings, completed_bookings, rejected_bookings, stats }) {
    const [activeTab, setActiveTab] = useState('active');
    const [loading, setLoading] = useState({});
    const [rejectModal, setRejectModal] = useState(null);

    const fmtDate = fmtDateTimeAdmin;

    const post = (url, id, successMsg) => {
        setLoading(p => ({ ...p, [id]: true }));
        router.post(url, {}, {
            onFinish: () => setLoading(p => ({ ...p, [id]: false })),
            onSuccess: () => {
                if (successMsg) alert(successMsg);
                router.reload();
            },
            onError: (errors) => {
                alert('Operation failed. Please try again.');
            },
        });
    };

    const rejectBooking = (bookingId, reason) => {
        setLoading(p => ({ ...p, [`reject-${bookingId}`]: true }));
        router.post(route('admin.guest-bookings.reject', bookingId), { rejection_reason: reason }, {
            onFinish: () => setLoading(p => ({ ...p, [`reject-${bookingId}`]: false })),
            onSuccess: () => {
                setRejectModal(null);
                router.reload();
            },
            onError: () => {
                alert('Failed to reject booking. Please try again.');
            },
        });
    };

    const handleApprove = (id) => {
        if (confirm('Approve this booking? Guest will receive an email confirmation.')) {
            post(route('admin.guest-bookings.approve', id), `approve-${id}`, 'Booking approved!');
        }
    };

    const handleComplete = (id) => {
        if (confirm('Mark as completed? Promo email will be sent to guest in 24 hours.')) {
            post(route('admin.guest-bookings.complete', id), `complete-${id}`, 'Booking marked as completed!');
        }
    };

    const handleSendPromo = (id) => {
        if (confirm('Send 10% off promo email to this guest?')) {
            post(route('admin.guest-bookings.send-promo', id), `promo-${id}`, 'Promo email sent!');
        }
    };

    const pendingList = pending_bookings || [];
    const completedList = completed_bookings || [];
    const rejectedList = rejected_bookings || [];

    return (
        <AdminLayout title="Guest Bookings">
            <div className="space-y-6">
                
                {/* Stats Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <StatCard 
                        label="Pending" 
                        value={stats?.pending_count ?? 0} 
                        icon={Clock} 
                        color="#f59e0b"
                        onClick={() => setActiveTab('active')}
                    />
                    <StatCard 
                        label="Accepted" 
                        value={stats?.accepted_count ?? 0} 
                        icon={CircleCheck} 
                        color="#22c55e"
                        onClick={() => setActiveTab('active')}
                    />
                    <StatCard 
                        label="Completed" 
                        value={stats?.completed_count ?? 0} 
                        icon={Sparkles} 
                        color="#6366f1"
                        onClick={() => setActiveTab('active')}
                    />
                    <StatCard 
                        label="Rejected" 
                        value={stats?.rejected_count ?? 0} 
                        icon={X} 
                        color="#ef4444"
                        onClick={() => setActiveTab('rejected')}
                    />
                </div>

                {/* Tabs */}
                <div className="flex items-center gap-1 border-b" style={{ borderColor: 'var(--theme-border)' }}>
                    <button
                        onClick={() => setActiveTab('active')}
                        className="relative px-4 py-2.5 text-sm font-semibold transition-all"
                        style={{ color: activeTab === 'active' ? '#e2b764' : 'var(--theme-text-muted)' }}
                    >
                        Active Bookings
                        {(pendingList.length + completedList.length) > 0 && (
                            <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full" 
                                style={{ background: 'rgba(226,183,100,0.2)', color: '#e2b764' }}>
                                {pendingList.length + completedList.length}
                            </span>
                        )}
                        {activeTab === 'active' && (
                            <motion.div
                                layoutId="tab-indicator"
                                className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                                style={{ background: '#e2b764' }}
                            />
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('rejected')}
                        className="relative px-4 py-2.5 text-sm font-semibold transition-all"
                        style={{ color: activeTab === 'rejected' ? '#ef4444' : 'var(--theme-text-muted)' }}
                    >
                        Rejected
                        {rejectedList.length > 0 && (
                            <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full" 
                                style={{ background: 'rgba(239,68,68,0.2)', color: '#ef4444' }}>
                                {rejectedList.length}
                            </span>
                        )}
                        {activeTab === 'rejected' && (
                            <motion.div
                                layoutId="tab-indicator"
                                className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                                style={{ background: '#ef4444' }}
                            />
                        )}
                    </button>
                </div>

                {/* Active Tab Content */}
                {activeTab === 'active' && (
                    <div className="space-y-6">
                        {/* Pending & Accepted Section */}
                        {pendingList.filter(b => b.status === 'pending' || b.status === 'accepted').length > 0 ? (
                            <div>
                                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--theme-text-head)' }}>
                                    <AlertCircle size={14} style={{ color: '#f59e0b' }} />
                                    Requires Action
                                </h3>
                                <div className="space-y-3">
                                    {pendingList.map(booking => (
                                        <ActiveBookingCard
                                            key={booking.id}
                                            booking={booking}
                                            onApprove={handleApprove}
                                            onReject={(b) => setRejectModal(b)}
                                            onComplete={handleComplete}
                                            loading={loading}
                                        />
                                    ))}
                                </div>
                            </div>
                        ) : null}

                        {/* Completed Section */}
                        {completedList.length > 0 && (
                            <div>
                                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--theme-text-head)' }}>
                                    <Sparkles size={14} style={{ color: '#6366f1' }} />
                                    Ready for Conversion Promo
                                </h3>
                                <div className="space-y-3">
                                    {completedList.map(booking => (
                                        <CompletedBookingCard
                                            key={booking.id}
                                            booking={booking}
                                            onSendPromo={handleSendPromo}
                                            loading={loading}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Empty State */}
                        {pendingList.length === 0 && completedList.length === 0 && (
                            <EmptyState 
                                title="No Active Guest Bookings"
                                message="All guest bookings have been processed."
                                icon={UserPlus}
                            />
                        )}
                    </div>
                )}

                {/* Rejected Tab Content */}
                {activeTab === 'rejected' && (
                    <div className="space-y-3">
                        {rejectedList.length > 0 ? (
                            rejectedList.map(booking => (
                                <RejectedBookingCard key={booking.id} booking={booking} />
                            ))
                        ) : (
                            <EmptyState 
                                title="No Rejected Bookings"
                                message="All guest bookings have been approved."
                                icon={Archive}
                            />
                        )}
                    </div>
                )}
            </div>

            {/* Rejection Modal */}
            <AnimatePresence>
                {rejectModal && (
                    <RejectionModal
                        booking={rejectModal}
                        onClose={() => setRejectModal(null)}
                        onConfirm={rejectBooking}
                        loading={!!loading[`reject-${rejectModal.id}`]}
                    />
                )}
            </AnimatePresence>
        </AdminLayout>
    );
}