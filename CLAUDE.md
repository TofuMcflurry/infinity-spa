# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This App Does

Infinity is a **massage/therapy booking platform** — a two-sided marketplace connecting customers with therapists, with an admin layer for platform management.

- **Customers** browse therapists and services, book sessions, upload downpayment proofs, and leave reviews.
- **Therapists** accept/reject bookings, update booking status (en-route → arrived → completed), and manage their profile and service zones.
- **Admins** approve/deactivate therapists and verify downpayments.

## Commands

```bash
# Start all dev services concurrently (Laravel, queue, log streamer, Vite)
composer dev

# Run only the frontend
npm run dev

# Production build
npm run build

# Run tests
composer test
# or
php artisan test

# Full first-time setup
composer setup
```

## Architecture

**Stack:** Laravel 12 + React 18 via Inertia.js 2.0. Inertia replaces the API layer — controllers return `Inertia::render(...)` responses, and the frontend uses `router.post/get` and `useForm` from `@inertiajs/react` instead of direct fetch calls.

**Route organization** (`routes/web.php`, single file):
- Public: `/`
- Customer: `/dashboard`, `/book-session`, etc. + `/api/*` inlined API endpoints
- Therapist: `/therapist/*` + `/therapist/api/*`
- Admin: `/admin/*`
- Auth: Breeze routes from `routes/auth.php`

There is no separate `routes/api.php` — all JSON endpoints live in `web.php` under `/api` or `/therapist/api` prefixes, protected by role middleware.

**Multi-role auth:** Single `users` table with a `role` column (`customer`, `therapist`, `admin`). Middleware (`EnsureCustomer`, `EnsureTherapist`, `EnsureAdmin`) enforces access. Users also authenticate via Google OAuth and OTP codes.

**Frontend structure (`resources/js/`):**
- `Pages/` — Inertia page components, organized by role (`customer/`, `therapist/`, `admin/`, `Auth/`)
- `Layouts/` — `AuthenticatedLayout.jsx` (customer), `TherapistLayout.jsx`, `AdminLayout.jsx`, `GuestLayout.jsx`
- `Components/` — Shared UI: form inputs, modals, buttons, plus Radix UI primitives in `Landing/ui/`
- `contexts/` — React Context for language (EN/AR) and theme (dark mode default)

**Styling:** Tailwind v3.2 with `darkMode: ["class"]`. Custom CSS variables define the brand palette (gold, onyx, marble, champagne). Fonts: Playfair Display, Montserrat, Cormorant Garamond.

## Key Models & Relationships

| Model | Key Relationships |
|---|---|
| `User` | `hasOne(Therapist)`, `hasMany(Booking, 'customer_id')`, `hasMany(CustomerAddress)` |
| `Booking` | `belongsTo(User, customer_id)`, `belongsTo(Therapist)`, `belongsTo(Service)`, `hasOne(Review)` |
| `Therapist` | `belongsTo(User)`, `hasMany(Booking)`, `hasMany(TherapistZone)` |
| `Review` | `belongsTo(Booking)`, `belongsTo(Therapist)`, `belongsTo(Service)` |

**Booking lifecycle:** `pending` → `accepted` / `rejected` → `en_route` → `arrived` → `completed`

**Ratings:** Calculated using a CSAT-style formula (5★=100, 4★=80, etc.), logged in `ServiceRatingLog` and `TherapistRatingLog` for audit history.

**Downpayment flow:** Embedded on `Booking` — amount, proof image upload, verification status, and bank details are all on the booking record.

**Zones:** `TherapistZone` records define service areas and travel times per therapist, used for slot availability calculation.

## Inertia Conventions

- Use `Inertia::render('PageName', $props)` in controllers — avoid returning JSON directly unless the route is a pure `/api/*` endpoint called via Axios.
- Use `router` from `@inertiajs/react` for navigation; use `useForm` for forms with server-side validation.
- Named routes are available in JS via Ziggy's `route()` helper.
- Flash messages are passed via `session()->flash()` and read from `usePage().props`.
