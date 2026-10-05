import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Navigation, WifiOff, Clock } from 'lucide-react';
import { useTherapistLiveLocation } from '@/hooks/useTherapistLiveLocation';

// GPS v1 map provider — deliberately NOT an AWS-specific tile service yet
// (ADR §14/§20): a plain OSM-compatible tile URL + attribution, overridable
// via env so the provider can be swapped later (e.g. for Amazon Location
// Service's tile endpoint) without touching this component's structure.
const TILE_URL = import.meta.env.VITE_GPS_TILE_URL
    ?? 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = import.meta.env.VITE_GPS_TILE_ATTRIBUTION
    ?? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// A small pulsing dot instead of Leaflet's default marker image — avoids
// the well-known default-icon-path bundling issue entirely and reads more
// clearly as "this is a live position", not a static pin.
const liveIcon = L.divIcon({
    className: '',
    html: `
        <span style="position:relative;display:flex;align-items:center;justify-content:center;width:18px;height:18px;">
            <span style="position:absolute;inset:-6px;border-radius:50%;background:rgba(59,130,246,0.25);animation:gps-live-pulse 1.6s ease-out infinite;"></span>
            <span style="width:14px;height:14px;border-radius:50%;background:#3b82f6;border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,0.15);"></span>
        </span>
        <style>@keyframes gps-live-pulse { 0% { transform: scale(0.6); opacity: 0.8; } 100% { transform: scale(2.2); opacity: 0; } }</style>
    `,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
});

function statusColor(status) {
    switch (status) {
        case 'live':         return '#10b981';
        case 'stale':         return '#f59e0b';
        case 'disconnected': return '#ef4444';
        default:              return '#3b82f6';
    }
}

function statusMessage(status) {
    switch (status) {
        case 'live':         return 'Live location';
        case 'stale':         return 'Location update paused';
        case 'disconnected': return 'Reconnecting…';
        case 'connecting':   return 'Connecting…';
        default:              return '';
    }
}

function formatLastUpdated(timestamp) {
    if (!timestamp) return null;
    const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
    if (seconds < 5) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    return `${Math.round(seconds / 60)}m ago`;
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

// Shows the assigned therapist's live location for one booking while it's
// en_route. Renders nothing outside that window — no historical breadcrumbs,
// no fallback "last known" marker once the booking has moved on.
export default function TherapistLiveMap({ booking }) {
    const { location, lastUpdatedAt, status } = useTherapistLiveLocation(booking);

    // Ticks once a second while live so "Xs ago" stays accurate without the
    // hook itself needing its own render-triggering interval.
    const [, forceTick] = useState(0);
    useEffect(() => {
        if (status !== 'live') return;
        const id = setInterval(() => forceTick((t) => t + 1), 1_000);
        return () => clearInterval(id);
    }, [status]);

    if (status === 'idle') return null;

    const center = location ? [location.latitude, location.longitude] : null;

    return (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--theme-border)', background: 'var(--theme-card)' }}>
            <div className="flex items-center justify-between px-3 py-2 text-xs">
                <div className="flex items-center gap-1.5 font-semibold" style={{ color: statusColor(status) }}>
                    {status === 'disconnected' ? <WifiOff size={13} /> : <Navigation size={13} />}
                    {statusMessage(status)}
                </div>
                {lastUpdatedAt && (
                    <div className="flex items-center gap-1" style={{ color: 'var(--theme-text-muted)' }}>
                        <Clock size={11} />
                        {formatLastUpdated(lastUpdatedAt)}
                    </div>
                )}
            </div>

            {center ? (
                <MapContainer
                    center={center}
                    zoom={15}
                    style={{ height: 220, width: '100%' }}
                    scrollWheelZoom={false}
                >
                    <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
                    <Marker position={center} icon={liveIcon} />
                    {typeof location.accuracy_meters === 'number' && (
                        <Circle
                            center={center}
                            radius={location.accuracy_meters}
                            pathOptions={{ color: '#3b82f6', weight: 1, fillOpacity: 0.08 }}
                        />
                    )}
                    <RecenterOnMove center={center} />
                </MapContainer>
            ) : (
                <div className="flex items-center justify-center text-xs py-10" style={{ color: 'var(--theme-text-muted)' }}>
                    {status === 'disconnected' ? 'Reconnecting…' : "Waiting for the therapist's location…"}
                </div>
            )}
        </div>
    );
}
