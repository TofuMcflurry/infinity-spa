import { useState, useEffect } from 'react';

const THEME_EVENT = 'infinity-theme-change';

export function useTheme() {
    const [theme, setTheme] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('theme') ?? 'dark';
        }
        return 'dark';
    });

    // Apply the theme to DOM for authenticated/inner pages only.
    // Landing page (`/`) must stay in its original dark luxury design.
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (window.location?.pathname === '/') return;
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    // Keep all instances in sync via custom event
    useEffect(() => {
        const handler = (e) => setTheme(e.detail);
        window.addEventListener(THEME_EVENT, handler);
        return () => window.removeEventListener(THEME_EVENT, handler);
    }, []);

    const toggleTheme = () => {
        if (typeof window !== 'undefined' && window.location?.pathname === '/') {
            // Do not apply theme on the public landing page
            return;
        }

        const next = theme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('theme', next);
        setTheme(next);
        if (typeof document !== 'undefined') {
            document.documentElement.setAttribute('data-theme', next);
        }
        window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: next }));
    };

    return { theme, toggleTheme };
}
