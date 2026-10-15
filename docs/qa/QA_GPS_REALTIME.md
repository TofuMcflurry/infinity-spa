# GPS & Real-Time Booking QA

## Test Environment
- Device: iPhone
- Browser: Safari
- Network: Mobile Data
- Therapist Location: Manila
- Customer: Desktop Browser
- Laravel: Local
- Reverb: Local
- Cloudflare Quick Tunnel: QA only

## Test Case 1 — Therapist Location Permission
Expected: Location permission is requested.
Result: PASS

## Test Case 2 — Live Location Activation
Expected: Therapist location becomes Live when booking is En Route.
Result: PASS

## Test Case 3 — Real-Time Location Transmission
Expected: Customer receives therapist coordinates remotely.
Result: PASS

## Test Case 4 — Customer Live Map
Expected: Therapist marker appears on customer map.
Result: PASS

## Test Case 5 — Booking State Transition
Pending → Accepted → On The Way
Result: PASS

## Test Case 6 — Therapist Arrived
Expected: Customer sees "Therapist has arrived."
Result: PASS

## Test Case 7 — Session Completion
Expected: Booking transitions to Completed.
Result: PASS

## Final Result
PASS — End-to-end GPS and real-time booking flow verified using a physical iPhone over mobile data.
