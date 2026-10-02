# Infinity Home Spa — Reschedule Feature: Developer Handoff / Component Spec

Source of truth: the approved design canvas, page "Admin · Rescheduling & Bookings (dark)" (boards Admin-Bookings, Admin-Reschedule, Admin-Reschedule-Conflict) and page "Customer reschedule request + admin review" (boards 0–9, 1m, 3b).
Theme: the existing **dark navy + gold** Infinity Home Spa UI. Reproduce it exactly. Don't restyle or simplify it, and don't add components.

> Where the app already has an equivalent component (sidebar, top bar, buttons, badges), **reuse the app's component** and match it to the values below. Values marked **[not on boards]** were not designed. Use the app's existing behaviour for those and don't invent new styling.

---

## 1. Tokens

### Colour
| Token | Hex | Use |
|---|---|---|
| `bg` | `#0B1222` | Page background, modal/drawer footers, quote and textarea fill, mobile footer |
| `surface` | `#111A2E` | Cards, tables, modals, drawers, inputs, segmented-control track |
| `raised` | `#16213A` | Summary blocks, comparison cards, time slots, date chips, secondary buttons, icon buttons, selected table row, info notes, active nav item |
| `hover` | `#1A2642` | Defined but **[not on boards]**. Use only if the app has no hover colour |
| `line` | `#24304B` | All 1px dividers and card/table borders |
| `line-strong` | `#66779B` | Control borders: inputs, selects, textareas, secondary buttons, open slots and radio options (≥3:1) |
| `ink` | `#F3EFE6` | Primary text |
| `ink-2` | `#A9B3C7` | Secondary text, ghost button text, icon-button icons |
| `ink-3` | `#8390A8` | Labels, eyebrows, captions, placeholders, mono meta |
| `ink-disabled` | `#4E5A73` | Disabled text, unavailable slots and options |
| `gold` | `#E8B65C` | Primary button, selected chip/slot/option, active tab underline, count pills, requested/final labels, links |
| `gold-hover` | `#F0C477` | Link hover |
| `on-gold` | `#1A1206` | Text and icons on gold fills |
| `gold-bg` | `#2A2110` | Gold-tint fills: selected slot/option, active segment, admin summary banner |
| `gold-line` | `#6B5428` | Border of requested/final comparison cards, gold banner, active segment |
| `success` / `success-bg` / `success-border` | `#4CC79A` / `#0F2A24` / `#1F5444` | |
| `warning` / `warning-bg` / `warning-border` | `#F2A93B` / `#2C2210` / `#5C4318` | |
| `danger` / `danger-bg` / `danger-border` | `#F07A72` / `#331A1F` / `#5E2C31` | Outline danger button border: `#7A3A3F` |
| `info` / `info-bg` / `info-border` | `#6EA8F7` / `#132544` / `#24447A` | |
| `scrim` | `rgba(4,8,18,0.72)` | Behind modals and drawers |

### Typography
- **Serif (display):** Playfair Display 500/600, for titles only.
- **Sans (UI):** Plus Jakarta Sans 400–700. If the app's existing sans differs, keep the app's face and the sizes below.
- **Mono:** JetBrains Mono 400–600, for every date, time, booking ref, waiting timer and the uppercase meta lines.

| Style | Spec |
|---|---|
| Page title (H1) | serif 28/34 600 |
| Modal / drawer / detail-card title | serif 22/28 600 |
| Submitted headline | serif 26/32 600 |
| Section title (H2) | serif 20/26 600 |
| Top-bar greeting | serif 18/22 600 |
| Mobile sheet title | serif 19 600 |
| Date-block day number | serif 24/28 600 |
| Body | sans 14/20 400 |
| Secondary / meta | sans 13 `ink-2` |
| Caption / helper | sans 12 `ink-3` |
| Label (field) | sans 13 600 `ink` |
| Eyebrow | sans 11 700, letter-spacing .08em, UPPERCASE, `ink-3` (or a tone colour) |
| KV label / Table header | sans 11 600, .08em, UPPERCASE, `ink-3` |
| Nav group label | sans 11 600, .10em, UPPERCASE, `ink-3` |
| Mono ref (IHS-2052) | mono 11 600, .08em, `ink-3` |
| Mono date/time (cells) | mono 12 600 `ink` (or `ink-2` for "current") |
| Mono date (comparison card) | mono 15 700 `ink`; time mono 13 600 `ink-2` |
| Mono meta (e.g. "SORTED BY: OLDEST REQUEST", "UPDATED 1 MIN AGO") | mono 11 500, .08em, UPPERCASE, `ink-3` |

### Spacing, radius and elevation
- **Spacing:** 4px base. Values used: 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32.
- **Radius:**

  | Value | Used for |
  |---|---|
  | 4px | Tags and mini tags |
  | 7px | Segment items |
  | 8px | Buttons, inputs, slots, date chips, options, notes, quote, icon buttons, nav items |
  | 10px | Summary blocks, comparison cards, banners, segmented-control track, sidebar user card |
  | 12px | Table containers, customer booking list cards |
  | 14px | Modals and the customer booking detail card |
  | 50% | Avatars, radio dots, stepper numbers |

- **Shadows (only on overlays):**
  - Modal: `0 24px 64px rgba(0,0,0,.55)`.
  - Drawer: `-24px 0 64px rgba(0,0,0,.5)`.
  - Everything else is flat, with a 1px `line` border.
- **Inset "selected" ring:** `box-shadow: inset 0 0 0 1px <tone>` plus a 1px border of the same tone, giving a 2px visual edge.

### Icons
- **Style:** stroke icons, 1.5px stroke (checkmarks 2px), round caps and joins, `currentColor`.
- **Sizes:** 12 (waiting clock), 14 (link chevrons, mini meta), 16 (default), 18 (comparison arrow, mobile back).
- **Glyphs used:** clock, chevron-right, chevron-down, chevron-left (back), arrow-right, x (close), info (circle-i), alert (circle-!), check, bell, more (⋯), search, calendar, home, sparkle, users, user, cog, moon, logout, globe, heart.
- **Where icons appear:** navigation, icon buttons, notes, banners and alerts, the waiting timer, link chevrons, the comparison arrow and the select chevron. Nowhere else, and never decorative.

---

## 2. Reusable components (used across several boards)

### 2.1 Button `Button`
- **Base:**
  - inline-flex, centred, gap 8, radius 8, 1px border, sans 600, nowrap.
  - Optional leading 16px icon.
- **Sizes:**

  | Size | Height | Padding-x | Font size | Used for |
  |---|---|---|---|---|
  | `sm` | 32 | 12 | 13 | Table rows, booking-card footers |
  | `md` | 40 | 16 | 14 | Modal and drawer footers |
  | `lg` | 44 | 20 | 14 | Mobile sticky footer (full width) |

- **Variants:**

  | Variant | Background | Text | Border | Used for |
  |---|---|---|---|---|
  | `primary` | `gold` | `on-gold` | `gold` | Review request, Submit Reschedule Request, Done, Approve & reschedule, Confirm approval, Confirm reschedule |
  | `secondary` | `raised` | `ink` | `line-strong` | Request Reschedule, Reschedule, Review, View booking, Request another time, Next/Previous |
  | `ghost` | transparent | `ink-2` | none | Cancel, Back, Edit request, View details |
  | `danger` (outline) | transparent | `danger` | `#7A3A3F` | Reject request (drawer footer) |
  | `danger-solid` (confirm only) | `danger` | `#2A0C0A` | `danger` | Reject request (rejection modal); weight 700 |
  | `disabled` (any variant) | `raised` | `ink-disabled` | `line` | `disabled` + `aria-disabled="true"`; e.g. Confirm reschedule during a conflict, Request Reschedule while a request is pending |

- **Hover / active / focus:** **[not on boards]**. Use the app's existing button states.

### 2.2 Icon button `IconButton`
- **Base:** 36×36 (top bar), radius 8, 1px `line`, bg `raised`, icon 16 `ink-2`.
- **Notification dot:** 7px `danger` circle, positioned top 7 / right 8.
- **Variants:**
  - **Close:** 32×32, same style.
  - **More (⋯):** 32×32, transparent bg, 1px `line`, `aria-label="More actions"`.
  - **Mobile back:** 44×44.
- **Rule:** every icon-only button needs an `aria-label`.

### 2.3 Link `TextLink`
- Sans 13 600 `gold`, no underline, followed by a 14px chevron-right with gap 4–6. Hover `gold-hover`.
- Example: "Choose another date or therapist ›".

### 2.4 Status tag `StatusTag` (booking status and request status)
- **Base:**
  - h20, padding 0 7, radius 4, 1px border.
  - Sans 11 700, .06em, UPPERCASE, nowrap.
  - Each tone uses `<tone>` text on `<tone>-bg`, with a `<tone>-border` border.
- **Booking status → label → tone (locked):**

  | Value | Label | Tone |
  |---|---|---|
  | `pending` | Pending | warning |
  | `pending_payment` | Awaiting Payment | warning |
  | `accepted` | Accepted | success |
  | `en_route` | Therapist On The Way | info |
  | `arrived` | Therapist Arrived | info |
  | `completed` | Completed | success |
  | `rejected` | Rejected | danger |
  | `cancelled` | Cancelled | danger |

- **Pending supporting text:** "Awaiting therapist acceptance", sans 12 `ink-3`, margin-top 4. Always a separate line; it never replaces the tag.
- **Reschedule-request status:**
  - Pending = warning, Approved = success, Rejected = danger.
  - Always prefixed by the **RequestStatusLabel**: mono "RESCHEDULE REQUEST" 10 600 .08em `ink-3`, gap 8, then the tag. This keeps it distinct from the booking's own status.

### 2.5 Mini tag `MiniTag` (inside schedule options)
- h18, padding 0 6, radius 4, 1px border, transparent bg, sans 10 700 .06em UPPERCASE.
- **Variants:**
  - "Requested": `ink-3` text, `line` border.
  - "Matches note": `success` text, `success-border` border.

### 2.6 Count pill `CountPill`
- h20, padding 0 7 (min-width 20 in the sidebar), radius 10, bg `gold`, text `on-gold`, 11 700, line-height 20.

### 2.7 Eyebrow / KV pair `Eyebrow`, `KeyValue`
- **Eyebrow:** the eyebrow style from §1. Tone variants:
  - `gold` for Requested, Customer request and Final schedule
  - `success` for "Current · confirmed" and "Original booking stays"
  - `warning` for "Requested · pending"
- **KeyValue:** column with gap 3; KV label above a 14/20 value. Date and time values use mono 13 600.

### 2.8 Summary block `BookingSummary`
- **Base:** bg `raised`, 1px `line`, radius 10, padding 14 16.
- **Grid:**
  - Customer form: 3 columns, gap 14 16, showing Service, Therapist, Duration, Date, Time, Location.
  - Admin reschedule modal: 4 columns, showing Service, Customer, Location, Currently.
- Preceded by the eyebrow "CURRENT BOOKING" (gap 10).

### 2.9 Schedule comparison `ScheduleCompare` (current → requested / final)
- **Layout:** row of two cards, gap 12, with an 18px `ink-3` arrow-right centred between them.
- **Card:**
  - flex 1, column, gap 6, padding 14 16, radius 10, bg `raised`.
  - Contents: eyebrow, then date (mono 15 700 `ink`), then time (mono 13 600 `ink-2`), then sub line (12 `ink-3`, margin-top 2).
- **Card borders:**
  - Left (current): `line`.
  - Right (requested / final): `gold-line`.
- **Copy by board:**

  | Board | Left card (eyebrow → sub) | Right card (eyebrow → sub) |
  |---|---|---|
  | Customer review | "Current" → "Stays booked until approved" | "Requested" (gold) → "Preference · 60 min" |
  | Customer submitted | "Current · confirmed" (success) → "Your booking stays as is" | "Requested · pending" (warning) → "Awaiting review" |
  | Admin drawer | "Current schedule" → "Booking · Accepted · unchanged until approved" | "Customer request" (gold) → "Preference, not a commitment" |
  | Approve confirmation | "From · current" → "Will be released" | "To · final" (gold) → "With JV · 60 min" |

### 2.10 Quote block `CustomerNoteQuote`
- Eyebrow ("YOUR SUGGESTION" or "CUSTOMER NOTE") with gap 8 to a `<blockquote>`.
- Blockquote: padding 12 14, radius 8, bg `bg`, 1px `line`, sans 14/21 italic `ink`, wrapped in curly quotes “…”.

### 2.11 Info note `InfoNote` (non-interactive)
- **Base:**
  - `role="note"`, flex, gap 10, padding 10 12, 1px `line`, radius 8, bg `raised`, sans 13/19 `ink-2`.
  - Leading 16px icon with padding-top 1.
- **Icons:** `info` (info blue) for request/preference disclaimers; `bell` for notification statements.
- **Locked copy:**
  - "Customer and therapist will be notified." Admin direct reschedule. Replaces the old checkbox.
  - "Availability is confirmed again when you approve. Customer and therapist will be notified." Drawer.
  - "The booking will be rescheduled. Customer and therapist will be notified." Approve confirmation.
  - "The customer will be notified. Nothing changes for the booking or the therapist." Reject confirmation.
  - "Your preferred time is a request, not a confirmed booking. Our team will review it and confirm the final time with you." Customer form.
  - "Requesting doesn't change your booking yet. If approved, the final time may differ slightly from your request. We'll follow your suggestion where we can." Customer review.
  - "This is a request. Our team confirms the final time." Mobile.

### 2.12 Banners and alerts
- **StatusBanner** (customer booking detail):
  - `role="status"`, flex, gap 12, padding 12 14, radius 10, 1px `<tone>-border`, bg `<tone>-bg`.
  - 16px tone icon: check (success, 2px stroke), alert (danger), clock (warning).
  - Title 14 600 `ink` (block); body 13/19 `ink-2`; dates inline as mono 12 600 `ink`.
  - Rejected variant: the admin note sits inside the body as an italic block with padding-left 10 and a 2px `line` left border, followed by "— Infinity Home Spa".
- **GoldSummaryBanner** (admin list header):
  - flex, gap 16, padding 12 16, radius 10, 1px `gold-line`, bg `gold-bg`.
  - Leading clock 16 `gold`; text 14 with a 600 lead sentence then `ink-2`; right-hand mono meta (nowrap).
- **WarningCallout** (approve modal, final ≠ requested):
  - flex, gap 10, padding 10 12, radius 8, 1px `warning-border`, bg `warning-bg`, 13/19 `ink-2`.
  - info icon in `warning`; bold lead in `ink`.
- **ErrorAlert** (admin reschedule conflict):
  - `role="alert"`, flex, gap 12, padding 12 14, radius 8, 1px `danger-border`, bg `danger-bg`.
  - alert icon `danger`; title 13 600 `ink`; body 13/19 `ink-2` with mono time.

### 2.13 Modal `Modal`
- **Shell:** `role="dialog"`, `aria-modal`, centred over `scrim`.
- **Widths:**

  | Modal | Width |
  |---|---|
  | Admin direct reschedule | 640 |
  | Customer request flow | 600 |
  | Approve / Reject confirmations | 560 |

- **Container:** bg `surface`, 1px `line`, radius 14, modal shadow, overflow hidden.
- **Header:**
  - padding 22 24 18, bottom border `line`.
  - Left column (gap 4): meta row (mono ref + StatusTag or RequestStatusLabel, gap 10), then serif 22 title.
  - Close button at top right.
  - Optional Back icon button left of the title (gap 12), used on customer Review.
- **Body:** padding 20 24, column, gap 20.
- **Footer:**
  - padding 16 24, top border `line`, bg `bg`, flex, gap 12.
  - Left side holds either a change summary or a ghost/danger action, followed by a flex spacer.
  - Right side: ghost secondary action, then the primary action. The primary is always rightmost.
- **Change summary (footer left):**
  - Wrapping flex with column-gap 8 and row-gap 2.
  - Old time in mono 12 `ink-3` → arrow 14 → new time in mono 12 700.
  - New time is `gold`, or `danger` when there's a conflict.

### 2.14 Drawer `Drawer` (admin request review)
- **Position:** right, full height, width 600, over `scrim`.
- **Container:** bg `surface`, left border `line`, drawer shadow, column layout.
- **Header:**
  - padding 20 24 16, bottom border `line`.
  - Meta row: mono ref + RequestStatusLabel(Pending).
  - Serif 22 title "Reschedule request".
  - Context line (13 `ink-2`): "Customer · Service · 60 min · with JV · submitted" followed by the mono 11 timer "2H 14M AGO".
  - Close button at top right.
- **Body:** padding 20 24, gap 20, scrollable. Contains ScheduleCompare, then CustomerNoteQuote, then FinalScheduleOptions, then InfoNote.
- **Sticky footer:**
  - padding 16 24, top border `line`, bg `bg`.
  - Left: `danger` outline "Reject request".
  - Middle (right-aligned): eyebrow "FINAL" above mono 12 700 `gold` "FRI, OCT 9 · 06:30 PM".
  - Right: primary "Approve & reschedule".

### 2.15 Stepper `RequestStepper` (customer flow)
- **Steps:** "Choose time" → "Review" → "Submitted".
- **Layout:** row, gap 16. Items are sans 12, nowrap, gap 6, with an 18px circular number (1px border, 10 700).
- **States:**
  - Done: `gold` fill, `on-gold` number, `gold` label.
  - Current: `gold` border and label, weight 700.
  - Upcoming: `ink-3` border and label.
- **Separators:** 16×1px `line`.

### 2.16 Date strip `DateStrip`
- **Layout:**
  - Header row: field label (13 600) on the left, mono "OCTOBER 2026" meta on the right.
  - Row of 7 chips (5 on mobile), gap 6.
- **Chip:**
  - flex 1, h58, radius 8, column centred, gap 2.
  - Weekday in mono 10 600 .08em; day number sans 17 700.
- **States:**
  - Rest: bg `raised`, 1px `line`, `ink` (weekday `ink-3`).
  - Selected: bg/border `gold`, text `on-gold`.
  - Current booking date: bg `raised`, **1px dashed** `line-strong`.
  - Unavailable (admin modal): transparent, 1px `line`, text `ink-disabled`.

### 2.17 Time slot grid `TimeSlotGrid`
- **Layout:**
  - Header: label "Preferred time · Fri, Oct 9" (customer) or "Available times · Fri, Oct 2" (admin), with an optional right-hand caption ("90-min slots", 12 `ink-3`).
  - Grid gap 8. Columns: 5 (customer form), 4 (admin modal), 3 (mobile).
- **Slot:** h38, radius 8, mono 13 600. Selected uses `aria-pressed="true"`.
- **States:**
  - Rest: bg `raised`, 1px `line-strong`, `ink`.
  - Selected: bg `gold-bg`, 1px `gold` plus inset 1px `gold`, text `gold`.
  - Unavailable (admin only): transparent, 1px `line`, `ink-disabled`, line-through, `disabled`.
  - Conflict (admin only): bg `danger-bg`, 1px `danger` plus inset, text `danger`.
- **Customer slots are preferences:** show no availability markers on the customer side.

### 2.18 Final schedule options `FinalScheduleOptions` (admin drawer)
- **Header:** eyebrow "FINAL SCHEDULE" (gold) on the left; caption "Times shown are open for JV · Fri, Oct 9" (12 `ink-3`) on the right.
- **Options:** a list of `role="radio"` rows, gap 10.
  - **Row:** flex, gap 12, padding 12 14, radius 8.
  - **Contents:** 16px radio dot, then a column (mono 13 700 time + MiniTag, sub 12 `ink-3`), then a right-hand label (12 600).
- **States:**
  - Rest: bg `raised`, 1px `line-strong`; dot has a 1px `line-strong` ring.
  - Selected: bg `gold-bg`, 1px `gold` plus inset; dot has a 5px `gold` ring with an `on-gold` centre; right-hand label "Selected".
  - Unavailable: transparent, 1px `line`, all text `ink-disabled`, `aria-disabled`; right-hand label "Not available".
- **Order:**
  1. The customer's requested time, with MiniTag "Requested".
  2. Valid alternatives, with MiniTag "Matches note" when they satisfy the note.
- **Below the list:** TextLink "Choose another date or therapist".

### 2.19 Text inputs
- **Search / Select:** h38, padding 0 12, 1px `line-strong`, radius 8, bg `surface`, sans 13.
  - Search: leading 15 search icon, placeholder `ink-3`.
  - Select: value `ink` with a trailing 14 chevron-down in `ink-3`.
  - Widths on the admin list: search 280, selects 160 / 150.
- **Textarea** (reason / suggestion / note):
  - padding 10 12, radius 8, bg `bg`, 1px `line-strong`, sans 14/20 (13 in the admin modal, 16 on mobile).
  - Min-height 64–80.
  - Focused (as shown on boards): **2px `gold`** border.
  - Header row: label (13 600) on the left; "Optional" (12 `ink-3`) on the right.
  - Helper below: 12 `ink-3`.

### 2.20 Table `DataTable` (admin)
- **Container:** bg `surface`, 1px `line`, radius 12, overflow hidden. Table at 100% width, border-collapse.
- **Header cells:** table-header style, padding 10 16, bottom border `line`, nowrap.
- **Body cells:** padding 14 16, bottom border `line` (none on the last row), vertical-align middle.
- **Two-line cells:**
  - Line 1: sans 14 600 (+ mono 11 ref, gap 8, baseline).
  - Line 2: 13 `ink-2` (customer), or 12 `ink-3`.
- **Selected row:** bg `raised`, plus a 3px `gold` bar in the leading 3px-wide column.
- **Footer:**
  - padding 10 16, top border `line`, flex space-between.
  - Left text 12 `ink-3`; right mono meta or pagination (secondary sm buttons).

### 2.21 Tabs `Tabs` and segmented control `SegmentedFilter`
- **Tabs:**
  - Row, gap 28, bottom border `line`. Items: sans 14, padding 0 2 12, 2px bottom border.
  - Active: `ink` 600, `gold` underline, optional CountPill.
  - Inactive: `ink-2` 500, transparent underline.
  - **Order (locked):** Needs Attention · All Bookings · Pending Refunds · Cancelled.
- **SegmentedFilter** (pinned at the top of All Bookings):
  - Track: padding 4, gap 4, 1px `line`, radius 10, bg `surface`.
  - Item: h34, padding 0 14, radius 7, sans 13.
  - Active: bg `gold-bg`, 1px `gold-line`, `ink` 600, CountPill; `aria-pressed`.
  - Inactive: transparent `ink-2` 500, with a mono 12 `ink-3` count.
  - Items **(revised by §8.4)**: "New / Pending" · "Reschedule requests" · "Awaiting Customer".
  - Right-hand mono meta: "PINNED TO THE TOP OF ALL BOOKINGS".

### 2.22 Waiting timer `WaitingTimer`
- Inline flex, gap 5–6: 12px clock icon, then mono 11–12 600 (e.g. "2H 14M AGO" or "WAITING 3H 12M").
- Colour: `warning` when waiting > 2h, otherwise `ink-3`.

### 2.23 Request history `RequestHistory` (customer detail card)
- **Section:** eyebrow "RESCHEDULE REQUESTS" with gap 4 to the list.
- **Row:**
  - flex, gap 12, padding 10 0, bottom border `line` (none on the last row).
  - Left column:
    - 13px "Requested " + mono 12 600 date/time.
    - Below: 12 `ink-3` "Submitted Oct 2 · Approved Oct 2 · Final time" + mono 11 "06:30 PM".
  - Right: request StatusTag.

---

## 3. Board-specific compositions

### 3.1 Customer booking list card `CustomerBookingCard` (board 0)
- **Container:** flex, gap 20, padding 20, bg `surface`, 1px `line`, radius 12.
- **DateBlock:**
  - 60 wide, padding 8 0, radius 8, bg `raised`, 1px `line`, centred.
  - Mono weekday and month (10 600 .08em `ink-3`); serif 24 day number.
- **Body (gap 6):**
  - Title row: 16 600 service name, StatusTag on the right.
  - Meta line, 13 `ink-2`: mono 12 600 `ink` time range · with Therapist · duration · location.
- **Footer:**
  - margin-top 8, padding-top 12, top border `line`.
  - Left: optional ineligibility hint (14 info icon + 12 `ink-3`: "Rescheduling isn't available once your session is under way.").
  - Right: ghost sm "View details", then secondary sm "Request Reschedule".
- **Eligibility (locked):** "Request Reschedule" shows **only** for `pending` and `accepted`. It is hidden for `pending_payment`, `en_route`, `arrived`, `completed`, `rejected` and `cancelled`.

### 3.2 Customer booking detail card `BookingDetailCard` (boards 3b, 4, 5)
- **Container:** width 600, bg `surface`, 1px `line`, radius 14.
- **Header:**
  - padding 20 24 16, bottom border `line`.
  - Mono ref + StatusTag (booking status), then serif 22 service title, close button on the right.
- **Body:**
  - padding 20 24, gap 18.
  - Order: StatusBanner, then a KeyValue grid (3 columns, gap 14 16: Date, Time, Duration, Therapist, Location, Payment), then RequestHistory.
- **Footer:** padding 16 24, top border `line`, bg `bg`. Ghost "View details", spacer, then the right-hand action.

| Board | StatusBanner | Footer right |
|---|---|---|
| 3b (pending request) | warning: "Reschedule request pending" + "You asked for … Your current booking stays as is until our team reviews it." | caption "One request at a time" (12 `ink-3`) + **disabled** "Request Reschedule" |
| 4 (approved) | success: "Reschedule approved" + new time and why it differs. Date/Time update to the final schedule. | "Request Reschedule" |
| 5 (rejected) | danger: "Reschedule request not approved" + "Your original booking stays confirmed for …" + quoted admin note | "Request another time" |

### 3.3 Customer flow modals (boards 1, 2, 3, plus 1m mobile)
| Board | Header | Body | Footer |
|---|---|---|---|
| 1 Form (600) | ref, then "Request a new time" | Stepper(1) → BookingSummary → eyebrow "PREFERRED NEW SCHEDULE" (gap 12) → DateStrip → TimeSlotGrid(5 col) → Textarea "Suggestion or reason" (Optional) + helper "Tell us what else works for you. This helps us find the best time." → InfoNote | spacer · ghost Cancel · primary "Review request" |
| 2 Review (600) | Back · ref · "Review your request" | Stepper(2) → ScheduleCompare → CustomerNoteQuote("YOUR SUGGESTION") → 3-col KV box (padding 14 16, 1px `line`, radius 10, no fill: Service, Therapist, Location) → InfoNote | ghost "Edit request" · spacer · primary "Submit Reschedule Request" |
| 3 Submitted (600) | "Request sent" | Stepper(3) → RequestStatusLabel(Pending) → serif 26 "Reschedule Request Submitted" → 14/21 `ink-2` thank-you line → checklist (3 rows, gap 10, 14px gold check: current booking unchanged / team will review / you'll be notified when approved or rejected) → ScheduleCompare (submitted copy) | spacer · secondary "View booking" · primary "Done" |
| 1m Mobile (390×844) | full-screen sheet; header padding 14 16, 44px back button, mono ref + serif 19 title | padding 16, gap 18: Stepper → compact current card (raised, radius 10, padding 12 14: eyebrow CURRENT, 14 600 "Service · Therapist", mono 12 date/time, "60 min" right) → DateStrip(5) → TimeSlotGrid(3 col) → Textarea (16px) → InfoNote | sticky: padding 12 16 20, top border `line`, bg `bg`, primary `lg` full-width "Review request" |

### 3.4 Admin request list (board 6)
- **Placement:** inside the existing Bookings Manager → All Bookings tab → SegmentedFilter "Reschedule requests". The order of elements is:
  1. Page header: H1 "Bookings Manager" with the 14 `ink-2` sub line; search and selects on the right.
  2. Tabs.
  3. SegmentedFilter.
  4. GoldSummaryBanner: "3 customer reschedule requests are Pending." / "Bookings keep their current schedule until a request is approved." / "SORTED BY: OLDEST REQUEST".
  5. DataTable.
- **Main area:** padding 28 32, gap 20.
- **Columns:**
  1. accent (3px)
  2. Booking · Customer (service + ref / customer / 12 `ink-3` "with JV · booking" + booking StatusTag)
  3. Current schedule (eyebrow CURRENT `ink-3`, mono date and time in `ink-2`)
  4. Customer request (eyebrow REQUESTED `gold`, mono date 700 and time in `ink`)
  5. Customer note (13 italic `ink-2`, max-width 220, truncated; "No note" non-italic `ink-3`)
  6. Request (StatusTag Pending + WaitingTimer)
  7. Action (secondary sm "Review", right-aligned)
- **Footer:** "Approved and rejected requests stay in each booking's history" + "UPDATED 1 MIN AGO".

### 3.5 Admin confirmations (boards 8, 9) — Modal 560
| | Approve | Reject |
|---|---|---|
| Header meta | ref + RequestStatusLabel(Pending) | same |
| Title | "Approve reschedule?" | "Reject reschedule request?" |
| Body | ScheduleCompare (From · current → To · final) → WarningCallout (only when final ≠ requested: "Different from the customer's request (6:00 PM). It matches their note: …") → InfoNote(bell) | "Original booking stays" block (raised, radius 10, padding 14 16, eyebrow success, mono 14 700 date/time, 12 `ink-3` service · therapist · status) → "Declined request" row (13 `ink-3` + mono 12) → Textarea "Note to customer" (Optional; helper "Shown to the customer with the rejection.") → InfoNote(bell) |
| Footer | spacer · ghost "Back" · primary "Confirm approval" | spacer · ghost "Back" · danger-solid "Reject request" |

### 3.6 Admin direct reschedule modal (existing Bookings Manager row action) — Modal 640
> **Superseded in part by §8.** For an admin-initiated reschedule, this modal's shell (BookingSummary, DateStrip, Therapist select, TimeSlotGrid, ErrorAlert, Textarea) is reused as-is, but it now **proposes** a schedule for the customer to confirm instead of mutating the booking immediately — see §8.3. Keep this section as the shared layout reference; §8.3 is the authoritative behaviour going forward.
- **Header:** ref + StatusTag, then "Reschedule booking".
- **Body:**
  1. BookingSummary (4 columns).
  2. Two-column grid (1fr / 200px, gap 16): DateStrip on the left; "Therapist" select on the right with caption "Showing JV's free times".
  3. TimeSlotGrid (4 columns).
  4. ErrorAlert, only in the conflict state.
  5. Textarea "Reason for change" (Optional).
  6. InfoNote(bell) "Customer and therapist will be notified." There is **no checkbox**.
- **Footer:** change summary · ghost "Cancel" · primary "Confirm reschedule" (disabled while a conflict exists).
- **Row-action rule (locked):** Reschedule shows only for `pending` and `accepted`. Every other status gets the ⋯ menu only. There is **no Approve** button anywhere in admin; therapists accept bookings.

### 3.7 App shell (reference only; use the existing app shell)
- **Sidebar:**
  - 248 wide, bg `bg`, right border `line`, padding 18 12 16.
  - Brand: 36px `gold` tile with radius 8 and an `on-gold` crown; serif 15/20 name; 12 `ink-3` sub line.
  - Nav groups: group label, then items (h38, padding 0 12, radius 8, sans 14, 16px icon, gap 12).
    - Active item: bg `raised`, 1px `line`, `ink` 600, `gold` icon, optional CountPill.
    - Inactive item: `ink-2` 500 with `ink-3` icon.
  - User card (bottom): padding 10, radius 10, bg `surface`, 1px `line`, 34px avatar.
- **Top bar:** h64, padding 0 32, bottom border `line`. Left: mono date meta above the serif greeting. Right: IconButtons (gap 10).

---

## 4. States coverage
| State | Designed treatment |
|---|---|
| Selected | Date chip (gold fill) · slot / option / segment (gold-bg + gold border + inset) · table row (raised + 3px gold bar) · tab (gold underline) · nav (raised + border) |
| Disabled | Button disabled style; slot and option unavailable style; Request Reschedule disabled while a request is pending (plus the "One request at a time" caption) |
| Error | ErrorAlert + conflict slot + summary time in `danger` + primary disabled |
| Pending / Approved / Rejected | RequestStatusLabel + StatusTag; customer StatusBanner (warning / success / danger); RequestHistory row |
| Focused input | Textarea with 2px gold border |
| Hover, active (pressed), keyboard focus ring | Follow the Spa Booking UI design system (§5 of its README): hover `surface-hover` + `line-hover`, pressed `gold-active`, 2px gold focus ring at 2px offset. |
| Loading, empty, toast feedback | **Locked**. See §4.1. |

### 4.1 Locked states and feedback rules (final)

**Toasts**
- Use the navy surface treatment, never inverted colours.
  - Container: bg `raised`, 1px border, radius 10, padding 12 14, gap 12.
  - Shadow `0 12px 32px rgba(0,0,0,.45)`, max-width 420.
  - Text: sans 14/20 `ink`.
- **Status accent:** a leading 16px icon in the tone colour, plus a matching 1px tone border.
  - Success: check icon (2px stroke) in `success`, border `success-border`.
  - Error: alert icon in `danger`, border `danger-border`.
  - Info: info icon in `info`, border `info-border`.
- **Actions:** an optional gold TextLink action ("Undo", "Retry"), then a 24px close button with a 14px x in `ink-3`.
- **Copy:** one line, past tense, e.g. "Booking rescheduled to Fri, Oct 9 · 6:30 PM."
- **Position:** bottom-center on mobile, bottom-left beside the sidebar on desktop.
- **Timing:**
  - Success and info auto-dismiss after 5s and pause on hover or focus.
  - Error stays until dismissed.
  - One toast at a time; a new toast replaces the old one.
- **Roles:** `role="status"` for success and info, `role="alert"` for error.
- Use an error toast only for a failed action that can simply be retried. Anything that needs a decision uses an ErrorAlert or a banner.

**Empty states**
- **Layout:** centred column, gap 8, padding 40 24, inside the same container as the content.
- **Optional icon:** a 40px circle (bg `raised`, 1px `line`) holding an 18px outline icon in `ink-3`, 4px above the heading.
  - The icon is always secondary to the heading and text.
  - Error variant: `danger-bg`, `danger-border`, `danger` icon.
  - Success variant: `success-bg`, `success-border`, `success` icon.
- **Text:** heading sans 15/22 600 `ink`, then one 14px `ink-2` sentence (max-width 360).
- **Action:** at most one (secondary sm, or ghost/link "Clear filters"), 12px below the text.
- **Never:** illustrations, large icons or decorative artwork.
- **Example:** "No reschedule requests" / "New customer requests will appear here."

**Loading indicators**
- **One ring for every spinner:**
  - Circle, 2px stroke, one quarter transparent, 0.7s linear spin.
  - Stops under `prefers-reduced-motion`.
- **Button spinner:**
  - 14px ring: `on-gold` on primary buttons, `ink` on secondary and outline buttons.
  - The button keeps its width, the label may switch to the "-ing" verb ("Approving…", "Submitting…"), and the button sets `aria-busy="true"`.
- **Inline spinner:**
  - 16px `gold` ring plus a 13/19 `ink-2` line, gap 10. Example: "Checking JV's availability…".
  - Use it for table refreshes or "load more", drawer and modal sections (availability, booking details), and small content regions.
  - Put `aria-busy="true"` on the region and `aria-live="polite"` on the text.
- **Skeletons** (first load of tables, lists and cards):
  - `raised` blocks at the real row heights and badge shapes, radius 4, with a subtle shimmer.
  - Show only after 300ms.
- **Never:** a full-page spinner after the first load, or large or decorative loaders.

## 5. Responsive
- **Desktop:** modals centred over the scrim; the drawer docks right at 600px; tables at full width.
- **Mobile (board 1m):** the customer flow becomes a full-screen sheet with a 44px back button and a sticky full-width `lg` primary button. DateStrip shows 5 days; slots use 3 columns; textarea text is 16px; touch targets are at least 44px.
- **Admin drawer, tables and confirmations below tablet width:** **[not on boards]**. Follow the app's existing responsive behaviour.

## 6. Locked behaviour rules (UI must reflect them; the backend is the authority)
1. Customers submit a **request**. Their date/time is a **preference**, never shown as confirmed.
2. A booking can have only one active reschedule request at a time.
3. The original booking stays visible and unchanged until approval succeeds.
4. The admin may pick another valid slot that matches the customer's note. The UI labels "Requested" and "Final" separately and warns when they differ.
5. Only admin approval changes the schedule, using the existing backend availability rules. The UI shows the times the backend reports as open. Don't re-implement conflict, travel, buffer or duration logic in the frontend.
6. Rejection leaves the booking unchanged and notifies the customer. The admin note is optional.
7. Notifications are automatic. Show them as InfoNotes, never as checkboxes.

## 7. Example content (use for fixtures)
- **Booking:** IHS-2052 · Swedish Massage · 60 min · JV · Home (Dubai South) · Cash on completion · Accepted.
- **Current:** THU, OCT 8 · 08:00 – 09:00 PM.
- **Requested:** FRI, OCT 9 · 06:00 PM.
- **Note:** "If 6:00 PM is unavailable, any time after 5:00 PM works for me."
- **Final (approved):** FRI, OCT 9 · 06:30 – 07:30 PM.
- **Rejection note:** "JV is fully booked on Oct 9. Your original time is still confirmed. Feel free to request another date."

---

## 8. Admin-Initiated Reschedule (Proposal) Flow — Approved Revision

This section finalizes the latest approved concept for an **admin-initiated** reschedule. It is additive: every component it uses already exists above (§2–§3). No new visual language, colour, or shape is introduced — only new copy, new status values, and one new entity.

### 8.1 Concept & terminology
- **Reschedule Request** (existing, §2.4/§2.14/§3.3–§3.5): the **customer or therapist** asks; the **admin** decides.
- **Reschedule Proposal** (new, this section): the **admin** offers a new time; the **customer** decides.
- **Proposal statuses:** `pending` (awaiting customer) → one of `accepted` / `countered` / `cancelled` / `expired`.
- **Core invariant (extends §6 rule 3):** the booking's actual schedule changes on exactly one event — the customer accepting a proposal, or the admin approving the Request that a countered proposal produces. At every other point, both sides see the booking's **current, unchanged schedule**, with the proposal shown only as a separate pending comparison (§2.9 `ScheduleCompare`).
- **Reuse rule:** "Request Another Time" and "Cancel Booking" are not new features — they hand off to the flows that already exist (§3.3 customer request flow; the app's existing cancel-booking modal). This section only adds the proposal itself and the three-way response banner.

### 8.2 New status vocabulary (extends §2.4)
**`ProposalStatusLabel`** — identical construction to `RequestStatusLabel` (§2.4): mono "RESCHEDULE PROPOSAL" 10 600 .08em `ink-3`, gap 8, then the `StatusTag`.

| Value | Label | Tone |
|---|---|---|
| `pending` | Awaiting Customer | warning |
| `accepted` | Accepted | success |
| `countered` | Alternative Requested | info |
| `cancelled` | Booking Cancelled | danger |
| `expired` | Expired · No Response | neutral — `ink-3` text, `line` border, transparent bg (the same undyed style as `MiniTag` "Requested", §2.5; no new colour token) |

**`CountdownTimer`** (extends `WaitingTimer`, §2.22) — same construction (12px clock + mono 11–12 600), counting down instead of up, e.g. "EXPIRES IN 22H 10M". Colour `warning` when under 2h remaining, otherwise `ink-3` — the same threshold rule as `WaitingTimer`, mirrored.

### 8.3 Admin: Propose New Schedule (entry point)
- **Eligibility (unchanged from §3.6):** available only on `pending` and `accepted` bookings, with no more than one open reschedule item (Request or Proposal) per booking (§8.11 rule 12).
- **Modal:** reuses §3.6's layout verbatim (Modal 640 · `BookingSummary` 4-col · `DateStrip` + Therapist select · `TimeSlotGrid` 4-col · `ErrorAlert` on conflict), with these changes only:
  - Title: **"Propose new schedule"** (was "Reschedule booking").
  - Textarea label: **"Note to customer (optional)"** (was "Reason for change") — this note is shown to the customer, unlike the old reason field.
  - `InfoNote`(bell) copy: *"The customer will be notified and can accept, suggest another time, or cancel. The booking keeps its current schedule until they respond."*
  - Footer change summary: same mono old → new pattern as §2.13, new time in `gold` (unchanged rule) — it previews the proposal, not a committed change.
  - Footer primary button label: **"Send Proposal"** (same `primary` gold variant, same disabled-on-conflict rule as §3.6).
- **On submit:** creates a `pending` Proposal. **The booking is not mutated.** Toast: *"Proposal sent — waiting for the customer to respond."* (`info` tone, role="status", 5s auto-dismiss, per §4.1).

### 8.4 Admin: Waiting-for-Customer state
- **Placement:** a third `SegmentedFilter` (§2.21) item, **"Awaiting Customer"**, added to the existing two (revision noted in §2.21 directly). Badge = count of `pending` proposals.
- **GoldSummaryBanner** (§2.12, reused as-is): *"2 proposals are awaiting a customer response."* / *"Bookings keep their current schedule until the customer responds."* / mono meta "SORTED BY: OLDEST PROPOSAL".
- **DataTable** (§2.20), same shell as §3.4 with these columns:
  1. accent (3px, `warning` — matches the Pending tag tone)
  2. Booking · Customer (same shape as §3.4 col 2)
  3. Current schedule (eyebrow CURRENT, `ink-3`; mono date/time `ink-2`)
  4. Proposed schedule (eyebrow PROPOSED, `gold`; mono date 700 + time `ink`)
  5. Admin note (13 `ink-2`, max-width 220, truncated; "No note" non-italic `ink-3`)
  6. Status: `ProposalStatusLabel` + `StatusTag`(Awaiting Customer) + `CountdownTimer`
  7. Action: `ghost` sm **"View"** only, right-aligned — there is nothing to decide yet, so no "Review" button.
  - Footer: *"Accepted, countered, cancelled and expired proposals stay in each booking's history"* + mono meta "UPDATED 1 MIN AGO" (same pattern as §3.4).
- **Drawer** (§2.14 shell, read-only variant): identical header/body; the sticky footer drops both action buttons and shows a single centred `InfoNote`: *"Waiting for the customer to respond. You'll be notified here."*
- **[Not on boards]:** admin withdrawing/cancelling a proposal before the customer responds. Not designed — do not add a control for it.

### 8.5 Customer: the proposal banner (entry point for all three responses)
- **Placement:** on `CustomerBookingCard` (§3.1) and `BookingDetailCard` (§3.2), in the same slot the existing pending-request `StatusBanner` occupies (§3.2 board 3b).
- **StatusBanner** (§2.12, tone `warning`): title *"New time proposed"*; body *"Our team proposed a new time for your booking."*, dates inline as mono.
- **`ScheduleCompare`** (§2.9) immediately below: left "Current · confirmed" (success) / "Your booking stays as is", right "Proposed" (gold) / "Awaiting your response".
- **Response actions** (reuses §2.1 `Button`, footer ordering rule "primary always rightmost" from §2.13):
  - left: `danger` outline **"Cancel Booking"** (matches the app's existing cancel-button styling)
  - middle: `secondary` **"Request Another Time"**
  - right: `primary` **"Accept New Schedule"**
- **`InfoNote`** below the actions: *"Accepting confirms this new schedule right away. Suggesting another time sends it to our team for review — your booking stays as is until then."*
- **`CountdownTimer`** (§8.2) under the note, 12 `ink-3`/`warning`: *"This proposal expires in {time} if there's no response."*
- **[Not on boards]:** the exact expiry window. Use the backend's own duration; the UI only renders the resulting countdown and, later, the expired state (§8.10).

### 8.6 Customer: Accept New Schedule → Accepted state
- **Confirmation step** reuses the Approve-confirmation `Modal` shell (560, §3.5 "Approve" column) with customer-facing copy:
  - Title: **"Accept this new schedule?"**
  - Body: `ScheduleCompare` ("From · current" → "To · new", gold) → `InfoNote`(bell): *"Your booking will be rescheduled. You and your therapist will both be notified."*
  - Footer: `ghost` "Back" · `primary` **"Accept Schedule"**.
- **On confirm:** the booking reschedules immediately to the proposed time; Proposal → `accepted`.
- **Resulting state:** `BookingDetailCard` `StatusBanner` switches to `success` — *"New schedule confirmed"* + the updated date/time (same construction as the existing approved-request banner, §3.2 board 4). Footer reverts to the normal booking actions.
- **Toast:** *"Booking rescheduled to {date} · {time}."* (success, matches the §4.1 example copy exactly).

### 8.7 Customer: Request Another Time → countered state
- Opens the **existing** customer request flow, §3.3 boards 1–3, **unchanged**, with one addition: the Form modal's header gains a context line under the title — mono 12 `ink-3`: *"Responding to proposed time: FRI, OCT 9 · 06:00 PM."*
- No new modal, no new fields. Submitting creates a standard `RescheduleRequest` (role = customer) exactly as §3.3 already defines, and sets the Proposal → `countered`.
- **Submitted** board (§3.3 board 3) is unchanged — its existing `ScheduleCompare` already communicates "current unchanged / new preference pending" correctly for this case.

### 8.8 Admin: review of the customer's alternative (countered) request
- Reuses the **existing** Reschedule Request review surfaces **entirely unchanged** — the `DataTable` row in "Reschedule requests" (§3.4), the review `Drawer` (§2.14), and the Approve/Reject confirmations (§3.5). No new review surface is introduced.
- **Only addition:** a small neutral tag next to the mono ref in the Drawer header and the DataTable row — `MiniTag` style (§2.5: `ink-3` text, `line` border): **"Countered Proposal"** — plus one context line under `ScheduleCompare` in the Drawer body (13 `ink-3`): *"This request follows a declined proposal of FRI, OCT 9 · 06:00 PM."*
- Approval/rejection then proceeds exactly per §2.14/§3.5: the original Proposal stays `countered` (a closed, historical state) and the new Request becomes `approved` or `rejected` on its own.

### 8.9 Customer: Cancel Booking → cancelled state
- Opens the app's **existing** cancel-booking modal, unchanged, with one addition: the existing subtitle line (*"{service} • {date} at {time}"*) gains a second line, 13 `ink-3`: *"Declining the proposed time: FRI, OCT 9 · 06:00 PM."*
- Existing cancellation rules (reason selection, refund/forfeit messaging) apply exactly as already built — nothing about cancellation itself changes.
- **On confirm:** booking → `cancelled` (existing `StatusTag`, §2.4); Proposal → `cancelled`.
- **`RequestHistory`** (§2.23) on the booking detail logs it: `ProposalStatusLabel` + `StatusTag`(Booking Cancelled) with sub-line *"Booking cancelled in response to this proposal."*
- **Toast:** unchanged existing cancellation copy/behaviour.

### 8.10 Proposal expired / no-response state
- When the (backend-owned) expiry window elapses with no customer action:
  - Proposal → `expired`. **The booking keeps its original, unmutated schedule** — the core invariant (§8.1) holds even on expiry.
  - **Customer side:** `StatusBanner` switches to the `info` tone (no dedicated neutral banner tone exists): title *"Proposal expired"*, body *"We didn't hear back in time, so your original booking stays as {current date/time}. You can still request a reschedule anytime."* The footer reverts to the normal `secondary` "Request Reschedule" action (§3.1 eligibility rule applies normally again).
  - **Admin side:** row/Drawer status becomes `StatusTag`(Expired · No Response); `CountdownTimer` is removed (nothing left to wait for); the row drops out of the "Awaiting Customer" `GoldSummaryBanner` count; the row's only action stays `ghost` "View".
  - **No toast.** Per §4.1, toasts report the result of a user's own action; an expiry is a passive, time-based transition, so it's communicated only through the banner/tag above and the backend's own notification (§8.11 rule 9) — never a client-side toast.

### 8.11 Updated locked behaviour rules (extends §6, continues its numbering)
8. An admin-initiated reschedule is a **proposal**, not an immediate change: the booking's schedule is not mutated when an admin proposes a new time — only when the customer accepts it, or (after a countered alternative) when the admin approves the resulting Request.
9. The customer must resolve a pending proposal with exactly one of three actions — **Accept New Schedule**, **Request Another Time**, or **Cancel Booking**. The UI never pre-selects or defaults among them. Notifications for every transition (proposed, accepted, countered, cancelled, expired) are automatic — show them as `InfoNote`s, never as checkboxes (extends rule 7).
10. A countered proposal is handled entirely through the existing Reschedule Request review flow (§2.14, §3.4, §3.5) — no separate review surface is introduced for it.
11. An expired proposal never changes the booking and never produces a toast — it silently returns both sides to the normal "no pending change" state.
12. Only **one** active reschedule item — a Request **or** a Proposal — may be open per booking at a time (extends the existing "one active request" rule).

### 8.12 Example content (use for proposal-flow fixtures)
- **Booking:** IHS-2052 · Swedish Massage · 60 min · JV · Home (Dubai South) · Cash on completion · Accepted.
- **Current:** THU, OCT 8 · 08:00 – 09:00 PM.
- **Proposed:** FRI, OCT 9 · 06:00 PM.
- **Admin note:** "JV has availability earlier that evening — let us know if this works or suggest another time."
- **Countered alternative:** "Anything after 7:00 PM on Oct 9 works better for me."
- **Expired copy:** "We didn't hear back in time, so your original booking stays as Thu, Oct 8 · 8:00 PM."