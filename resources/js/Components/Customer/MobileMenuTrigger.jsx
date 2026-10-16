import { Menu } from 'lucide-react';

// Shared mobile-only trigger for MobileMenuSheet — matches the icon-button
// treatment already used for Dashboard's own trigger (Stage B2A), so Services,
// Therapists, Wishlist, MyBookings and Profile stay visually consistent
// without each page re-declaring the same markup.
export default function MobileMenuTrigger({ onClick, className = '' }) {
    return (
        <button
            onClick={onClick}
            aria-label="Open menu"
            className={`md:hidden w-10 h-10 rounded-full flex items-center justify-center transition-colors flex-shrink-0 ${className}`}
            style={{ background: 'var(--theme-btn-bg)', color: 'var(--theme-text-2)' }}
        >
            <Menu size={18} />
        </button>
    );
}
