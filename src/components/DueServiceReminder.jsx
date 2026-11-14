// Due-service reminder card — FREE for all tiers, no tier gate
// anywhere on this path (wording + reminder patch, 2026-11-14).
// Shows on Home whenever a scheduled service (not done, not
// cancelled) is due today or overdue. The reminder fires for the
// free first service too — that is the point: the user sees the
// value, then Plus covers the next ones.
//
// Behaviour:
// - Renders nothing while loading, on load error, or when nothing
//   is due — Home is unchanged on a normal day.
// - One row per due service: vehicle + service + due text, with
//   "Mark done" (one tap, saves with today's date + current
//   odometer, updates the next-service date like the scheduler's
//   own mark-done), "View" (opens the scheduler on that vehicle),
//   and "Not now" (hides that service until tomorrow, date-keyed
//   in localStorage — it reappears the next day until done).
// - A native notification is wired alongside this card now:
//   @capacitor/local-notifications schedules a day-before and a
//   due-day reminder at 8:00 AM local (src/lib/dueNotifications.js).
//   The card stays the reminder while the app is open; the native
//   one reaches the user with the app closed. Marking done from
//   this card cancels the native notifications for that service.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CalendarClock, CheckCircle2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { vehicleName } from '@/lib/fleet';
import { cancelDueNotifications } from '@/lib/dueNotifications';
import {
  dueServiceReminders,
  applyServiceDone,
  scheduledServiceTypeLabel,
  isDueReminderDismissed,
  dismissDueReminder,
} from '@/lib/fleetScheduling';

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function DueServiceReminder() {
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState(null);
  const [savingId, setSavingId] = useState('');
  const [error, setError] = useState('');
  const [, setTick] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const r = await base44.entities.Vehicle.filter({}, { sort: '-created_date', limit: 100 });
        setVehicles(r.items || []);
      } catch {
        // Load failed — render nothing; Home already surfaces a
        // garage load error, and a reminder must never error-noise.
        setVehicles([]);
      }
    })();
  }, []);

  if (!vehicles) return null;
  const today = todayISO();
  const visible = dueServiceReminders(vehicles).filter(
    (r) => !isDueReminderDismissed(r.item.id, today),
  );
  if (visible.length === 0) return null;

  const markDone = async (vehicle, item) => {
    const res = applyServiceDone(vehicle, item.id, {});
    if (!res) { setError('Could not mark that service done — it may already be done.'); return; }
    setSavingId(item.id);
    try {
      const updated = await base44.entities.Vehicle.update(vehicle.id, {
        fleet_scheduled_services: res.scheduledServices,
        fleet_service_last: res.serviceLast,
      });
      setVehicles((vs) => vs.map((x) => (x.id === vehicle.id ? updated : x)));
      // Done means no native reminder for it anymore.
      void cancelDueNotifications(vehicle.id, item.id);
    } catch {
      setError('Could not save that change — check your connection and try again.');
    } finally {
      setSavingId('');
    }
  };

  const notNow = (item) => {
    dismissDueReminder(item.id, today);
    setTick((t) => t + 1);
  };

  return (
    <div role="alert" className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
      <div className="flex items-center gap-2">
        <Bell size={18} className="text-primary shrink-0" />
        <span className="font-display font-semibold uppercase text-sm tracking-wide">
          {visible.length === 1 ? 'Service due' : `${visible.length} services due`}
        </span>
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        Time to get {visible.length === 1 ? 'this' : 'these'} done — no charge for the reminder.
      </p>
      {error && <p role="alert" className="text-xs text-red-400 mt-2">{error}</p>}
      <div className="mt-3 space-y-2">
        {visible.map(({ vehicle, item, status }) => (
          <div key={item.id} className="rounded-xl border border-border bg-card px-3 py-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium text-sm">
                  {scheduledServiceTypeLabel(item.type, item.customLabel)} — {vehicleName(vehicle)}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {status.label}{item.date ? ` · ${item.date}` : ''}
                </div>
                {item.shop && <div className="text-xs text-muted-foreground mt-0.5">{item.shop}</div>}
              </div>
              <CalendarClock size={16} className="text-primary shrink-0 mt-0.5" />
            </div>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => markDone(vehicle, item)}
                disabled={savingId === item.id}
                className="tap-target flex-1 rounded-xl bg-primary text-primary-foreground font-display font-bold uppercase tracking-wide text-xs py-2 inline-flex items-center justify-center gap-1 disabled:opacity-60"
              >
                <CheckCircle2 size={14} /> {savingId === item.id ? 'Saving…' : 'Mark done'}
              </button>
              <button
                onClick={() => navigate(`/service-scheduler?vehicle=${vehicle.id}`)}
                className="tap-target rounded-xl border border-border px-3 py-2 text-xs"
              >
                View
              </button>
              <button
                onClick={() => notNow(item)}
                className="tap-target rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground"
              >
                Not now
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
