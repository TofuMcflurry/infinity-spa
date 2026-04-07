import { useState, useEffect } from 'react';

const THEME_EVENT = 'infinity-theme-change';

export function useTheme() {
    const [theme, setTheme] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('theme') ?? 'dark';
        }
        return 'dark';
    });

    // Keep all instances in sync via custom event
    useEffect(() => {
        const handler = (e) => setTheme(e.detail);
        window.addEventListener(THEME_EVENT, handler);
        return () => window.removeEventListener(THEME_EVENT, handler);
    }, []);

    const toggleTheme = () => {
        const next = theme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('theme', next);
        window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: next }));
    };

    return { theme, toggleTheme };
}
