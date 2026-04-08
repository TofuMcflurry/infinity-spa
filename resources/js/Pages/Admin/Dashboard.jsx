import { useMemo, useState } from 'react';
import AdminLayout from '@/Layouts/AdminLayout';
import { CalendarDays, Coins, Users, UserCheck } from 'lucide-react';

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

export default function Dashboard({ stats, recent_bookings, revenue }) {
  const [range, setRange] = useState('weekly'); // weekly | monthly

  const fmtCurrency = useMemo(() => {
    return (n) =>
      new Intl.NumberFormat('en-AE', {
        style: 'currency',
        currency: 'AED',
        maximumFractionDigits: 2,
      }).format(Number(n || 0));
  }, []);

  const chart = revenue?.[range] ?? { labels: [], values: [] };

  return (
    <AdminLayout title="Dashboard">
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard
            icon={CalendarDays}
            label="Bookings Today"
            value={stats?.bookings_today ?? 0}
            sub="Scheduled today"
          />
          <StatCard
            icon={Coins}
            label="Monthly Revenue"
            value={fmtCurrency(stats?.monthly_revenue ?? 0)}
            sub="Completed bookings (this month)"
          />
          <StatCard
            icon={UserCheck}
            label="Active Therapists"
            value={stats?.active_therapists ?? 0}
            sub="is_active = true"
          />
          <StatCard
            icon={Users}
            label="Pending Approvals"
            value={stats?.pending_approvals ?? 0}
            sub="is_active = false"
          />
        </div>

        <div className="rounded-2xl p-5 glass-card">
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div>
              <div className="text-sm font-display font-bold" style={{ color: 'var(--theme-text-head)' }}>
                Revenue Chart
              </div>
              <div className="mt-1 text-sm" style={{ color: 'var(--theme-text-2)' }}>
                {range === 'weekly' ? 'Last 7 days' : 'This month (daily)'} · Completed bookings only
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRange('weekly')}
                className="px-3 py-2 rounded-xl text-sm font-semibold border transition"
                style={{
                  borderColor: range === 'weekly' ? 'rgba(226,183,100,0.35)' : 'var(--theme-border)',
                  background: range === 'weekly' ? 'rgba(226,183,100,0.10)' : 'var(--theme-btn-bg)',
                  color: range === 'weekly' ? '#e2b764' : 'var(--theme-text-2)',
                }}
              >
                Weekly
              </button>
              <button
                type="button"
                onClick={() => setRange('monthly')}
                className="px-3 py-2 rounded-xl text-sm font-semibold border transition"
                style={{
                  borderColor: range === 'monthly' ? 'rgba(226,183,100,0.35)' : 'var(--theme-border)',
                  background: range === 'monthly' ? 'rgba(226,183,100,0.10)' : 'var(--theme-btn-bg)',
                  color: range === 'monthly' ? '#e2b764' : 'var(--theme-text-2)',
                }}
              >
                Monthly
              </button>
            </div>
          </div>

          <div className="mt-5">
            <Bars labels={chart.labels} values={chart.values} />
          </div>
        </div>

        <div className="rounded-2xl p-5 glass-card">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-sm font-display font-bold" style={{ color: 'var(--theme-text-head)' }}>
                Recent Bookings
              </div>
              <div className="mt-1 text-sm" style={{ color: 'var(--theme-text-2)' }}>
                Latest 10 bookings
              </div>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
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
                      <div>
                        {fmtCurrency((Number(b.downpayment_amount || 0) + Number(b.remaining_amount || 0)))}
                      </div>
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

