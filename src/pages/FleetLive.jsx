// Fleet Live — owner view for live dispatch + live driver locations.
// Pro-gated (TierGate). The owner side of the fleet realtime layer:
// AutoHustle Fleet talks to the RoadHouse shared backend; drivers
// receive dispatch and share location from RoadHouse.
//
// PUSH + POLLING: a driver reply now pushes a notification to the
// owner even with AutoHustle closed (tap it to open Fleet Live).
// Polling stays the backup: dispatch polls every 10s, locations
// every 15s, only while this page is open.
//
// MAP: react-leaflet + OpenStreetMap tiles (no key, same as the
// PartsFinder stores). Tiles need a connection — when they can't load,
// the list under the map still shows every on-duty driver with
// coordinates and an "Open in Maps" link.
//
// LOCATION PRIVACY: a driver shares location ONLY while their
// on-duty toggle is on in RoadHouse (off by default, stoppable any
// time). The server keeps only the last-known point per driver — no
// trail, no history — and deletes it the moment they go off duty.
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Radio, MapPin, Users, Send, Copy, RefreshCw, Loader2, Truck, Trash2 } from 'lucide-react';
import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { base44 } from '@/api/base44Client';
import TierGate from '@/components/TierGate';
import { vehicleName } from '@/lib/fleet';
import {
  getFleetMembership, createFleet, validateMembership,
  sendFleetDispatch, listFleetDispatch, listFleetMembers,
  listFleetLocations, setFleetVehicle, removeFleetMember,
  regenerateFleetCode, fleetLocationMapsUrl, timeAgo,
} from '@/lib/fleetRealtime';
import { registerPushTokenForFleet, getFleetPushState } from '@/lib/fleetPush';

const DISPATCH_POLL_MS = 10000;
const LOCATION_POLL_MS = 15000;
// Default map center: Springfield, IL (Jeramy's area). Recenters on
// the first on-duty driver once locations load.
const HOME_CENTER = [39.8017, -89.6437];

export default function FleetLive() {
  const navigate = useNavigate();
  const [membership, setMembership] = useState(() => getFleetMembership());
  const [members, setMembers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fleetName, setFleetName] = useState('My Fleet');
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [pushState, setPushState] = useState({ supported: false, tokenRegistered: false });
  const [form, setForm] = useState({
    toMemberId: '', body: '', pickup: '', dropoff: '', time: '', pay: '',
  });
  const sinceIdRef = useRef(0);
  const membershipRef = useRef(membership);
  membershipRef.current = membership;

  const loadVehicles = async () => {
    try {
      const r = await base44.entities.Vehicle.filter({}, { sort: '-created_date', limit: 100 });
      setVehicles(r.items || []);
    } catch {
      setVehicles([]);
    }
  };

  const refreshMembers = async () => {
    try {
      const out = await listFleetMembers();
      setMembers(out.members || []);
      const m = membershipRef.current;
      if (m && out.joinCode && out.joinCode !== m.joinCode) {
        setMembership({ ...m, joinCode: out.joinCode });
      }
    } catch (e) {
      setError(e.message || 'Could not load fleet members.');
    }
  };

  const refreshLocations = async () => {
    try {
      const out = await listFleetLocations();
      setLocations(out.locations || []);
      setMapReady(true);
    } catch (e) {
      setError(e.message || 'Could not load driver locations.');
    }
  };

  const refreshDispatch = async () => {
    try {
      const out = await listFleetDispatch(sinceIdRef.current);
      const rows = out.messages || [];
      if (rows.length) {
        setMessages((prev) => {
          const seen = new Set(prev.map((x) => x.id));
          const fresh = rows.filter((x) => !seen.has(x.id));
          return [...prev, ...fresh];
        });
        sinceIdRef.current = Math.max(sinceIdRef.current, ...rows.map((x) => x.id));
      }
    } catch (e) {
      setError(e.message || 'Could not load dispatch messages.');
    }
  };

  const refreshAll = async () => {
    await Promise.all([refreshMembers(), refreshLocations(), refreshDispatch()]);
  };

  // Boot: validate the stored membership, then start polling.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      const valid = await validateMembership();
      if (cancelled) return;
      if (!valid) {
        setMembership(null);
        setLoading(false);
        return;
      }
      setMembership(valid);
      // Fire-and-forget: a failed register never blocks the page —
      // polling stays the backup. Then read the state for the line
      // under the dispatch heading.
      registerPushTokenForFleet()
        .then(() => getFleetPushState().then(setPushState).catch(() => {}))
        .catch(() => {});
      await loadVehicles();
      if (cancelled) return;
      await refreshAll();
      if (cancelled) return;
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll while the page is open. Polling stops when the page unmounts.
  useEffect(() => {
    if (!membership) return undefined;
    const d = setInterval(refreshDispatch, DISPATCH_POLL_MS);
    const l = setInterval(refreshLocations, LOCATION_POLL_MS);
    const m = setInterval(refreshMembers, LOCATION_POLL_MS);
    return () => { clearInterval(d); clearInterval(l); clearInterval(m); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [membership]);

  const handleCreate = async () => {
    setCreating(true);
    setError('');
    try {
      const m = await createFleet(fleetName);
      setMembership(m);
      registerPushTokenForFleet()
        .then(() => getFleetPushState().then(setPushState).catch(() => {}))
        .catch(() => {});
      setLoading(true);
      await loadVehicles();
      await refreshAll();
      setLoading(false);
    } catch (e) {
      setError(e.message || 'Could not create the fleet.');
    } finally {
      setCreating(false);
    }
  };

  const handleSend = async () => {
    if (!form.body.trim()) return;
    setSending(true);
    setError('');
    try {
      await sendFleetDispatch({
        body: form.body.trim(),
        toMemberId: form.toMemberId || null,
        job: {
          pickup: form.pickup.trim() || null,
          dropoff: form.dropoff.trim() || null,
          time: form.time.trim() || null,
          pay: form.pay.trim() || null,
        },
      });
      setForm({ toMemberId: form.toMemberId, body: '', pickup: '', dropoff: '', time: '', pay: '' });
      await refreshDispatch();
    } catch (e) {
      setError(e.message || 'Could not send the dispatch.');
    } finally {
      setSending(false);
    }
  };

  const handleCopyCode = async () => {
    if (!membership?.joinCode) return;
    try {
      await navigator.clipboard.writeText(membership.joinCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Copy failed — long-press the code to copy it.');
    }
  };

  const handleRegenerate = async () => {
    if (!window.confirm('Give a new join code? The old code will stop working. Drivers already in the fleet stay in.')) return;
    try {
      const code = await regenerateFleetCode();
      setMembership({ ...membership, joinCode: code });
    } catch (e) {
      setError(e.message || 'Could not make a new code.');
    }
  };

  const handleVehicle = async (memberId, label) => {
    try {
      await setFleetVehicle(memberId, label || null);
      await refreshMembers();
    } catch (e) {
      setError(e.message || 'Could not set the vehicle.');
    }
  };

  const handleRemove = async (member) => {
    if (!window.confirm(`Remove ${member.displayName} from the fleet? They will stop getting dispatch and their location will be cleared.`)) return;
    try {
      await removeFleetMember(member.memberId);
      await refreshMembers();
      await refreshLocations();
    } catch (e) {
      setError(e.message || 'Could not remove that driver.');
    }
  };

  const drivers = members.filter((m) => m.role === 'driver');
  const center = locations.length
    ? [locations[0].lat, locations[0].lng]
    : HOME_CENTER;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-4">
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft size={16} /> Back
      </button>
      <h1 className="mt-2 font-display text-2xl font-bold flex items-center gap-2">
        <Radio size={22} className="text-primary" /> Fleet Live
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Live dispatch + driver map. Drivers get a push notification for every dispatch, even with RoadHouse closed — polling every 10–15s while this page is open keeps it live here too.
      </p>

      <TierGate required="pro" feature="Fleet Live">
        {loading ? (
          <div className="mt-4 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 size={16} className="animate-spin" /> Loading your fleet…
          </div>
        ) : !membership ? (
          <div className="mt-4 rounded-2xl border border-border bg-card p-4 space-y-3">
            <h2 className="font-display font-bold text-lg">Create your fleet</h2>
            <p className="text-sm text-muted-foreground">
              Your drivers join from RoadHouse with a code — they do not need Pro, just the app and an account.
              Once they join, you can send them live dispatch and see them on the map while they are on duty.
            </p>
            <label className="block text-xs text-muted-foreground">Fleet name</label>
            <input
              value={fleetName}
              onChange={(e) => setFleetName(e.target.value)}
              className="tap-target w-full rounded-xl border border-border bg-zinc-950 px-3 py-2.5 text-sm"
              placeholder="My Fleet"
            />
            <button
              onClick={handleCreate}
              disabled={creating}
              className="tap-target w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-primary py-3 font-display font-bold uppercase tracking-wide text-sm text-primary-foreground disabled:opacity-50"
            >
              {creating ? <Loader2 size={16} className="animate-spin" /> : <Radio size={16} />}
              {creating ? 'Creating…' : 'Create fleet'}
            </button>
          </div>
        ) : (
          <>
            {error && (
              <div className="mt-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                {error}
                <button onClick={() => { setError(''); refreshAll(); }} className="ml-2 inline-flex items-center gap-1 font-semibold">
                  <RefreshCw size={14} /> Retry
                </button>
              </div>
            )}

            {/* Join code */}
            <div className="mt-4 rounded-2xl border border-border bg-card p-4">
              <h2 className="font-display font-bold uppercase tracking-wide text-sm flex items-center gap-2">
                <Users size={16} className="text-primary" /> Driver join code
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Give this code to your drivers — they enter it in RoadHouse to join {membership.fleetName}.
                Only the code is shared; your fleet token stays on this phone.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <span className="font-display text-3xl font-bold tracking-[0.3em]">{membership.joinCode}</span>
                <button onClick={handleCopyCode} className="tap-target inline-flex items-center gap-1 rounded-xl border border-border px-3 py-2 text-sm">
                  <Copy size={14} /> {copied ? 'Copied!' : 'Copy'}
                </button>
                <button onClick={handleRegenerate} className="tap-target inline-flex items-center gap-1 rounded-xl border border-border px-3 py-2 text-sm">
                  <RefreshCw size={14} /> New code
                </button>
              </div>
            </div>

            {/* Live map */}
            <h2 className="mt-6 font-display font-bold text-xl flex items-center gap-2">
              <MapPin size={20} className="text-primary" /> On-duty drivers
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Drivers share location only while their on-duty toggle is on in RoadHouse (off by default).
              The server keeps only their last point — no trail — and deletes it when they go off duty.
              The map needs a connection; the list below always works.
            </p>
            {mapReady && (
              <div className="mt-3 overflow-hidden rounded-2xl border border-border" style={{ height: 320 }}>
                <MapContainer center={center} zoom={11} style={{ height: '100%', width: '100%' }}>
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  {locations.map((loc) => (
                    <CircleMarker
                      key={loc.memberId}
                      center={[loc.lat, loc.lng]}
                      radius={10}
                      pathOptions={{ color: '#f97316', fillColor: '#f97316', fillOpacity: 0.7 }}
                    >
                      <Tooltip>
                        {loc.displayName}{loc.vehicleLabel ? ` — ${loc.vehicleLabel}` : ''}
                        <br />Updated {timeAgo(loc.updatedAt)}
                      </Tooltip>
                    </CircleMarker>
                  ))}
                </MapContainer>
              </div>
            )}
            {locations.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No drivers on duty right now.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {locations.map((loc) => (
                  <div key={loc.memberId} className="rounded-2xl border border-border bg-card px-4 py-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-display font-semibold text-sm">
                        {loc.displayName}{loc.vehicleLabel ? ` — ${loc.vehicleLabel}` : ''}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {loc.lat.toFixed(5)}, {loc.lng.toFixed(5)} · Updated {timeAgo(loc.updatedAt)}
                      </div>
                    </div>
                    <a
                      href={fleetLocationMapsUrl(loc.lat, loc.lng)}
                      target="_blank"
                      rel="noreferrer"
                      className="tap-target shrink-0 inline-flex items-center gap-1 rounded-xl border border-border px-3 py-2 text-xs"
                    >
                      <MapPin size={14} /> Open in Maps
                    </a>
                  </div>
                ))}
              </div>
            )}

            {/* Members */}
            <h2 className="mt-6 font-display font-bold text-xl flex items-center gap-2">
              <Users size={20} className="text-primary" /> Drivers ({drivers.length})
            </h2>
            {drivers.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                No drivers have joined yet. Share the code above — they join from RoadHouse.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {drivers.map((d) => (
                  <div key={d.memberId} className="rounded-2xl border border-border bg-card px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-display font-semibold text-sm flex items-center gap-2">
                          <span className={`inline-block h-2 w-2 rounded-full ${d.online ? 'bg-green-500' : 'bg-zinc-500'}`} />
                          {d.displayName}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {d.online ? 'Online' : `Last seen ${timeAgo(d.lastSeen)}`}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemove(d)}
                        className="tap-target inline-flex items-center gap-1 rounded-xl border border-border px-3 py-2 text-xs"
                      >
                        <Trash2 size={14} /> Remove
                      </button>
                    </div>
                    <label className="mt-2 block text-xs text-muted-foreground">Vehicle</label>
                    <select
                      value={d.vehicleLabel || ''}
                      onChange={(e) => handleVehicle(d.memberId, e.target.value)}
                      className="tap-target mt-1 w-full rounded-xl border border-border bg-zinc-950 px-3 py-2.5 text-sm"
                    >
                      <option value="">No vehicle assigned</option>
                      {vehicles.map((v) => (
                        <option key={v.id} value={vehicleName(v)}>{vehicleName(v)}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}

            {/* Dispatch */}
            <h2 className="mt-6 font-display font-bold text-xl flex items-center gap-2">
              <Send size={20} className="text-primary" /> Live dispatch
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Messages reach the driver's phone in RoadHouse — a push notification lands even with the app closed (polling, up to ~10s, is the backup).
              Driver replies come back here. With no connection, use the on-device dispatch on the Fleet page instead.
            </p>
            {pushState.supported ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {pushState.tokenRegistered
                  ? 'Push on — driver replies notify you even with AutoHustle closed.'
                  : 'Push off — check notification permission. Polling (up to ~10s) is the backup.'}
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                Push not available on this device — polling (up to ~10s) is the backup.
              </p>
            )}
            <div className="mt-3 space-y-2">
              {messages.length === 0 ? (
                <p className="text-sm text-muted-foreground">No live dispatch yet — send the first job below.</p>
              ) : (
                messages.slice(-50).map((msg) => (
                  <div key={msg.id} className={`rounded-2xl border px-4 py-3 ${msg.fromRole === 'owner' ? 'border-border bg-card' : 'border-primary/40 bg-primary/10'}`}>
                    <div className="text-xs text-muted-foreground">
                      {msg.fromRole === 'owner' ? 'You' : msg.fromName}
                      {msg.toMemberId ? ' → driver' : ' → all drivers'}
                      {' · '}{new Date(msg.createdAt).toLocaleString()}
                    </div>
                    <div className="mt-1 text-sm">{msg.body}</div>
                    {(msg.job?.pickup || msg.job?.dropoff || msg.job?.time || msg.job?.pay) && (
                      <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
                        {msg.job.pickup && <div>Pickup: {msg.job.pickup}</div>}
                        {msg.job.dropoff && <div>Drop-off: {msg.job.dropoff}</div>}
                        {msg.job.time && <div>Time: {msg.job.time}</div>}
                        {msg.job.pay && <div>Pay: {msg.job.pay}</div>}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="mt-3 rounded-2xl border border-border bg-card p-4 space-y-2">
              <label className="block text-xs text-muted-foreground">Send to</label>
              <select
                value={form.toMemberId}
                onChange={(e) => setForm({ ...form, toMemberId: e.target.value })}
                className="tap-target w-full rounded-xl border border-border bg-zinc-950 px-3 py-2.5 text-sm"
              >
                <option value="">All drivers</option>
                {drivers.map((d) => (
                  <option key={d.memberId} value={d.memberId}>{d.displayName}</option>
                ))}
              </select>
              <textarea
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                rows={2}
                placeholder="Job details — what the driver needs to know"
                className="tap-target w-full rounded-xl border border-border bg-zinc-950 px-3 py-2.5 text-sm"
              />
              <div className="grid grid-cols-2 gap-2">
                <input value={form.pickup} onChange={(e) => setForm({ ...form, pickup: e.target.value })} placeholder="Pickup" className="tap-target w-full rounded-xl border border-border bg-zinc-950 px-3 py-2.5 text-sm" />
                <input value={form.dropoff} onChange={(e) => setForm({ ...form, dropoff: e.target.value })} placeholder="Drop-off" className="tap-target w-full rounded-xl border border-border bg-zinc-950 px-3 py-2.5 text-sm" />
                <input value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} placeholder="Time" className="tap-target w-full rounded-xl border border-border bg-zinc-950 px-3 py-2.5 text-sm" />
                <input value={form.pay} onChange={(e) => setForm({ ...form, pay: e.target.value })} placeholder="Pay" className="tap-target w-full rounded-xl border border-border bg-zinc-950 px-3 py-2.5 text-sm" />
              </div>
              <button
                onClick={handleSend}
                disabled={sending || !form.body.trim()}
                className="tap-target w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-primary py-3 font-display font-bold uppercase tracking-wide text-sm text-primary-foreground disabled:opacity-50"
              >
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                {sending ? 'Sending…' : 'Send dispatch'}
              </button>
            </div>

            <Link to="/fleet" className="tap-target mt-5 w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-border py-3 font-display font-bold uppercase tracking-wide text-sm">
              <Truck size={16} /> Back to Fleet (on-device)
            </Link>
          </>
        )}
      </TierGate>
    </div>
  );
}
