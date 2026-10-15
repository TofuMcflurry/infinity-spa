# GPS v1 Architecture Decision Record

## 1. Title

GPS v1 — Live Therapist Location Tracking for Infinity Home Spa

## 2. Status

**APPROVED FOR IMPLEMENTATION**

## 3. Context

Infinity Home Spa is a two-sided marketplace (Laravel 12 + React 18/Inertia.js + PostgreSQL) connecting customers with therapists who travel to the customer's location to perform a booked service. The platform currently operates with approximately 8 therapists.

Bookings follow the lifecycle:

```
pending → accepted → en_route → arrived → completed
```

(with `rejected` and `cancelled` as terminal/alternate states)

Customers currently have no visibility into a therapist's travel progress once a booking is accepted. This creates uncertainty for customers awaiting a home visit and increases support inquiries ("where is my therapist?").

The team has finalized a production-grade GPS v1 architecture. This ADR exists to lock in those decisions so implementation work (a separate effort) has an unambiguous specification to build against.

## 4. Problem

How should Infinity Home Spa track and expose a therapist's live location to the relevant customer and admin, in a way that is:

- Scoped strictly to the active travel window (`en_route`)
- Privacy-respecting (therapist-only tracking, booking-scoped access)
- Operationally simple for a fleet of ~8 therapists
- Production-grade (secure, authorized, fails safely)
- Portable to AWS without premature distributed-systems complexity

## 5. Decision

Implement GPS v1 as a **booking-scoped, therapist-only, ephemeral live-location** feature:

- Tracking is active **only** while `booking.status = en_route`.
- Only the **therapist's** location is tracked. Customer location is never tracked.
- The latest location is stored in **Redis/Valkey** with a short TTL (target: 60 seconds) — not in PostgreSQL.
- Location updates are delivered to authorized clients in realtime via **Laravel + Redis/Valkey + Laravel Reverb**.
- Access is authorized per-request from `authenticated user + booking ownership/assignment + current booking state` — never from a client-supplied identifier alone.
- PostgreSQL remains the source of truth for booking/business state only; it never stores high-frequency GPS breadcrumbs.
- No new distributed infrastructure (API Gateway, Lambda, AppSync, third-party realtime SaaS, separate microservice) is introduced for v1.

## 6. Architecture Overview

```
                    ┌─────────────────────┐
                    │   PostgreSQL         │
                    │ (source of truth:    │
                    │  bookings, status,   │
                    │  assignment)         │
                    └──────────▲───────────┘
                               │ reads booking state
                               │ for authorization
                               │
 Therapist device              │
 (browser geolocation)         │
      │                        │
      │ POST location update   │
      ▼                        │
┌─────────────────────┐        │
│ Laravel authenticated│───────┘
│ endpoint             │
│ (validates auth +    │
│  assignment +        │
│  en_route + payload) │
└──────────┬───────────┘
           │ write latest location (TTL ~60s)
           ▼
┌─────────────────────┐
│ Redis / Valkey       │
│ key: booking:{id}:   │
│      location        │
└──────────┬───────────┘
           │ on successful write
           ▼
┌─────────────────────┐
│ Broadcast event       │
│ (Laravel event)       │
└──────────┬───────────┘
           ▼
┌─────────────────────┐
│ Laravel Reverb        │
│ (private channel      │
│  per booking only —   │
│  no presence channel) │
└──────────┬───────────┘
           ▼
┌─────────────────────────────┐
│ Authorized clients            │
│ - assigned customer (view)    │
│ - admin (operational view)    │
└───────────────────────────────┘
```

PostgreSQL is consulted for authorization decisions (booking ownership, assignment, current status) but is never the storage layer for the location data itself.

## 7. GPS Lifecycle

Tracking is strictly gated by booking status:

```
pending            → NOT tracked
accepted           → NOT tracked (before en_route)
accepted → en_route → tracking STARTS
en_route           → tracking ACTIVE
en_route → arrived → tracking STOPS, live-location access REVOKED
arrived            → NOT tracked
completed          → NOT tracked
cancelled          → NOT tracked, any active session invalidated
rejected           → NOT tracked
```

Rules:

- Tracking starts **only** on the explicit `accepted → en_route` transition.
- Tracking stops immediately on reaching `arrived`, on cancellation, or when the tracking session otherwise becomes invalid (e.g., booking reassigned, status changed out of `en_route` by any path).
- There is no tracking window outside of `en_route`.

## 8. Access & Privacy

**Customer:**
- May view location only for their **own** booking.
- May view location only while that booking is `en_route`.
- Has zero access to any other booking's therapist location.

**Therapist:**
- May submit only their **own** location.
- Has zero access to another therapist's tracking data.

**Admin:**
- May have operational visibility into active `en_route` bookings, **scoped to the individual booking context** — i.e., admin opens a specific booking and views that booking's assigned therapist's current live location.
- Visibility is still subject to role authorization and the booking's current tracking state — not an unconditional global view.
- **GPS v1 does not build a fleet-wide live tracking dashboard** (a single map showing all active therapists at once). Admin visibility is locked to booking-scoped access only, identical in shape to customer access, just with admin's broader authorization to open any booking.
- A fleet/dispatch-wide live map is a candidate for a future GPS v2+ if a concrete operational requirement justifies it (see §18); it is not part of this decision.

**Other customers / other therapists:** zero access.

**Hard rule:** There is no generic "look up a therapist's location by ID" endpoint. Every access path is derived from:

```
authenticated user + booking ownership/assignment + current booking state
```

A client-supplied `booking_id` is never trusted on its own — the server re-derives authorization from the authenticated user's relationship to that booking and the booking's live status on every request/channel-auth check.

## 9. Data Model

GPS v1 stores **only the latest active location** per booking. No breadcrumb history.

Minimum payload:

| Field | Description |
|---|---|
| `booking_id` | The booking this location update belongs to |
| `therapist_id` | The therapist submitting the update (must match booking assignment) |
| `latitude` | Decimal latitude |
| `longitude` | Decimal longitude |
| `accuracy_meters` | Reported GPS accuracy |
| `recorded_at` | Timestamp the location was captured on-device |

Optional field:

| Field | Description |
|---|---|
| `heading` | Direction of travel, if available |

No permanent location-history table is created for GPS v1.

## 10. Storage Strategy

- Live location is **ephemeral state**, stored in **Redis/Valkey**.
- Conceptual key shape: `booking:{booking_id}:location`
- TTL: **60 seconds, sliding.** Every valid location update refreshes the full 60-second TTL on write — the key's expiry is not fixed to when tracking started, it is pushed forward on each accepted update.
- If no valid update refreshes the key before TTL expiry, the key disappears and the location is treated as stale/unavailable — this is the natural mechanism for "tracking has gone quiet," not a special-cased flag. A stale/expired entry must never continue to be presented to clients as live.
- **PostgreSQL remains the source of truth for bookings, booking status, therapist assignment, and business state.** Redis/Valkey is never treated as authoritative for booking state — only for the latest ephemeral GPS value.
- PostgreSQL may, if a future requirement calls for it, store low-frequency **session summary** values (departure timestamp, arrival timestamp, travel duration, total distance). These are business/session summaries, not GPS breadcrumbs, and are explicitly out of scope unless a concrete requirement emerges.
- GPS pings are never written to PostgreSQL, individually or in bulk.

## 11. Realtime Strategy

Stack: **Laravel + Redis/Valkey + Laravel Reverb.**

Flow:

1. Therapist device sends a location update to an authenticated Laravel endpoint.
2. Laravel validates the request (see §12) and writes the latest location into Redis/Valkey with TTL refresh.
3. On successful write, Laravel broadcasts a location-update event.
4. Laravel Reverb delivers the event over a **private, booking-scoped channel** (e.g. `private-booking.{booking_id}.location`) to authorized, subscribed clients (the assigned customer, and admin where applicable).
5. Channel authorization (`channel.authorize`) re-checks `authenticated user + booking ownership/assignment + en_route state` before allowing a client to subscribe — not just at initial page load, but as the authority for whether the socket connection is allowed at all.

**Channel type is locked to Laravel's private channels.** GPS v1 does **not** use presence channels — presence channels broadcast member-list/roster information to all subscribers, which is unnecessary (and a mild privacy leak) for a feature where the only thing that needs delivering is one booking's location updates to its specifically-authorized viewers. A private channel with per-subscription server-side authorization is sufficient and simpler to reason about.

**Explicitly rejected for v1:** API Gateway + Lambda pipelines, a separate GPS microservice, API Gateway WebSockets, AWS AppSync, third-party realtime SaaS. Rationale: at a maximum of ~8 concurrent `en_route` therapists, this is not a scale problem, and introducing distributed infrastructure here would add operational complexity with no corresponding benefit.

**Update cadence:** Adaptive, targeting roughly **10–30 seconds** while actively travelling. Not a fixed 1-second high-frequency stream. The exact interval is tunable and should be validated against battery impact, location accuracy, network usage, and customer usefulness during implementation — this ADR fixes the target range, not the precise constant.

## 12. Failure Handling

**Validation on every location update**, enforced server-side before any write:

- Request is authenticated.
- The authenticated therapist owns/is assigned to the referenced booking.
- The booking's current status is `en_route` (any other status rejects the update).
- Latitude is a valid coordinate value.
- Longitude is a valid coordinate value.
- **Accuracy is within an acceptable bound: `accuracy_meters` must be ≤ 100. An update with `accuracy_meters > 100` is rejected outright and never written.**
- Timestamp is reasonable (not absurdly in the past or future).
- **Speed/jump sanity check:** the implied travel speed between the previous valid location and the new location must not exceed **160 km/h**. If `distance(previous_valid_location, new_location) / elapsed_time` exceeds this threshold, the update is rejected as an impossible jump.
  - This threshold is implemented as a **named configurable constant** (not a hardcoded magic number) so it can be tuned later without a design change.
  - **If there is no previous valid location for the booking** (e.g. first update after `en_route` starts, or the prior entry has expired/was never valid), the speed comparison is skipped entirely — there is nothing to compare against, so the update is evaluated only against the other validation rules above.

**Ordering/overwrite rule:** A stale or invalid update must never overwrite a valid newer location already held for that booking. A newer update may only replace an older one once it has independently passed every validation rule above (authorization, status, coordinates, accuracy, timestamp, speed sanity) — passing validation is the sole condition for replacement, regardless of how "live" the previous entry looked.

**Stale location handling:** The Redis/Valkey entry uses a 60-second sliding TTL, refreshed on every valid update (see §10). If no valid update arrives before that TTL expires, the key disappears and the customer-facing UI must not present a falsely "live" marker. The UI shows an explicit paused/stale state (e.g., "Location update paused") with the last-known-update time where appropriate, rather than silently freezing a stale pin as if it were current.

**No permanent retention of stale access:** Expiry of the TTL is the mechanism by which live-location access naturally lapses — there is no separate cleanup job required to "revoke" access retroactively, because the ephemeral key is simply gone.

## 13. Security

- All GPS traffic travels over HTTPS/TLS.
- All location-update and location-read requests are authenticated.
- Authorization is strictly role-based and **booking-scoped** — derived from `authenticated user + booking ownership/assignment + current booking state`, never from a client-supplied identifier alone.
- No endpoint permits arbitrary therapist lookup.
- Customer GPS is never collected or tracked.
- No persistent high-frequency location history is stored.
- Live location expires automatically via TTL.
- Tracking stops immediately on `arrived` or `cancelled` (and any other exit from `en_route`).
- Realtime channel authorization independently re-verifies booking ownership/state — a previously-valid subscription does not remain trusted once the underlying booking state changes.
- Realtime delivery uses **private Reverb channels only** — no presence channels — so no subscriber roster/member-list information is ever broadcast.

## 14. AWS Migration Mapping

GPS v1 is designed to be portable to AWS without requiring GPS-specific redesign:

| Component | Local / v1 | AWS Target |
|---|---|---|
| Application | Laravel | ECS / Fargate |
| Database | PostgreSQL | Amazon RDS / Aurora PostgreSQL |
| Ephemeral store | Redis/Valkey | Amazon ElastiCache / Valkey |
| Realtime | Laravel Reverb | Laravel Reverb infrastructure (on ECS/Fargate) |
| Monitoring | — | Amazon CloudWatch |

No AWS-specific complexity (Lambda, API Gateway, AppSync, etc.) is introduced into the local implementation purely to "prepare" for this migration. The migration path is achieved by the underlying components already being AWS-portable primitives, not by pre-building cloud-native plumbing before it's needed.

## 15. Well-Architected Review

**Operational Excellence**
GPS v1 reuses the existing Laravel deployment and introduces only two new operational dependencies (Redis/Valkey, Reverb), both of which are standard, well-understood pieces already compatible with the stack. Tracking lifecycle is fully derived from existing booking-status transitions, so there is no separate GPS "mode" to operate — it rides on booking state the team already manages.

**Security**
Authorization is booking-scoped and re-derived on every request/channel check from authenticated identity, assignment, and live status, eliminating arbitrary-lookup and stale-access risks. No customer GPS is ever collected, minimizing data sensitivity surface.

**Reliability**
Ephemeral storage with TTL expiry means a stalled or crashed therapist client fails safe — the customer sees an explicit "paused" state rather than a misleading stale pin. PostgreSQL remains authoritative for booking state, so a GPS subsystem outage cannot corrupt or block the booking lifecycle itself.

**Performance Efficiency**
Redis/Valkey is purpose-built for exactly this kind of high-write, latest-value, short-TTL workload, avoiding PostgreSQL write amplification from GPS breadcrumbs. Adaptive 10–30s update intervals are proportionate to the actual use case (travel-progress awareness, not turn-by-turn navigation).

**Cost Optimization**
At ~8 therapists maximum concurrency, no distributed GPS microservice, Lambda pipeline, or managed realtime SaaS is justified — the chosen stack reuses infrastructure the application already needs, avoiding new cost centers. Rejecting permanent breadcrumb history avoids unbounded storage growth.

**Sustainability**
Avoiding 1-second high-frequency polling and avoiding permanent breadcrumb retention both reduce unnecessary compute, storage, and battery/network consumption relative to a more aggressive tracking design, while still meeting the actual customer need (travel-progress visibility).

## 16. Alternatives Considered

| Alternative | Rejected Because |
|---|---|
| API Gateway + Lambda pipeline | Introduces distributed-systems complexity disproportionate to ~8 concurrent therapists; harder to reason about and operate than the existing Laravel stack. |
| Separate GPS microservice | Adds a new deployable, new auth boundary, and new failure domain for a feature tightly coupled to booking state already owned by the monolith. |
| API Gateway WebSockets | Duplicates realtime capability Laravel Reverb already provides within the existing stack. |
| AWS AppSync | GraphQL subscription infrastructure is unnecessary overhead for a single booking-scoped location channel. |
| Third-party realtime SaaS | Introduces an external dependency and recurring cost for capability Reverb already covers; also raises data-residency questions for location data. |
| Permanent PostgreSQL breadcrumb table | High write volume against the primary OLTP database for data with no required long-term retention value in v1; conflicts with "PostgreSQL is not a GPS ping store" principle. |
| Customer live GPS tracking | Customer already supplies a booking destination/address; live customer GPS adds privacy exposure with no required operational value for v1. |
| 1-second high-frequency updates | Excessive battery/network cost and backend load for no meaningful increase in customer-perceived usefulness over a 10–30s cadence. |

## 17. Out of Scope

GPS v1 explicitly does **not** include:

- Customer live GPS tracking
- Permanent route history
- Native mobile application
- Guaranteed background GPS while the phone is locked
- Turn-by-turn navigation
- Fleet dispatch optimization
- AI route optimization
- Geofenced automatic arrival detection
- Arbitrary public therapist tracking

## 18. Future GPS v2

A future GPS v2 may introduce:

- A native mobile application or a Capacitor/native shell
- Stronger background location capabilities (tracking that survives a locked screen or backgrounded browser)

GPS v2 is out of scope for the current implementation and is not designed against in this ADR.

## 19. Implementation Principles

- **Tracking lifecycle is driven entirely by booking status.** `en_route` is the only state in which tracking is active; every other state means no tracking.
- **Therapist-only tracking.** Customer location is never collected.
- **Booking-scoped authorization everywhere.** Every read and write re-derives authorization from `authenticated user + booking ownership/assignment + current booking state` — never trust a client-supplied booking ID alone.
- **Ephemeral by design.** Redis/Valkey with a short TTL (~60s) holds only the latest location; PostgreSQL never stores GPS breadcrumbs.
- **Fail safe, not falsely-live.** When updates stop, the UI must show an explicit stale/paused state rather than a frozen pin presented as current.
- **No premature distributed infrastructure.** The realtime and storage choices (Laravel + Redis/Valkey + Reverb) are sized for ~8 concurrent therapists, not hypothetical massive scale.
- **GPS is independent of rescheduling.** GPS reflects current confirmed booking/session state only; it never mutates booking schedule, and any change that takes a booking out of `en_route` (reschedule, cancellation, completion) invalidates the active GPS session.
- **Browser/device geolocation limitations must be communicated in the UI**, not papered over — the system must not claim guaranteed tracking continuity through a locked screen, backgrounded browser, or a switch to another navigation app.
- **AWS-portable, not AWS-complicated.** Every chosen component maps cleanly to an AWS managed equivalent (§14), but no AWS-specific plumbing is added to the local implementation to pre-optimize for that migration.

## 20. Locked Implementation Defaults

The following constants and scope boundaries are finalized and must be carried into implementation as-is (configurable where noted, not re-litigated):

| Decision | Locked Value |
|---|---|
| **Accuracy threshold** | Reject any update with `accuracy_meters > 100`. Only updates passing this (and every other validation rule) may ever replace a previously stored location. |
| **Speed / impossible-jump threshold** | Reject an update if implied speed from the previous valid location exceeds **160 km/h**. Implemented as a named configurable constant. Skipped entirely when there is no previous valid location for the booking. |
| **Admin visibility scope** | Booking-scoped only — admin views a therapist's live location through the specific `en_route` booking's context. No fleet-wide/all-therapists live map in GPS v1. |
| **Reverb channel type** | Private channel per booking (e.g. `private-booking.{booking_id}.location`). Presence channels are explicitly not used. |
| **Redis/Valkey TTL** | 60 seconds, **sliding** — every valid update refreshes the full TTL. Expiry with no refresh ⇒ location is stale/unavailable and must not be shown as live. |

These five items were the open ambiguities identified after initial ADR approval; they are now closed and carry the same APPROVED status as the rest of this document.

---

Status: APPROVED FOR IMPLEMENTATION
