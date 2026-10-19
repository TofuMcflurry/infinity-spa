import { useEffect, useRef } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

// Generic, always-centered confirmation dialog — used at every breakpoint
// (unlike <BottomSheet>, which is presentation for below `md` only), because
// guarded actions like address deletion or logout need the same accessible
// confirm/cancel flow on desktop too, not just on mobile. Presentation-only:
// callers own all state and the actual destructive call — this component
// never calls an API itself. Escape/backdrop/Cancel invoke onCancel; only the
// confirm button invokes onConfirm. While confirmLoading is true, Escape and
// backdrop dismissal are both blocked (same as the already-disabled Cancel
// button) so a pending request can't be dismissed out from under the user.
const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])';

export default function ConfirmDialog({
    open,
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    onConfirm,
    onCancel,
    confirmLoading = false,
    danger = true,
}) {
    const panelRef = useRef(null);

    // Callers may pass fresh onCancel/onConfirm closures on every render
    // while the dialog stays open — route through refs so the lifecycle
    // effect below stays keyed on `open` alone (mirrors BottomSheet.jsx).
    const onCancelRef = useRef(onCancel);
    useEffect(() => { onCancelRef.current = onCancel; }, [onCancel]);

    // Same ref-routing reason: Escape must see the *current* confirmLoading
    // without re-running the open-keyed effect below every time it flips.
    const confirmLoadingRef = useRef(confirmLoading);
    useEffect(() => { confirmLoadingRef.current = confirmLoading; }, [confirmLoading]);

    useEffect(() => {
        if (!open) return undefined;

        const previouslyFocused = document.activeElement;
        const prevBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const raf = requestAnimationFrame(() => {
            const first = panelRef.current?.querySelector(FOCUSABLE_SELECTOR);
            first?.focus();
        });

        const onKeyDown = (e) => {
            if (e.key === 'Escape') {
                if (confirmLoadingRef.current) return; // block Escape while a request is pending
                e.stopPropagation();
                onCancelRef.current();
                return;
            }
            if (e.key !== 'Tab' || !panelRef.current) return;
            const focusables = Array.from(panelRef.current.querySelectorAll(FOCUSABLE_SELECTOR));
            if (focusables.length === 0) {
                // Both buttons are disabled mid-request, so there's nothing to
                // cycle to — swallow Tab instead of letting focus leak out to
                // the page behind the dialog.
                e.preventDefault();
                return;
            }
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
            document.removeEventListener('keydown', onKeyDown);
            document.body.style.overflow = prevBodyOverflow;
            cancelAnimationFrame(raf);
            if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
        };
    }, [open]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div
                className="absolute inset-0"
                style={{ background: 'rgba(28,22,12,0.45)' }}
                onClick={() => { if (!confirmLoading) onCancel(); }}
                aria-hidden="true"
            />
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="confirm-dialog-title"
                aria-describedby="confirm-dialog-message"
                className="relative w-full max-w-sm rounded-2xl shadow-2xl p-5"
                style={{ background: 'var(--theme-card)', border: '1px solid var(--theme-border)' }}
            >
                <div className="flex items-start gap-3 mb-5">
                    <span className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-destructive/10">
                        <AlertTriangle className="w-5 h-5 text-destructive" />
                    </span>
                    <div className="min-w-0 pt-1.5">
                        <h3 id="confirm-dialog-title" className="font-display font-semibold text-lg" style={{ color: 'var(--theme-text-head)' }}>
                            {title}
                        </h3>
                        <p id="confirm-dialog-message" className="text-sm mt-1 leading-snug" style={{ color: 'var(--theme-text-2)' }}>
                            {message}
                        </p>
                    </div>
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={onCancel}
                        disabled={confirmLoading}
                        className="flex-1 h-11 rounded-xl text-sm font-medium transition-all disabled:opacity-60"
                        style={{ background: 'var(--theme-btn-bg)', color: 'var(--theme-text-2)' }}
                    >
                        {cancelLabel}
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={confirmLoading}
                        className={`flex-1 h-11 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-60 ${
                            danger ? 'bg-destructive text-destructive-foreground' : 'gold-gradient text-primary-foreground'
                        }`}
                    >
                        {confirmLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
