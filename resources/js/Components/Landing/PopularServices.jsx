import { useEffect, useState } from "react";
import { Clock, Star } from "lucide-react";
import { Button } from "@/Components/Landing/ui/button";
import axios from "axios";
import gallery1 from "@/assets/gallery-1.jpg";
import gallery2 from "@/assets/gallery-2.jpg";
import gallery4 from "@/assets/gallery-4.jpg";

// Transitional fallback only, while services.image remains unassigned in the
// database: real services have no uploaded Admin photo yet, so each is mapped
// to one of the 4 existing landing-page photos by id (not name, since names
// can change). Once an Admin uploads a real photo for a service, the API's
// image_url takes over for that id automatically (see resolveServiceImage
// below) — this map is never read for an id that has one. Any future service
// id not listed here falls back to FALLBACK_IMAGE.
const SERVICE_IMAGES = {
    19: gallery1, // Couple Massage
    20: gallery2, // Full Body Scrub
    21: gallery4, // Swedish Massage
};
const FALLBACK_IMAGE = gallery1;

// Admin-uploaded photo (image_url) wins when present; otherwise the
// transitional per-id gallery mapping; otherwise the neutral fallback.
const resolveServiceImage = (service) => service.image_url || SERVICE_IMAGES[service.id] || FALLBACK_IMAGE;

// Guest (landing-page) bookings are always 60-minute sessions, so each card
// shows only that variant's duration/price — never a range, never "from".
// Services with no active 60-min variant (guest_variant === null) are
// filtered out below rather than shown with a different duration.
const formatDuration = (service) => `${service.guest_variant.duration_minutes} min`;
const formatPrice = (service) => `AED ${service.guest_variant.price}`;

function SkeletonCard({ className }) {
    return (
        <div className={className}>
            <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border/50 bg-card animate-pulse">
                <div className="aspect-[4/3] bg-muted/40 max-sm:h-[170px] max-sm:aspect-auto" />
                <div className="flex flex-1 flex-col p-6 max-sm:p-4">
                    <div className="h-5 w-3/4 rounded bg-muted/40" />
                    <div className="mt-3 h-3 w-full rounded bg-muted/30" />
                    <div className="mt-1.5 h-3 w-2/3 rounded bg-muted/30" />
                    <div className="mt-auto pt-4 h-9 w-full rounded-lg bg-muted/30" />
                </div>
            </div>
        </div>
    );
}

// One card renderer shared by the <640px carousel and the >=640px grid — the
// only difference between the two contexts is the className passed in
// (image height/aspect, padding, text sizes), everything structural
// (flex-col h-full, title truncate, description min-h-[2lh], the mt-auto
// bottom group) is identical so the two layouts can never drift apart again.
function ServiceCard({ service: s, onSelectService, variant }) {
    const isCompact = variant === "compact";
    // Local src state so a broken/unreachable storage URL (e.g. a stale
    // Cloudflare-cached path) swaps to the neutral fallback instead of
    // leaving an empty image box — resets whenever the underlying service
    // (or its resolved image) changes.
    const [imgSrc, setImgSrc] = useState(() => resolveServiceImage(s));
    useEffect(() => { setImgSrc(resolveServiceImage(s)); }, [s.id, s.image_url]);

    return (
        <article
            className={`group flex h-full flex-col overflow-hidden border border-border/50 bg-card transition-smooth sm:hover:-translate-y-1 sm:hover:border-primary/50 sm:hover:shadow-luxe ${isCompact ? "rounded-[12px]" : "rounded-2xl"}`}
        >
            <div className={`relative overflow-hidden ${isCompact ? "h-[170px]" : "aspect-[4/3]"}`}>
                <img
                    src={imgSrc}
                    onError={() => { if (imgSrc !== FALLBACK_IMAGE) setImgSrc(FALLBACK_IMAGE); }}
                    alt={s.name}
                    loading="lazy"
                    className="h-full w-full object-cover transition-smooth duration-700 group-hover:scale-110"
                />
                {!isCompact && <div className="absolute inset-0 bg-gradient-to-t from-card via-card/20 to-transparent" />}
                {s.rating !== null && s.rating >= 4.0 && (
                    <div
                        className={
                            isCompact
                                ? "absolute left-2.5 top-2.5 flex items-center gap-1 rounded-[6px] bg-[#0B1222]/[.78] px-2 py-1 text-xs"
                                : "absolute right-3 top-3 flex items-center gap-1 rounded-full border border-primary/40 bg-background/80 px-2.5 py-1 text-xs backdrop-blur"
                        }
                    >
                        <Star className="h-3 w-3 fill-primary text-primary" />
                        <span className={`font-medium ${isCompact ? "text-white" : ""}`}>{s.rating.toFixed(1)}</span>
                    </div>
                )}
            </div>

            <div className={`flex flex-1 flex-col ${isCompact ? "p-4" : "p-6"}`}>
                <h3 className={`truncate font-display font-medium leading-snug ${isCompact ? "text-[19px]" : "text-xl"}`}>
                    {s.name}
                </h3>
                <p className={`line-clamp-2 min-h-[2lh] text-muted-foreground ${isCompact ? "mt-1.5 text-[13px]" : "mt-2 text-sm"}`}>
                    {s.description}
                </p>

                {/* Fixed to the bottom of the card regardless of how much
                    space the title/description above actually used, so the
                    meta row and button line up across every card. */}
                <div className="mt-auto">
                    <div className="flex items-center justify-between gap-2 text-sm">
                        <div className="flex items-center gap-1.5 whitespace-nowrap leading-none text-muted-foreground">
                            <Clock className={isCompact ? "h-3.5 w-3.5 flex-shrink-0" : "h-4 w-4 flex-shrink-0"} />
                            {formatDuration(s)}
                        </div>
                        <div className={`whitespace-nowrap font-display leading-none text-gradient-gold ${isCompact ? "text-lg font-bold" : "text-2xl"}`}>
                            {formatPrice(s)}
                        </div>
                    </div>

                    <Button
                        variant={isCompact ? "outlineGold" : "luxe"}
                        className={isCompact ? "mt-4 h-10 w-full rounded-[8px]" : "mt-4 w-full"}
                        asChild
                    >
                        <a href="#booking" onClick={() => onSelectService?.(s.id)}>Book Now</a>
                    </Button>
                </div>
            </div>
        </article>
    );
}

export const Services = ({ onSelectService } = {}) => {
    const [services, setServices] = useState([]);
    const [status, setStatus] = useState("loading"); // loading | ready | error

    const fetchServices = () => {
        setStatus("loading");
        axios.get("/api/guest/services")
            .then((res) => {
                setServices(res.data);
                setStatus("ready");
            })
            .catch(() => setStatus("error"));
    };

    useEffect(() => {
        fetchServices();
    }, []);

    // Only services bookable as a 60-minute guest session are shown.
    const bookableServices = services.filter((s) => s.guest_variant);

    const renderCarousel = () => {
        if (status === "loading") {
            return (
                <div className="mt-8 -mx-5 flex gap-3 overflow-x-auto px-5 pb-2 sm:hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                    {[0, 1, 2].map((i) => (
                        <SkeletonCard key={i} className="w-[min(80vw,300px)] flex-shrink-0" />
                    ))}
                </div>
            );
        }
        if (status === "error") {
            return (
                <p className="mt-8 text-center text-sm text-muted-foreground sm:hidden">
                    Couldn't load our treatments right now. Please try again shortly.
                </p>
            );
        }
        if (bookableServices.length === 0) {
            return (
                <p className="mt-8 text-center text-sm text-muted-foreground sm:hidden">
                    No treatments available right now. Please check back soon.
                </p>
            );
        }
        return (
            <div className="mt-8 -mx-5 flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-px-5 px-5 pb-2 sm:hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                {bookableServices.map((s) => (
                    <div key={s.id} className="w-[min(80vw,300px)] flex-shrink-0 snap-start">
                        <ServiceCard service={s} onSelectService={onSelectService} variant="compact" />
                    </div>
                ))}
            </div>
        );
    };

    const renderGrid = () => {
        if (status === "loading") {
            return (
                <div className="mt-16 hidden sm:grid sm:grid-cols-3 gap-4 lg:gap-6 max-w-4xl mx-auto">
                    {[0, 1, 2].map((i) => (
                        <SkeletonCard key={i} className="" />
                    ))}
                </div>
            );
        }
        if (status === "error") {
            return (
                <p className="mt-16 hidden sm:block text-center text-sm text-muted-foreground">
                    Couldn't load our treatments right now. Please try again shortly.
                </p>
            );
        }
        if (bookableServices.length === 0) {
            return (
                <p className="mt-16 hidden sm:block text-center text-sm text-muted-foreground">
                    No treatments available right now. Please check back soon.
                </p>
            );
        }
        return (
            <div className="mt-16 hidden sm:grid sm:grid-cols-3 gap-4 lg:gap-6 max-w-4xl mx-auto">
                {bookableServices.map((s) => (
                    <ServiceCard key={s.id} service={s} onSelectService={onSelectService} variant="wide" />
                ))}
            </div>
        );
    };

    return (
        <section id="services" className="relative scroll-mt-16 sm:scroll-mt-20 py-10 px-5 md:py-24 md:px-0">
            <div className="md:container">
                <div className="mx-auto max-w-2xl text-center">
                    <span className="gold-divider text-xs uppercase tracking-[0.3em] text-primary">
                        Signature Treatments
                    </span>
                    <h2 className="mt-4 font-display text-4xl sm:text-5xl md:text-6xl">
                        Popular <span className="italic text-gradient-gold">Services</span>
                    </h2>
                    <p className="mt-4 text-muted-foreground">
                        Curated rituals designed by world-class therapists, delivered with
                        Emirati hospitality.
                    </p>
                </div>

                {renderCarousel()}
                {renderGrid()}
            </div>
        </section>
    );
};
