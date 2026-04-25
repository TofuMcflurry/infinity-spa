<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Booking Confirmed</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background: #f9f9f9; }
        .card { background: #fff; border-radius: 12px; padding: 32px; border: 1px solid #e5e7eb; }
        .badge { display: inline-block; background: #dcfce7; color: #166534; border-radius: 999px; padding: 4px 16px; font-size: 13px; font-weight: 600; margin-bottom: 20px; }
        h2 { margin: 0 0 8px; font-size: 22px; color: #111; }
        .detail-row { display: flex; gap: 8px; margin: 8px 0; font-size: 14px; }
        .detail-label { color: #6b7280; min-width: 90px; }
        .detail-value { color: #111; font-weight: 500; }
        .divider { border: none; border-top: 1px solid #e5e7eb; margin: 24px 0; }
        .footer { margin-top: 24px; font-size: 12px; color: #9ca3af; text-align: center; }
        .brand { font-size: 14px; font-weight: 700; color: #b7882a; letter-spacing: 0.05em; }
    </style>
</head>
<body>
    <div class="card">
        <div class="brand">✦ INFINITY HOME SPA</div>

        <hr class="divider">

        <div class="badge">✅ Booking Confirmed</div>

        <h2>Your booking is confirmed!</h2>
        <p style="color:#6b7280; margin-top:0;">Hello <strong>{{ $booking->guest_name }}</strong>, we're excited to see you soon.</p>

        <hr class="divider">

        <div class="detail-row">
            <span class="detail-label">Service</span>
            <span class="detail-value">{{ $booking->service->name }}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Date &amp; Time</span>
            <span class="detail-value">
                {{ \Carbon\Carbon::parse($booking->scheduled_start)->format('l, d F Y') }}
                at {{ \Carbon\Carbon::parse($booking->scheduled_start)->format('g:i A') }}
            </span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Address</span>
            <span class="detail-value">{{ $booking->location }}</span>
        </div>

        <hr class="divider">

        <p style="font-size:14px;">Our concierge will reach out via WhatsApp to confirm final details. Please ensure you are available at the scheduled time.</p>

        <p style="font-size:14px;">Questions? Reply to this email or contact us on WhatsApp.</p>
    </div>

    <div class="footer">
        <p>&copy; {{ date('Y') }} Infinity Home Spa. All rights reserved.</p>
    </div>
</body>
</html>
