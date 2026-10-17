import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

// Generic mobile bottom sheet shell — overlay, bottom-anchored panel, grabber,
// scrollable body, optional sticky footer — matching the Claude Design
// prototype's reusable <BottomSheet> spec (README.md in the design handoff:
// "<BottomSheet> component (reusable, used below `md`; keep the centred
// modals on desktop)"). Presentation-only: callers own all state/handlers.
//
// Scroll lock, Escape-to-close, focus trap, and focus restoration mirror
// MobileMenuSheet.jsx's implementation — the prototype only specifies
// backdrop-dismiss; the rest is standard dialog a11y this component needs
// regardless of what the reference shows.
const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])';

export default function BottomSheet({ open, onClose, title, subtitle, footer, ariaLabel, children }) {
    const panelRef = useRef(null);

    // Callers (e.g. a wizard step) may pass a fresh onClose closure on every
    // render while the sheet stays open — route through a ref so the
    // lifecycle effect below stays keyed on `open` alone, matching
    // MobileMenuSheet's rationale for the same pattern.
    const onCloseRef = useRef(onClose);
    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    // This shell is CSS-hidden (md:hidden) rather than unmounted above `md`,
    // so a caller that also keeps its own desktop modal mounted on the same
    // `open` flag (see Bookings.jsx) would otherwise have this component's
    // body-scroll-lock and Escape handling silently engage behind an
    // invisible panel at desktop widths. Gate the global side effects to
    // only engage while the sheet is actually the visible one (<768px), and
    // track live resizes so crossing the breakpoint while open
    // engages/disengages correctly instead of leaking a stale lock.
    useEffect(() => {
        if (!open) return undefined;

        const mql = window.matchMedia('(min-width: 768px)');
        let active = false;
        let previouslyFocused = null;
        let prevBodyOverflow = '';
        let raf = null;

        const engage = () => {
            if (active) return;
            active = true;
            previouslyFocused = document.activeElement;
            prevBodyOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
            raf = requestAnimationFrame(() => {
                const first = panelRef.current?.querySelector(FOCUSABLE_SELECTOR);
                first?.focus();
            });
        };
        const disengage = () => {
            if (!active) return;
            active = false;
            document.body.style.overflow = prevBodyOverflow;
            if (raf) cancelAnimationFrame(raf);
            if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
        };

        if (!mql.matches) engage();

        const onViewportChange = (e) => {
            if (e.matches) disengage();
            else engage();
        };
        mql.addEventListener('change', onViewportChange);

        const onKeyDown = (e) => {
            if (!active) return;
            if (e.key === 'Escape') {
                e.stopPropagation();
                onCloseRef.current();
                return;
            }
            if (e.key !== 'Tab' || !panelRef.current) return;
            const focusables = Array.from(panelRef.current.querySelectorAll(FOCUSABLE_SELECTOR));
            if (focusables.length === 0) return;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', onKeyDown);

        return () => {
            mql.removeEventListener('change', onViewportChange);
            document.removeEventListener('keydown', onKeyDown);
            disengage();
        };
    }, [open]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[60] md:hidden">
            <div
                className="absolute inset-0"
                style={{ background: 'rgba(28,22,12,0.45)' }}
                onClick={onClose}
                aria-hidden="true"
            />
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-label={ariaLabel || title}
                className="absolute bottom-0 left-0 right-0 flex flex-col"
                style={{
                    maxHeight: '90dvh',
                    background: 'var(--theme-bg)',
                    borderRadius: '26px 26px 0 0',
                    boxShadow: '0 -12px 40px rgba(0,0,0,0.18)',
                }}
            >
                <div className="mx-auto mt-2 mb-0.5 w-10 h-[5px] rounded-full flex-shrink-0" style={{ background: '#d9cfbc' }} />

                {/* Header */}
                <div className="flex-shrink-0 flex items-start gap-2 px-4 pt-2 pb-1">
                    <div className="flex-1 min-w-0 pt-1">
                        <h2 className="font-display text-2xl font-semibold leading-tight truncate" style={{ color: 'var(--theme-text-head)' }}>
                            {title}
                        </h2>
                        {subtitle && (
                            <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--theme-text-muted)' }}>
                                {subtitle}
                            </p>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        aria-label="Close"
                        className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ color: 'var(--theme-text-2)' }}
                    >
                        <X size={22} />
                    </button>
                </div>

                {/* Scrollable body */}
                <div
                    className="flex-1 min-h-0 overflow-y-auto px-4"
                    style={{ overscrollBehavior: 'contain', paddingBottom: footer ? 16 : 'max(16px, env(safe-area-inset-bottom))' }}
                >
                    {children}
                </div>

                {/* Optional sticky footer */}
                {footer && (
                    <div
                        className="flex-shrink-0 px-4 pt-3 border-t"
                        style={{ borderColor: 'var(--theme-border)', paddingBottom: 'max(14px, env(safe-area-inset-bottom))' }}
                    >
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
}
