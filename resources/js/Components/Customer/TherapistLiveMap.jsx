import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Circle, Tooltip, ZoomControl, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Navigation, WifiOff, Clock, Loader2 } from 'lucide-react';
import { useTherapistLiveLocation } from '@/hooks/useTherapistLiveLocation';

// GPS v1 map provider — deliberately NOT an AWS-specific tile service yet
// (ADR §14/§20): a plain OSM-compatible tile URL + attribution, overridable
// via env so the provider can be swapped later (e.g. for Amazon Location
// Service's tile endpoint) without touching this component's structure.
const TILE_URL = import.meta.env.VITE_GPS_TILE_URL
    ?? 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = import.meta.env.VITE_GPS_TILE_ATTRIBUTION
    ?? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// Derives the therapist's initials from the one field already available on
// `booking` (a plain name string, e.g. CustomerDashboardController's
// `upcoming_booking.therapist`) — the same split/slice/uppercase pattern
// already used for avatar initials elsewhere (CustomerLayout.jsx sidebar,
// Dashboard.jsx header). No new field, API call, or photo is introduced.
function therapistInitials(name) {
    if (!name) return '';
    return name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

// Builds the therapist's live-location marker: a gold ring (var(--theme-cta))
// around their initials. Built per render (memoized below) rather than once
// at module load, since initials vary per booking. Per the approved
// live-tracking mockups (03-06): only `status === 'live'` gets the solid
// ring + pulsing halo; stale/disconnected show the same dashed "last known"
// ring instead (no halo — it stops the moment the location isn't current),
// matching 05/06 exactly. `connecting` never reaches here at all — a marker
// is only ever built once a `center` exists (see render below).
function buildTherapistMarkerIcon(initials, status) {
    const isLive = status === 'live';
    return L.divIcon({
        className: '',
        html: `
            <span style="position:relative;display:flex;align-items:center;justify-content:center;width:40px;height:40px;">
                ${isLive ? `<span style="position:absolute;inset:-10px;border-radius:50%;background:rgba(226,183,100,0.25);animation:gps-live-pulse 1.6s ease-out infinite;"></span>` : ''}
                <span style="width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--theme-card);border:2.5px ${isLive ? 'solid' : 'dashed'} var(--theme-cta);opacity:${isLive ? '1' : '0.72'};box-shadow:0 2px 6px rgba(0,0,0,0.3);font-family:'Plus Jakarta Sans',sans-serif;font-weight:700;font-size:13px;letter-spacing:0.5px;color:var(--theme-text-head);">${initials}</span>
            </span>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
    });
}

function statusColor(status) {
    switch (status) {
        case 'live':         return '#10b981';
        case 'stale':         return '#f59e0b';
        case 'disconnected': return '#ef4444';
        default:              return '#3b82f6';
    }
}

// The map header's bold leading word — "LIVE", "STALE", "CONNECTING",
// "DISCONNECTED" — paired with statusSecondary below via a muted "·"
// separator (e.g. "LIVE · updated 12s ago"). Split from the secondary text
// so the minimalist header can style each part differently (bold/colored
// word vs. subtle muted detail).
function statusWord(status) {
    switch (status) {
        case 'live':         return 'Live';
        case 'stale':         return 'Stale';
        case 'disconnected': return 'Disconnected';
        case 'connecting':   return 'Connecting';
        default:              return '';
    }
}

// The muted detail shown after the "·" separator — only while there's a
// real timestamp to report. Connecting has no position yet (never invents
// one) and Disconnected intentionally shows no relative time, matching the
// existing "no freshness claim while the connection itself is down" rule.
function statusSecondary(status, relativeTime) {
    if (!relativeTime) return null;
    switch (status) {
        case 'live':  return `updated ${relativeTime}`;
        case 'stale': return `updated ${relativeTime}`;
        default:       return null;
    }
}

// Gives connecting/stale their own icon instead of sharing Navigation with
// live — disconnected already had WifiOff, which stays as-is.
function statusIcon(status) {
    switch (status) {
        case 'disconnected': return WifiOff;
        case 'stale':         return Clock;
        case 'connecting':   return Loader2;
        default:              return Navigation;
    }
}

// "4 min ago" phrasing (not "4m ago") to match the approved mockups' exact
// wording for the freshness pill and the message note.
function formatLastUpdated(timestamp) {
    if (!timestamp) return null;
    const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
    if (seconds < 5) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.round(seconds / 60);
    return `${minutes} min${minutes === 1 ? '' : 's'} ago`;
}

// "6:12 PM" wall-clock stamp for the marker's "Last known" label (mockups
// 05/06) — JetBrains Mono per the design notes' rule that timers/timestamps
// are mono (.gps-mono, already defined below).
function formatClockTime(timestamp) {
    if (!timestamp) return null;
    return new Date(timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// Keeps the viewport centered on a moving marker. MapContainer's own
// `center` prop only applies on first mount, so recentering on subsequent
// location updates needs react-leaflet's useMap() + an explicit panTo().
function RecenterOnMove({ center }) {
    const map = useMap();
    useEffect(() => {
        if (center) map.panTo(center, { animate: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [center?.[0], center?.[1]]);
    return null;
}

// Keeps Leaflet's internal size cache correct whenever the map container's
// actual rendered height changes. Leaflet's own API for this is
// map.invalidateSize() (see Leaflet's documented "map container size
// changed" guidance) — there is no built-in way for Leaflet to detect a
// resize on its own.
//   - `watch` re-runs invalidateSize() via a plain effect whenever the
//     caller-supplied height value itself changes (the normal React
//     lifecycle path — no observer needed for this case).
//   - The window-resize listener is only attached when `responsive` is
//     true: that's the one case where the container's height can change
//     purely via a CSS breakpoint (see .gps-map-container--responsive
//     below) with no corresponding React prop change for an effect to key
//     off, so there is nothing to invalidate against without it. The fixed
//     -height legacy path has no breakpoints to cross, so it never attaches
//     this listener — avoiding an observer where one isn't needed.
function InvalidateMapSize({ watch, responsive }) {
    const map = useMap();
    useEffect(() => {
        map.invalidateSize();
    }, [watch]);
    useEffect(() => {
        if (!responsive) return;
        const handleResize = () => map.invalidateSize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [responsive]);
    return null;
}

// Shows the assigned therapist's live location for one booking while it's
// en_route. Renders nothing outside that window — no historical breadcrumbs,
// no fallback "last known" marker once the booking has moved on.
//
// `height` (default 220, px): fixed map height — unchanged behavior for
// every existing caller that doesn't pass it (e.g. MyBookings.jsx).
// `responsiveHeight` (default false): opt-in flag used by StatusTracker to
// switch to the design notes' breakpoint-driven heights (330/420/500)
// instead of the fixed `height` value — see .gps-map-container--responsive.
// `onStatusChange` (optional): reports {status, lastUpdatedAt} up to the
// caller whenever they change, so a wrapping card (StatusTracker) can match
// its own message/freshness treatment to the approved per-state mockups
// without a second, duplicate subscription — this stays the only place
// useTherapistLiveLocation is called. MyBookings.jsx doesn't pass it, so its
// standalone usage is completely unaffected.
export default function TherapistLiveMap({ booking, height = 220, responsiveHeight = false, onStatusChange }) {
    const { location, lastUpdatedAt, status } = useTherapistLiveLocation(booking);

    useEffect(() => {
        onStatusChange?.({ status, lastUpdatedAt });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status, lastUpdatedAt]);

    // Ticks once a second while live/stale so "Xs ago"/"X min ago" stays
    // accurate without the hook itself needing its own render-triggering
    // interval.
    const [, forceTick] = useState(0);
    useEffect(() => {
        if (status !== 'live' && status !== 'stale') return;
        const id = setInterval(() => forceTick((t) => t + 1), 1_000);
        return () => clearInterval(id);
    }, [status]);

    if (status === 'idle') return null;

    const center = location ? [location.latitude, location.longitude] : null;
    const StatusIcon = statusIcon(status);
    const initials = therapistInitials(booking?.therapist);
    const therapistFirstName = booking?.therapist?.trim().split(/\s+/)[0] ?? '';
    const relativeTime = formatLastUpdated(lastUpdatedAt);
    const markerIcon = useMemo(
        () => buildTherapistMarkerIcon(initials, status),
        [initials, status]
    );
    // "Honey · 12s ago" while live, "Last known · 6:12 PM" once the position
    // is no longer current — matches mockups 04 vs 05/06 exactly.
    const markerLabel = status === 'live'
        ? `${therapistFirstName}${relativeTime ? ` · ${relativeTime}` : ''}`
        : `Last known · ${formatClockTime(lastUpdatedAt) ?? '—'}`;

    return (
        <div className="therapist-live-map rounded-xl overflow-hidden" style={{ border: '1px solid var(--theme-border)', background: 'var(--theme-card)' }}>
            {/* Scoped to .therapist-live-map so these rules — including the
                font-face import below — can never reach anything else in the
                app: no other page's typography or tailwind.config.js's
                global `sans` mapping is touched. Leaflet mounts its zoom
                control as plain DOM outside React's tree, so a scoped
                <style> tag (same technique already used for the marker's
                pulse keyframes above) is how to reskin it safely. */}
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&display=swap');

                .therapist-live-map {
                    font-family: 'Plus Jakarta Sans', sans-serif;
                }
                .therapist-live-map .gps-mono {
                    font-family: 'JetBrains Mono', monospace;
                }

                @keyframes gps-live-pulse {
                    0% { transform: scale(0.6); opacity: 0.8; }
                    100% { transform: scale(2.2); opacity: 0; }
                }
                /* Design notes §6: the halo pulse stops under
                   prefers-reduced-motion — it's purely decorative, never a
                   state signal (that's the freshness pill/marker ring). */
                @media (prefers-reduced-motion: reduce) {
                    .therapist-live-map [style*="gps-live-pulse"] {
                        animation: none !important;
                    }
                }

                /* Marker name/time label (mockups 03-06) — a small chip
                   above the marker, not Leaflet's default speech-bubble
                   tooltip, per the design notes' radius-sm map-chip rule. */
                .therapist-live-map .gps-marker-label {
                    background: var(--theme-card);
                    color: var(--theme-text-head);
                    border: 1px solid var(--theme-border);
                    border-radius: 8px;
                    padding: 3px 9px;
                    font-size: 11px;
                    font-weight: 600;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.22);
                    opacity: 1;
                }
                .therapist-live-map .leaflet-tooltip.gps-marker-label::before {
                    display: none;
                }

                /* Floating connection-status overlay, inside the map
                   viewport's upper-left — no background box, so a soft
                   multi-layer drop-shadow carries contrast over whatever
                   tile colors sit underneath instead (light or dark). */
                .therapist-live-map .gps-status-overlay {
                    filter: drop-shadow(0 1px 2px rgba(0,0,0,0.55)) drop-shadow(0 1px 5px rgba(0,0,0,0.3));
                }

                /* Stale/disconnected: the map itself reads as "last known",
                   not live — dimmed per the design notes (05/06), the
                   marker's own ring/opacity already carries the rest. */
                .therapist-live-map .gps-map-dimmed {
                    filter: brightness(0.82) saturate(0.85);
                }

                /* Subtle bottom-right attribution per the approved mockups —
                   legally required text stays visible/readable/clickable,
                   just quieter than Leaflet's default white pill. */
                .therapist-live-map .leaflet-control-attribution {
                    background: rgba(17,26,46,0.55);
                    color: var(--theme-text-muted);
                    font-size: 10.5px;
                    padding: 1px 6px;
                    border-radius: 4px 0 0 0;
                }
                .therapist-live-map .leaflet-control-attribution a {
                    color: var(--theme-text-2);
                }

                .therapist-live-map .leaflet-control-zoom {
                    border: 1px solid var(--theme-border);
                    border-radius: 8px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.18);
                    overflow: hidden;
                }
                /* Extra clearance above the map's bottom edge — on mobile
                   the booking card overlaps that edge by ~16px (see
                   Dashboard.jsx's StatusTracker); this keeps the relocated
                   bottom-left zoom control clear of that overlap and of the
                   bottom-right attribution, which stays in its own corner. */
                .therapist-live-map .leaflet-bottom.leaflet-left {
                    margin-bottom: 28px;
                }
                .therapist-live-map .leaflet-control-zoom a {
                    background-color: var(--theme-card);
                    color: var(--theme-text-head);
                    border: none;
                }
                .therapist-live-map .leaflet-control-zoom a:hover,
                .therapist-live-map .leaflet-control-zoom a:focus {
                    background-color: var(--theme-btn-bg);
                }
                .therapist-live-map .leaflet-control-zoom-in {
                    border-bottom: 1px solid var(--theme-border);
                }

                /* Design-notes responsive map heights (§2): opt-in via the
                   responsiveHeight prop — the fixed-height legacy path
                   below never applies this class. */
                .therapist-live-map .gps-map-container--responsive {
                    width: 100%;
                    height: 330px;
                }
                @media (min-width: 640px) {
                    .therapist-live-map .gps-map-container--responsive { height: 420px; }
                }
                @media (min-width: 1024px) {
                    .therapist-live-map .gps-map-container--responsive { height: 500px; }
                }
            `}</style>
            {/* Map viewport wrapper — holds either the real MapContainer or
                the "waiting for a position" placeholder, with the one
                connection-status indicator floating over whichever is
                showing, at the upper-left. Minimalist, box-free: no pill
                fill, border or shadow — just a dot/icon, a bold uppercase
                status word and a muted "· updated Xs ago" detail, with a
                soft drop-shadow (not a background) for contrast over both
                light and dark map tiles. Not duplicated in the booking info
                card — StatusTracker's card only shows the booking-lifecycle
                tag (e.g. "Therapist On The Way"). */}
            <div className="relative">
                <div className="gps-status-overlay absolute top-3 left-3 z-[1000] flex items-center gap-2 text-sm pointer-events-none">
                    {status === 'live' ? (
                        <span
                            className="w-2 h-2 rounded-full flex-shrink-0 motion-safe:animate-pulse"
                            style={{ background: statusColor(status), boxShadow: `0 0 6px ${statusColor(status)}99` }}
                            aria-hidden="true"
                        />
                    ) : (
                        <StatusIcon size={14} className={`flex-shrink-0 ${status === 'connecting' ? 'motion-safe:animate-spin' : ''}`}
                            style={{ color: statusColor(status) }} aria-hidden="true" />
                    )}
                    <span className="font-bold uppercase tracking-wide" style={{ color: statusColor(status) }}>
                        {statusWord(status)}
                    </span>
                    {statusSecondary(status, relativeTime) && (
                        <>
                            <span style={{ color: 'var(--theme-text-muted)' }} aria-hidden="true">·</span>
                            <span className="gps-mono" style={{ color: 'var(--theme-text-muted)' }}>
                                {statusSecondary(status, relativeTime)}
                            </span>
                        </>
                    )}
                </div>

                {center ? (
                    <MapContainer
                        center={center}
                        zoom={15}
                        zoomControl={false}
                        className={[
                            responsiveHeight ? 'gps-map-container--responsive' : null,
                            (status === 'stale' || status === 'disconnected') ? 'gps-map-dimmed' : null,
                        ].filter(Boolean).join(' ') || undefined}
                        style={responsiveHeight ? undefined : { height, width: '100%' }}
                        scrollWheelZoom={false}
                    >
                        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
                        <ZoomControl position="bottomleft" />
                        <Marker position={center} icon={markerIcon}>
                            <Tooltip permanent direction="top" offset={[0, -24]} className="gps-marker-label" opacity={1}>
                                {markerLabel}
                            </Tooltip>
                        </Marker>
                        {typeof location.accuracy_meters === 'number' && (
                            <Circle
                                center={center}
                                radius={location.accuracy_meters}
                                pathOptions={{ color: '#3b82f6', weight: 1, fillOpacity: 0.08 }}
                            />
                        )}
                        <RecenterOnMove center={center} />
                        <InvalidateMapSize watch={height} responsive={responsiveHeight} />
                    </MapContainer>
                ) : (
                    // No coordinates yet (connecting, or disconnected before
                    // any location was ever received) — reserve the exact
                    // same responsive height the map itself will occupy once
                    // a position arrives, so the surrounding layout
                    // (StatusTracker's floating card + progress tracker)
                    // never has to reflow when this swaps for the real
                    // MapContainer. No marker or position is invented here.
                    // Plain centered text, not its own status chip — the
                    // floating overlay above already carries the status;
                    // this just names what's being waited for.
                    <div className={`flex items-center justify-center text-xs text-center px-4 ${responsiveHeight ? 'gps-map-container--responsive' : 'py-10'}`}
                        style={{ color: 'var(--theme-text-muted)' }}>
                        {status === 'disconnected'
                            ? 'Connection lost — reconnecting…'
                            : `Waiting for ${therapistFirstName || "the therapist's"} location…`}
                    </div>
                )}
            </div>
        </div>
    );
}
