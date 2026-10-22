import { useEffect, useState } from "react";
import gallery1 from "@/assets/gallery-1.jpg";
import gallery2 from "@/assets/gallery-2.jpg";
import gallery4 from "@/assets/gallery-4.jpg";

// Approved, name-matched transitional photographs for the three real
// services, keyed by id (not name, since names can change). Shared by the
// Landing Page and Admin Services so both ever show the exact same photo
// for the same service when the Admin-managed upload is unavailable.
// Preserved verbatim from the original design — see PopularServices.jsx git
// history (commit 94597ab's static prototype, carried forward unchanged by
// commit 6c6a8b5's switch to real DB-driven services). Never reassign these
// without separate, explicit approval.
export const SERVICE_IMAGE_FALLBACKS = {
    19: gallery1, // Couple Massage
    20: gallery2, // Full Body Scrub
    21: gallery4, // Swedish Massage
};

// Neutral last-resort image — only used where the caller opts in via
// includeNeutralFallback, and only once neither the Admin-managed photo nor
// this service's own mapped photograph is available or loadable.
export const NEUTRAL_FALLBACK_IMAGE = gallery1;

// Ordered, deduplicated list of image sources to try for a service, highest
// priority first: the Admin-managed upload, then this service's own mapped
// photograph, then (when includeNeutralFallback is true) the neutral
// fallback. Duplicates are removed so the same src is never attempted twice
// (e.g. a service's mapped photo already being the neutral fallback image).
export function resolveImageCandidates(service, { includeNeutralFallback = true } = {}) {
    const candidates = [
        service?.image_url || null,
        SERVICE_IMAGE_FALLBACKS[service?.id] || null,
        includeNeutralFallback ? NEUTRAL_FALLBACK_IMAGE : null,
    ].filter(Boolean);

    return candidates.filter((src, i) => candidates.indexOf(src) === i);
}

// Drives the <img src/onError> pair for one service's photo. Tries each
// candidate in resolveImageCandidates() order; onError advances to the next
// one and stops advancing once the list is exhausted (never retries the
// same failed src, so there is no infinite-loop risk). Resets back to the
// highest-priority candidate whenever the service's id or image_url changes
// — e.g. right after an Admin upload replaces it — so a newly successful
// image_url always gets tried again rather than staying stuck on an earlier
// fallback. When no candidate is available at all (includeNeutralFallback:
// false and neither an upload nor a mapped photo exists), src is null —
// callers render their own placeholder in that case.
export function useFallbackImage(service, options) {
    const candidates = resolveImageCandidates(service, options);
    const [index, setIndex] = useState(0);

    useEffect(() => {
        setIndex(0);
    }, [service?.id, service?.image_url]);

    const handleError = () => {
        setIndex((i) => (i + 1 < candidates.length ? i + 1 : i));
    };

    return { src: candidates[index] ?? null, onError: handleError };
}
