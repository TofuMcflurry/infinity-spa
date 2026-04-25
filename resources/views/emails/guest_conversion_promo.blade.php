<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Thank You — Get 10% Off</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background: #f9f9f9; }
        .card { background: #fff; border-radius: 12px; padding: 32px; border: 1px solid #e5e7eb; }
        .brand { font-size: 14px; font-weight: 700; color: #b7882a; letter-spacing: 0.05em; }
        .divider { border: none; border-top: 1px solid #e5e7eb; margin: 24px 0; }
        h2 { margin: 0 0 8px; font-size: 22px; color: #111; }
        .promo-box { background: linear-gradient(135deg, #fef3c7, #fde68a); border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0; }
        .promo-discount { font-size: 42px; font-weight: 800; color: #92400e; line-height: 1; }
        .promo-label { font-size: 14px; color: #78350f; margin-top: 4px; }
        .cta-btn { display: inline-block; background: #b7882a; color: #fff; text-decoration: none; border-radius: 8px; padding: 14px 32px; font-weight: 700; font-size: 15px; margin-top: 8px; }
        .footer { margin-top: 24px; font-size: 12px; color: #9ca3af; text-align: center; }
    </style>
</head>
<body>
    <div class="card">
        <div class="brand">✦ INFINITY HOME SPA</div>

        <hr class="divider">

        <h2>Thank you, {{ $booking->guest_name }}! 🌿</h2>
        <p style="color:#6b7280; margin-top:0;">
            We hope you enjoyed your <strong>{{ $booking->service->name }}</strong> session.
            It was a pleasure hosting you.
        </p>

        <div class="promo-box">
            <div class="promo-discount">10% OFF</div>
            <div class="promo-label">your next booking — exclusive for new members</div>
        </div>

        <p style="font-size:14px;">
            Create a free account to unlock your discount, track your bookings, and enjoy a seamless experience every time.
        </p>

        <div style="text-align:center; margin: 24px 0;">
            <a href="{{ url('/register') }}" class="cta-btn">Register &amp; Claim 10% Off →</a>
        </div>

        <hr class="divider">

        <p style="font-size:12px; color:#9ca3af;">
            Simply register using this email address (<strong>{{ $booking->guest_email }}</strong>) and the discount will be applied automatically to your next booking.
        </p>
    </div>

    <div class="footer">
        <p>&copy; {{ date('Y') }} Infinity Home Spa. All rights reserved.</p>
    </div>
</body>
</html>
