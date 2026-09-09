<p align="center">
  <img src="https://raw.githubusercontent.com/laravel/art/master/logo-lockup/5%20SVG/2%20CMYK/1%20Full%20Color/laravel-logolockup-cmyk-red.svg" width="300" alt="Laravel Logo">
</p>

<h1 align="center">✨ Infinity Home Spa — Booking System</h1>

<p align="center">
  A full-stack luxury spa booking platform built with Laravel, React, and Inertia.js —
  featuring role-based dashboards, real-time updates, integrated online payments, and an enterprise-grade service management system.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Laravel-11-red?logo=laravel" alt="Laravel">
  <img src="https://img.shields.io/badge/React-18-blue?logo=react" alt="React">
  <img src="https://img.shields.io/badge/Inertia.js-SSR-purple" alt="Inertia">
  <img src="https://img.shields.io/badge/PostgreSQL-Database-336791?logo=postgresql" alt="PostgreSQL">
  <img src="https://img.shields.io/badge/WebSocket-Reverb-orange" alt="Laravel Reverb">
  <img src="https://img.shields.io/badge/Stripe-Payments-635BFF?logo=stripe" alt="Stripe">
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License">
</p>

---

## 📖 About the Project

Infinity Home Spa is a luxury home-service spa booking platform that allows customers to browse services, book therapists, and manage appointments — while giving therapists and admins full control over scheduling, payments, and operations.

Built as a capstone and portfolio project to demonstrate full-stack development with real-time features, role-based access control, integrated payment gateway processing, analytics dashboards, and a polished UI with dark/light mode support.

---

## ✨ Features

### 👤 Customer Portal
- **Authentication** — Email OTP verification + Google OAuth login
- **Service Browsing** — Browse grouped spa services with real-time availability and bilingual (EN/AR) support
- **Multi-step Booking Flow** — Step-by-step booking with calendar, time slot selection, and payment
- **Address Book** — Save multiple addresses with Dubai service zone selection
- **Online Payments via Stripe** — Downpayment or full payment at checkout via Stripe Checkout, with webhook-confirmed status updates (see below)
- **Loyalty Rewards & Voucher Redemption** — Every 10 completed bookings unlocks a free 60-minute session via a voucher code, redeemable in the booking wizard (see below)
- **My Bookings Dashboard** — Real-time booking status tracking with WebSocket updates
- **Review & Rating System** — CSAT ratings for completed bookings
- **Profile Management** — Avatar upload and profile editing

### 💆 Therapist Dashboard
- **Booking Management** — View and manage assigned bookings with status updates (En Route → Arrived → Completed)
- **Schedule Management** — Calendar view, unavailable slot marking, and rest day requests
- **Earnings Tracker** — Weekly earnings stats with transaction history
- **Cancellation Handling** — Cancel bookings with reason input
- **In-app Notifications** — Real-time notification bell with mark-as-read support

### 🛠️ Admin Panel
- **Dashboard** — Stats overview with charts and recent booking activity
- **Bookings Manager** — FIFO queue system with dedicated Guest Bookings page and pending badge
- **Therapist Management** — Approve, deactivate, and manage therapist accounts
- **CSAT Performance Monitoring** — Automatically flags therapists whose average rating drops below 3.5 stars for coaching review
- **Customer Management** — Block/unblock accounts and review customer-submitted reports
- **Trust & Safety Module** — 3-tier violation system (warning → temp block → permanent block) with automatic escalation for repeated policy violations
- **Payment Visibility** — View Stripe payment status, amount paid, and payment intent reference per booking — automatic confirmation means no manual approval step is required for the payment itself
- **Legacy Manual Verification** — Manual bank-transfer proof-of-payment review is retained in the codebase as a fallback path for non-Stripe scenarios
- **Auto-cancel** — Automatically cancels past-due unconfirmed bookings
- **Service Management** — Full CRUD with parent-variant pricing structure (see below)
- **Audit Trail** — System-wide event logging (booking actions, payment verification, refunds) for accountability and compliance tracking
- **Reports Dashboard** — Revenue analytics, booking trends, and therapist performance (see below)

### 💳 Payment Gateway Integration (Stripe)
- **Stripe Checkout** — Redirect-based checkout session per booking, priced from the `ServiceVariant`, confirmed server-to-server via a signed webhook (`checkout.session.completed`) rather than the client redirect
- **Flexible & Resilient** — 20% downpayment or full payment upfront, idempotent webhook processing, partial refunds on cancellation, and automatic cleanup of abandoned checkouts (session expiry + scheduled sweep)

📄 For a detailed technical write-up of the payment architecture and webhook flow, see [ARCHITECTURE.md](./ARCHITECTURE.md).

### 🎁 Loyalty Voucher Redemption
- **Earn & Redeem** — Every 10 completed bookings unlocks a free 60-minute session via a unique voucher code (`IHS-FREE-XXXX`), applied in the booking wizard's payment step for a fully comped, instantly confirmed booking
- **Cancellation Policy** — Same 24-hour grace period as paid bookings: restored if cancelled with enough notice, forfeited otherwise (see [ARCHITECTURE.md](./ARCHITECTURE.md))

### 📦 Service Management System
- **Parent-Variant Structure** — One service (e.g. "Couple Massage") with multiple duration/price options (60 min / 90 min / 120 min)
- **Per-Variant Availability Toggle** — Mark individual durations as "Unavailable" without deleting — booking history preserved
- **Archive Instead of Delete** — Services are archived, never permanently deleted — maintains data integrity across all historical bookings
- **Image Upload** — Per-service image stored in public disk
- **Zero-Data-Loss Migration** — Custom Artisan command (`services:migrate-variants`) with dry-run support migrated 75 existing bookings to the new variant schema without any data loss

### 📊 Reports Dashboard
- **Revenue KPIs** — Total revenue, this month vs last month with percentage change
- **Revenue Trend Chart** — Line chart of completed booking revenue over the last 6 months
- **Top Services** — Horizontal bar chart ranked by booking count
- **Booking Status Breakdown** — Donut chart (completed / accepted / pending / cancelled / rejected)
- **Top Therapists Table** — Ranked by completed sessions with revenue and average rating
- **Bookings by Zone** — Bar chart of top Dubai areas by booking volume
- Revenue computed from `ServiceVariant.price` — reliable across all payment methods including cash bookings and Stripe payments

### ⚡ Real-time Features
- **WebSocket Broadcasting** — Powered by Laravel Reverb
- **Live Booking Status** — Auto-refresh polling + WebSocket push for instant updates
- **Notifications** — In-app notification system with unread count badge

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Backend | Laravel 11 (PHP 8.2) |
| Frontend | React 18 + Inertia.js |
| Database | PostgreSQL |
| Real-time | Laravel Reverb (WebSocket) |
| Payments | Stripe Checkout + Webhooks |
| Auth | Laravel Breeze + Google OAuth + OTP |
| Styling | Tailwind CSS (Dark / Light Mode) |
| Charts | Recharts |
| Animations | Framer Motion |

---

## 🚀 Getting Started

### Prerequisites
- PHP 8.2+
- Composer
- Node.js 18+
- PostgreSQL
- A [Stripe](https://dashboard.stripe.com/register) account (free — test/sandbox mode is sufficient for local development)
- [Stripe CLI](https://stripe.com/docs/stripe-cli) (for forwarding webhook events to your local server during development)

### Installation

```bash
# Clone the repository
git clone https://github.com/TofuMcflurry/infinity-spa-hub.git
cd infinity-spa-hub

# Install PHP dependencies
composer install

# Install Node dependencies
npm install

# Copy environment file
cp .env.example .env

# Generate application key
php artisan key:generate

# Configure your .env with PostgreSQL credentials and mail settings
# DB_CONNECTION=pgsql
# DB_HOST=127.0.0.1
# DB_PORT=5432
# DB_DATABASE=your_database
# DB_USERNAME=your_username
# DB_PASSWORD=your_password

# Configure your .env with Stripe test keys (from dashboard.stripe.com → Developers → API keys)
# STRIPE_KEY=pk_test_...
# STRIPE_SECRET=sk_test_...
# STRIPE_WEBHOOK_SECRET=whsec_...   (obtained from `stripe listen`, see below)

# Run database migrations
php artisan migrate

# Link public storage (for service images)
php artisan storage:link

# Seed the database (optional)
php artisan db:seed

# Build frontend assets
npm run build

# Start the development server
php artisan serve

# In a separate terminal, start the WebSocket server
php artisan reverb:start

# In another terminal, watch for assets (development)
npm run dev

# In another terminal, forward Stripe webhook events to your local server
stripe login
stripe listen --forward-to localhost:8000/webhooks/stripe
# Copy the printed "whsec_..." signing secret into STRIPE_WEBHOOK_SECRET in .env
```

> **Testing payments:** Use Stripe's test card `4242 4242 4242 4242` with any future expiry date, any CVC, and any billing details to simulate a successful payment in sandbox mode.

---

## 📁 Project Structure

```
├── app/
│   ├── Http/Controllers/
│   │   ├── Admin/                  # Admin panel controllers
│   │   │   ├── AdminDashboardController.php
│   │   │   ├── AdminBookingController.php
│   │   │   ├── AdminServiceController.php
│   │   │   ├── AdminReportController.php
│   │   │   └── AdminTherapistController.php
│   │   ├── Auth/                   # Authentication (OTP, Google OAuth)
│   │   ├── BookingController.php
│   │   ├── DownpaymentController.php       # Legacy manual bank-transfer flow (retained as fallback) + loyalty voucher cancellation (restore/forfeit)
│   │   ├── StripePaymentController.php     # Stripe Checkout session creation + webhook handler
│   │   ├── CustomerDashboardController.php
│   │   └── TherapistBookingController.php
│   ├── Console/Commands/
│   │   └── MigrateServicesToVariants.php   # Zero-data-loss migration command
│   └── Models/
│       ├── Service.php             # Parent service (name, image, category)
│       ├── ServiceVariant.php      # Duration + price options per service
│       ├── Booking.php
│       ├── Therapist.php
│       └── User.php
├── resources/js/
│   ├── Layouts/
│   │   ├── AdminLayout.jsx         # Admin sidebar + header
│   │   ├── TherapistLayout.jsx     # Therapist sidebar + mobile nav + notifications
│   │   ├── CustomerLayout.jsx      # Customer sidebar + bottom nav + floating concierge
│   │   └── GuestLayout.jsx         # Auth pages
│   ├── Pages/
│   │   ├── Admin/
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Bookings.jsx
│   │   │   ├── Services.jsx        # Service management with variants
│   │   │   ├── Reports.jsx         # Analytics dashboard
│   │   │   └── Therapists.jsx
│   │   ├── Therapist/
│   │   ├── Customer/
│   │   ├── Bookings.jsx            # Multi-step booking wizard, incl. Stripe checkout (Step 5)
│   │   └── PaymentSuccess.jsx      # Post-Stripe-redirect confirmation page with status polling
│   └── Components/
│       └── SuccessScreen.jsx       # Shared booking-confirmed UI, used by both the wizard and PaymentSuccess
├── routes/
│   └── web.php
└── database/
    └── migrations/
```

---

## 🔐 User Roles

| Role | Access |
|---|---|
| **Customer** | Browse services, book appointments, pay via Stripe, manage profile & addresses |
| **Therapist** | View assigned bookings, manage schedule, track earnings, handle notifications |
| **Admin** | Full system access — bookings, therapists, services, payments, analytics & reports |

---

## 📐 Key Engineering Decisions

- **Webhook-Based Payment Confirmation** — Payment is confirmed server-to-server via a signed Stripe webhook rather than the client-side redirect, which can be missed if a browser closes mid-flow. See [ARCHITECTURE.md](./ARCHITECTURE.md) for the signature verification details.
- **Idempotent & Race-Safe Webhook Handling** — Duplicate webhook deliveries and races between payment confirmation and abandoned-checkout cancellation are both explicitly guarded against, so a late `completed` event can never resurrect a cancelled booking.
- **Separated Customer vs. Therapist Scheduling Constraints** — A therapist's schedule needs a travel/rest buffer between sessions; a customer's schedule only needs to avoid overlapping their own bookings. Conflating the two caused a real bug where a customer's slot was blocked by a *different* therapist's buffer — see [ARCHITECTURE.md](./ARCHITECTURE.md) for the fix.
- **Service Variant Pattern** — Modeled after product/variant architecture (similar to Shopify): a `Service` is the parent, `ServiceVariant` holds duration + price, and bookings reference both for grouping and exact pricing.

---

## 📸 Screenshots

> Coming soon — UI screenshots of customer dashboard, booking flow, Stripe checkout, admin reports, and service management.

---

## 📄 License

This project is open-sourced under the [MIT License](LICENSE).

---

<p align="center">Made with ❤️ using Laravel + React + Stripe</p>