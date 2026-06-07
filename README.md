<p align="center">
  <img src="https://raw.githubusercontent.com/laravel/art/master/logo-lockup/5%20SVG/2%20CMYK/1%20Full%20Color/laravel-logolockup-cmyk-red.svg" width="300" alt="Laravel Logo">
</p>
<h1 align="center">✨ Luxury Spa Booking System</h1>
<p align="center">
  A full-stack web application for managing luxury spa and massage therapy bookings — built with Laravel, React, and Inertia.js.
</p>
<p align="center">
  <img src="https://img.shields.io/badge/Laravel-11-red?logo=laravel" alt="Laravel">
  <img src="https://img.shields.io/badge/React-18-blue?logo=react" alt="React">
  <img src="https://img.shields.io/badge/Inertia.js-SSR-purple" alt="Inertia">
  <img src="https://img.shields.io/badge/PostgreSQL-Database-336791?logo=postgresql" alt="PostgreSQL">
  <img src="https://img.shields.io/badge/WebSocket-Reverb-orange" alt="Laravel Reverb">
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License">
</p>

📖 About the Project
This is a luxury spa booking platform that allows customers to browse services, book therapists, and manage appointments — while giving therapists and admins full control over scheduling, payments, and operations.
Built as a portfolio project to demonstrate full-stack development with real-time features, role-based access control, and a polished UI with dark/light mode support.

✨ Features
👤 Customer Portal

Authentication — Email OTP verification + Google OAuth login
Service Browsing — Browse grouped spa services with real-time availability
Multi-step Booking Flow — Step-by-step booking with calendar, time slot selection, and payment
Address Book — Save multiple addresses with Dubai service zone selection
20% Downpayment System — Bank transfer payment with proof upload
My Bookings Dashboard — Real-time booking status tracking with WebSocket updates
Review & Rating System — CSAT ratings for completed bookings
Profile Management — Avatar upload and profile editing

💆 Therapist Dashboard

Booking Management — View and manage assigned bookings with status updates (En Route → Arrived → Completed)
Schedule Management — Calendar view, unavailable slot marking, and rest day requests
Earnings Tracker — Weekly earnings stats
Downpayment Verification — Fullscreen image viewer for payment proof review
Cancellation Handling — Cancel bookings with reason input

🛠️ Admin Panel

Dashboard — Stats overview with charts and recent booking activity
Bookings Manager — FIFO queue system with dedicated Guest Bookings page
Therapist Management — Assign therapists to bookings
Payment Verification — Review and verify downpayment submissions
Auto-cancel — Automatically cancels past-due unconfirmed bookings

⚡ Real-time Features

WebSocket Broadcasting — Powered by Laravel Reverb
Live Booking Status — Auto-refresh polling + WebSocket push for instant updates
Notifications — In-app notification system


🛠️ Tech Stack
LayerTechnologyBackendLaravel 11 (PHP)FrontendReact 18 + Inertia.jsDatabasePostgreSQLReal-timeLaravel Reverb (WebSocket)AuthLaravel Breeze + Google OAuth + OTPStylingTailwind CSS (Dark/Light Mode)

🚀 Getting Started
Prerequisites

PHP 8.2+
Composer
Node.js 18+
PostgreSQL

Installation
bash# Clone the repository
git clone https://github.com/TofuMcflurry/infinity-spa-hub.git
cd your-repo-name

# Install PHP dependencies
composer install

# Install Node dependencies
npm install

# Copy environment file
cp .env.example .env

# Generate application key
php artisan key:generate

# Configure your .env with your PostgreSQL credentials and mail settings
# DB_CONNECTION=pgsql
# DB_HOST=127.0.0.1
# DB_PORT=5432
# DB_DATABASE=your_database
# DB_USERNAME=your_username
# DB_PASSWORD=your_password

# Run database migrations
php artisan migrate

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

📁 Project Structure
├── app/
│   ├── Http/Controllers/
│   │   ├── Admin/          # Admin panel controllers
│   │   ├── Auth/           # Authentication (OTP, Google OAuth)
│   │   ├── BookingController.php
│   │   ├── CustomerDashboardController.php
│   │   └── TherapistController.php
│   ├── Models/             # Eloquent models
│   └── Events/             # Broadcasting events (Reverb)
├── resources/
│   └── js/
│       ├── Pages/
│       │   ├── Admin/      # Admin dashboard pages
│       │   ├── Customer/   # Customer-facing pages
│       │   └── Therapist/  # Therapist dashboard pages
│       └── Components/     # Reusable React components
├── routes/
│   ├── web.php
│   └── api.php
└── database/
    └── migrations/         # Database schema

🔐 User Roles
RoleAccessCustomerBrowse services, book appointments, manage profile & addressesTherapistView assigned bookings, manage schedule, track earningsAdminFull system access — bookings, therapists, payments, analytics

📸 Screenshots

Coming soon — UI screenshots of customer dashboard, booking flow, and admin panel.


🤝 Contributing
This is a personal portfolio project and is not open for contributions at this time.

📄 License
This project is open-sourced under the MIT License.

<p align="center">Made with ❤️ using Laravel + React</p>
