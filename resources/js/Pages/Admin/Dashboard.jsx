import { useMemo, useState } from 'react';
import { router } from '@inertiajs/react';
import AdminLayout from '@/Layouts/AdminLayout';
import { CalendarDays, Coins, Users, UserCheck, Check, X, CircleCheck, Mail } from 'lucide-react';
import { fmtDateTimeAdmin } from '@/lib/utils';

function StatCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="rounded-2xl p-5 glass-card">
      <div className="flex items-start gap-4">
        <div
          className="w-11 h-11 rounded-2xl flex items-center justify-center"
          style={{ background: 'rgba(226,183,100,0.12)', border: '1px solid rgba(226,183,100,0.25)' }}
        >
          <Icon size={18} style={{ color: '#e2b764' }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>{label}</div>
          <div className="mt-1 text-2xl font-display font-bold truncate" style={{ color: 'var(--theme-text-head)' }}>
            {value}
          </div>
          {sub && <div className="mt-1 text-xs" style={{ color: 'var(--theme-text-2)' }}>{sub}</div>}
        </div>
      </div>
    </div>
  );
}

function Bars({ labels = [], values = [] }) {
  const max = Math.max(1, ...(values || [1]));
  return (
    <div className="flex items-end gap-2 h-44">
      {labels.map((l, idx) => {
        const v = Number(values[idx] ?? 0) || 0;
        const h = Math.max(3, Math.round((v / max) * 100));
        return (
          <div key={l + idx} className="flex-1 min-w-[10px] flex flex-col items-center gap-2">
            <div className="w-full rounded-xl overflow-hidden" style={{ background: 'var(--theme-divider)', height: '140px' }}>
              <div
                className="w-full rounded-xl"
                style={{
                  height: `${h}%`,
                  background: 'linear-gradient(180deg, rgba(226,183,100,0.95), rgba(183,136,42,0.9))',
                  marginTop: `${100 - h}%`,
                }}
                title={`${v}`}
              />
            </div>
            <div className="text-[10px]" style={{ color: 'var(--theme-text-muted)' }}>{l}</div>
          </div>
        );
      })}
    </div>
  );
}

function ActionBtn({ onClick, color, icon: Icon, label, disabled }) {
  const colors = {
    green:  { bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.35)',  text: '#16a34a' },
    red:    { bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.35)',   text: '#dc2626' },
    gold:   { bg: 'rgba(226,183,100,0.12)', border: 'rgba(226,183,100,0.35)', text: '#b7882a' },
    blue:   { bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.35)',  text: '#2563eb' },
  };
  const c = colors[color] || colors.gold;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold border transition disabled:opacity-40"
      style={{ background: c.bg, borderColor: c.border, color: c.text }}
    >
      <Icon size={12} />
      {label}
    </button>
  );
}

function StatusBadge({ status }) {
  const map = {
    pending:   { bg: 'rgba(234,179,8,0.12)',   color: '#a16207',  label: 'Pending' },
    accepted:  { bg: 'rgba(34,197,94,0.12)',   color: '#15803d',  label: 'Accepted' },
    completed: { bg: 'rgba(99,102,241,0.12)',  color: '#4338ca',  label: 'Completed' },
    rejected:  { bg: 'rgba(239,68,68,0.12)',   color: '#b91c1c',  label: 'Rejected' },
  };
  const s = map[status] || { bg: 'rgba(107,114,128,0.12)', color: '#374151', label: status };
  return (
    <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

export default function Dashboard({ stats, recent_bookings, pending_guest_bookings, completed_guest_bookings, revenue }) {
  const [range, setRange] = useState('weekly');
  const [loading, setLoading] = useState({});

  const fmtCurrency = useMemo(() => (n) =>
    new Intl.NumberFormat('en-AE', { style: 'currency', currency: 'AED', maximumFractionDigits: 2 }).format(Number(n || 0)),
  []);

  const fmtDate = fmtDateTimeAdmin;

  const post = (url, id, confirm_msg) => {
    if (!window.confirm(confirm_msg)) return;
    setLoading(p => ({ ...p, [id]: true }));
    router.post(url, {}, {
      onFinish: () => setLoading(p => ({ ...p, [id]: false })),
    });
  };

  const chart = revenue?.[range] ?? { labels: [], values: [] };

  return (
    <AdminLayout title="Dashboard">
      <div className="space-y-6">
        {/* ── Stat Cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard icon={CalendarDays} label="Bookings Today"    value={stats?.bookings_today ?? 0}     sub="Scheduled today" />
          <StatCard icon={Coins}        label="Monthly Revenue"   value={fmtCurrency(stats?.monthly_revenue ?? 0)} sub="Completed bookings (this month)" />
          <StatCard icon={UserCheck}    label="Active Therapists" value={stats?.active_therapists ?? 0}  sub="is_active = true" />
          <StatCard icon={Users}        label="Pending Approvals" value={stats?.pending_approvals ?? 0}  sub="is_active = false" />
        </div>

        {/* ── Pending + Accepted Guest Bookings ── */}
        {(pending_guest_bookings ?? []).length > 0 && (
          <div className="rounded-2xl p-5 glass-card">
            <div className="mb-4">
              <div className="text-sm font-display font-bold" style={{ color: 'var(--theme-text-head)' }}>
                Guest Bookings — Pending Action
              </div>
              <div className="mt-1 text-sm" style={{ color: 'var(--theme-text-2)' }}>
                Approve or reject · Accepted bookings can be marked completed
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr style={{ color: 'var(--theme-text-muted)' }}>
                    <th className="py-2 pr-4 text-left font-medium">Guest</th>
                    <th className="py-2 pr-4 text-left font-medium">Service</th>
                    <th className="py-2 pr-4 text-left font-medium">Date / Time</th>
                    <th className="py-2 pr-4 text-left font-medium">Address</th>
                    <th className="py-2 pr-4 text-left font-medium">Status</th>
                    <th className="py-2 text-left font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pending_guest_bookings.map(b => (
                    <tr key={b.id} className="border-t" style={{ borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}>
                      <td className="py-3 pr-4">
                        <div className="font-semibold">{b.guest_name}</div>
                        <div className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>{b.guest_email}</div>
                        <div className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>{b.guest_phone}</div>
                      </td>
                      <td className="py-3 pr-4">{b.service_name}</td>
                      <td className="py-3 pr-4 text-xs" style={{ color: 'var(--theme-text-2)' }}>{fmtDate(b.scheduled_start)}</td>
                      <td className="py-3 pr-4 text-xs max-w-[160px] truncate" title={b.location}>{b.location}</td>
                      <td className="py-3 pr-4"><StatusBadge status={b.status} /></td>
                      <td className="py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          {b.status === 'pending' && (
                            <>
                              <ActionBtn
                                icon={Check} color="green" label="Approve"
                                disabled={!!loading[`approve-${b.id}`]}
                                onClick={() => post(route('admin.guest-bookings.approve', b.id), `approve-${b.id}`, `Approve booking for ${b.guest_name}?`)}
                              />
                              <ActionBtn
                                icon={X} color="red" label="Reject"
                                disabled={!!loading[`reject-${b.id}`]}
                                onClick={() => post(route('admin.guest-bookings.reject', b.id), `reject-${b.id}`, `Reject booking for ${b.guest_name}?`)}
                              />
                            </>
                          )}
                          {b.status === 'accepted' && (
                            <ActionBtn
                              icon={CircleCheck} color="blue" label="Mark Completed"
                              disabled={!!loading[`complete-${b.id}`]}
                              onClick={() => post(route('admin.guest-bookings.complete', b.id), `complete-${b.id}`, `Mark booking #${b.id} as completed? Promo email will be sent to guest in 24h.`)}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Completed Guest Bookings (send promo) ── */}
        {(completed_guest_bookings ?? []).length > 0 && (
          <div className="rounded-2xl p-5 glass-card">
            <div className="mb-4">
              <div className="text-sm font-display font-bold" style={{ color: 'var(--theme-text-head)' }}>
                Completed Guest Bookings — Conversion Promo
              </div>
              <div className="mt-1 text-sm" style={{ color: 'var(--theme-text-2)' }}>
                Promo email auto-queued 24h after completion · Send manually if needed
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr style={{ color: 'var(--theme-text-muted)' }}>
                    <th className="py-2 pr-4 text-left font-medium">Guest</th>
                    <th className="py-2 pr-4 text-left font-medium">Service</th>
                    <th className="py-2 pr-4 text-left font-medium">Completed</th>
                    <th className="py-2 text-left font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {completed_guest_bookings.map(b => (
                    <tr key={b.id} className="border-t" style={{ borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}>
                      <td className="py-3 pr-4">
                        <div className="font-semibold">{b.guest_name}</div>
                        <div className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>{b.guest_email}</div>
                      </td>
                      <td className="py-3 pr-4">{b.service_name}</td>
                      <td className="py-3 pr-4 text-xs" style={{ color: 'var(--theme-text-2)' }}>{fmtDate(b.scheduled_start)}</td>
                      <td className="py-3">
                        <ActionBtn
                          icon={Mail} color="gold" label="Send Promo Now"
                          disabled={!!loading[`promo-${b.id}`]}
                          onClick={() => post(route('admin.guest-bookings.send-promo', b.id), `promo-${b.id}`, `Send 10%-off promo email to ${b.guest_email}?`)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Revenue Chart ── */}
        <div className="rounded-2xl p-5 glass-card">
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div>
              <div className="text-sm font-display font-bold" style={{ color: 'var(--theme-text-head)' }}>Revenue Chart</div>
              <div className="mt-1 text-sm" style={{ color: 'var(--theme-text-2)' }}>
                {range === 'weekly' ? 'Last 7 days' : 'This month (daily)'} · Completed bookings only
              </div>
            </div>
            <div className="flex items-center gap-2">
              {['weekly', 'monthly'].map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  className="px-3 py-2 rounded-xl text-sm font-semibold border transition capitalize"
                  style={{
                    borderColor: range === r ? 'rgba(226,183,100,0.35)' : 'var(--theme-border)',
                    background:  range === r ? 'rgba(226,183,100,0.10)' : 'var(--theme-btn-bg)',
                    color:       range === r ? '#e2b764' : 'var(--theme-text-2)',
                  }}
                >
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-5">
            <Bars labels={chart.labels} values={chart.values} />
          </div>
        </div>

        {/* ── Recent Bookings ── */}
        <div className="rounded-2xl p-5 glass-card">
          <div className="mb-4">
            <div className="text-sm font-display font-bold" style={{ color: 'var(--theme-text-head)' }}>Recent Bookings</div>
            <div className="mt-1 text-sm" style={{ color: 'var(--theme-text-2)' }}>Latest 10 bookings</div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr style={{ color: 'var(--theme-text-muted)' }}>
                  <th className="py-2 pr-4 text-left">ID</th>
                  <th className="py-2 pr-4 text-left">Customer</th>
                  <th className="py-2 pr-4 text-left">Therapist</th>
                  <th className="py-2 pr-4 text-left">Service</th>
                  <th className="py-2 pr-4 text-left">Date/Time</th>
                  <th className="py-2 pr-4 text-left">Status</th>
                  <th className="py-2 pr-0 text-right">Payment</th>
                </tr>
              </thead>
              <tbody>
                {(recent_bookings ?? []).map(b => (
                  <tr key={b.id} className="border-t" style={{ borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}>
                    <td className="py-3 pr-4 font-semibold">#{b.id}</td>
                    <td className="py-3 pr-4">{b.customer_name ?? '—'}</td>
                    <td className="py-3 pr-4">{b.therapist_name ?? '—'}</td>
                    <td className="py-3 pr-4">{b.service_name ?? '—'}</td>
                    <td className="py-3 pr-4 text-xs" style={{ color: 'var(--theme-text-2)' }}>
                      <div>{b.scheduled_start ?? '—'}</div>
                      <div>{b.scheduled_end ?? ''}</div>
                    </td>
                    <td className="py-3 pr-4">{b.status ?? '—'}</td>
                    <td className="py-3 pr-0 text-right text-xs" style={{ color: 'var(--theme-text-2)' }}>
                      <div>{b.payment_method ?? '—'}</div>
                      <div>{fmtCurrency((Number(b.downpayment_amount || 0) + Number(b.remaining_amount || 0)))}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
