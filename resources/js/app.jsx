import '../css/app.css';
import '../css/dashboard.css';
import './bootstrap';

// Apply saved theme before first render to prevent flash.
// The public landing page ('/') always renders dark, regardless of the
// user's saved preference — see resources/js/Pages/Welcome.jsx.
(function () {
    const isLanding = window.location.pathname === '/';
    const t = isLanding ? 'dark' : (localStorage.getItem('theme') ?? 'dark');
    document.documentElement.setAttribute('data-theme', t);
})();
import { createInertiaApp } from '@inertiajs/react';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
import { createRoot } from 'react-dom/client';
import { LanguageProvider } from './contexts/LanguageContext';

const appName = import.meta.env.VITE_APP_NAME || 'Laravel';

createInertiaApp({
    title: (title) => `${title} - ${appName}`,
    resolve: (name) =>
        resolvePageComponent(
            `./Pages/${name}.jsx`,
            import.meta.glob('./Pages/**/*.jsx'),
        ),
    setup({ el, App, props }) {
        const root = createRoot(el);

        root.render(
            <LanguageProvider>
                <App {...props} />
            </LanguageProvider>
        );
    },
    progress: {
        color: '#4B5563',
    },
});