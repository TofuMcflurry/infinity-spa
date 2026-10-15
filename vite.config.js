import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [
        laravel({
            input: 'resources/js/app.jsx',
            refresh: true,
        }),
        react(),
    ],
    server: {
        // LAN QA: Laravel is served from http://192.168.1.7:8000 while Vite
        // serves assets from http://192.168.1.7:5173 — different origins, so
        // the browser CORS-checks every asset/HMR request the Laravel page
        // makes back to Vite. Vite's own default (`defaultAllowedOrigins` in
        // vite/dist/node/chunks/logger.js) only allows localhost/127.0.0.1/
        // [::1] origins, which this LAN IP doesn't match. Listing that same
        // default pattern alongside the one explicit LAN origin below keeps
        // normal localhost dev working while allowing this one LAN origin —
        // without opening CORS to any origin (`cors: true`).
        cors: {
            origin: [
                /^https?:\/\/(?:(?:[^:]+\.)?localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/,
                'http://192.168.1.7:8000',
            ],
        },
    },
});
