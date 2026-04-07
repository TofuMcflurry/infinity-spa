import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';

export default function ThemeToggle() {
    const { theme, toggleTheme } = useTheme();
    const isDark = theme === 'dark';

    return (
        <button
            onClick={toggleTheme}
            className="w-9 h-9 rounded-xl flex items-center justify-center transition-all"
            style={{
                background: 'var(--theme-btn-bg)',
                border:     '1px solid var(--theme-border)',
                color:      isDark ? '#94a3b8' : '#e2b764',
            }}
            title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
            {isDark ? <Moon size={15} /> : <Sun size={15} />}
        </button>
    );
}
