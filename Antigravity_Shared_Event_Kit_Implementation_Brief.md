SHARED EVENT KIT BOOKING SYSTEM

Antigravity Implementation & Validation Brief

Purpose: use this brief together with “Shared_Event_Kit_Booking_System_LLD.docx” to build a working, secure, testable, deployable web application. The LLD is the design reference; this brief makes implementation and verification expectations explicit.


## 1. Product scope

Build a web application for multiple student clubs sharing one physical event kit containing a camera, microphone, and tripod. Clubs reserve the whole kit for a time range. Coordinators manage handover, returns, inspections, missing/damaged equipment, recovery, replacement, warnings, and cancellation.


## 2. Mandatory functional requirements

- R1 — Whole-kit booking and conflict prevention: A reservation is for the complete kit, not an individual item. Reject overlapping or otherwise invalid reservations. The conflict check and reservation insert must be atomic so concurrent requests cannot double-book the kit.

- R2 — 15-minute buffer: Enforce a 15-minute gap between reservations for inspection/preparation. Use half-open intervals [start, end). For example, a booking ending at 15:00 and another beginning at 15:15 may be allowed; one beginning at 15:14 must be rejected. Cancelled bookings do not block availability.

- R3 — Item-by-item checkout and return: Record each kit item's checkout/return condition. Do not hand over the kit unless every required item is present and verified usable. A return must support partial returns and item-specific inspection outcomes.

- R4 — Warn the next at-risk booking: When an item is missing, damaged, or not verified usable and this puts a later booking at risk, persist a disruption record and notify the affected club/coordinator. Notifications must remain visible if the recipient is offline.

- R5 — Organizer resolution: An authorized coordinator can record recovery, record replacement equipment, inspect the recovered/replacement item, or cancel the affected booking according to the LLD. A recovered or replacement item must not become usable until it passes inspection.


## 3. Roles and permissions

- Club member: view availability and their club's reservations/notifications; create and cancel only permitted reservations; view relevant booking status.

- Coordinator/organizer: manage all bookings, check out/receive items, inspect condition, record disruptions, recovery/replacement, and cancel affected bookings.

- Enforce permissions on the server for every protected operation. Hiding a button in the UI is not authorization.

- Do not allow one club to read or modify another club's private booking details unless explicitly needed for shared availability or coordinator duties.


## 4. Suggested implementation stack

Preferred stack: React + Vite + TypeScript frontend; Node.js + Express + TypeScript backend; PostgreSQL + Prisma; Socket.IO for live updates; a maintained authentication approach with secure password hashing or an established identity provider. If the existing repository already has a coherent stack, inspect it first and explain any proposed deviation before changing technologies.


## 5. Required data and domain concepts

Implement domain/database concepts for users, clubs, kit, individual kit items, bookings, handover records, item inspection records, disruptions, notifications, and audit logs. Preserve the LLD's booking/item state machines and relationships. Store timestamps consistently and define the application timezone explicitly. Keep planned booking times separate from actual checkout/return timestamps.


## 6. Real-time behavior

- Broadcast booking availability/status changes to authorized connected clients after the database transaction commits.

- Persist notifications before attempting live delivery; live sockets are a delivery channel, not the only record.

- Handle reconnects by fetching missed state/notifications from the server.

- Never trust a client-side availability result as final; revalidate on the server when creating a reservation.


## 7. Non-functional and security requirements

- Validate all inputs on the server; use parameterized ORM queries and safe error responses.

- Use database transactions and appropriate constraints/locking to prevent race-condition double bookings.

- Use environment variables for secrets; provide .env.example with placeholders only; never commit real credentials.

- Use HTTPS in deployment, secure session/token handling, rate limiting for sensitive endpoints, and least-privilege database access.

- Add structured logs, audit events for sensitive actions, health checks, and documented backup/restore steps.

- Provide accessible, responsive pages with loading, empty, success, and error states.

- Do not claim production-ready until tests and deployment checks have actually passed.


## 8. Mandatory acceptance tests



| Test ID | Acceptance criterion |

| --- | --- |

| AT-01 | A valid future booking is created and persisted. |

| AT-02 | A reservation overlapping an existing active booking is rejected. |

| AT-03 | A booking beginning exactly 15 minutes after the prior end is handled according to the LLD's boundary rule. |

| AT-04 | A booking beginning less than 15 minutes after the prior end is rejected. |

| AT-05 | Cancelled bookings no longer block a slot. |

| AT-06 | Two concurrent requests for conflicting slots cannot both succeed. |

| AT-07 | Checkout is blocked if any required item is missing, damaged, or not verified usable. |

| AT-08 | Return supports item-level outcomes when only some items are returned. |

| AT-09 | A missing/damaged item creates a persisted disruption and warns the next affected booking. |

| AT-10 | A disconnected recipient can see the persisted notification after reconnecting. |

| AT-11 | Recovered/replacement equipment remains unavailable until it passes inspection. |

| AT-12 | An unauthorized club member cannot perform coordinator actions or alter another club's booking. |

| AT-13 | Invalid dates, end-before-start, malformed IDs, and invalid state transitions are rejected with safe errors. |

| AT-14 | The booking calendar reflects server state and updates live after successful changes. |

| AT-15 | Core flows work on desktop and mobile viewport sizes. |




## 9. Required validation evidence

- Automated unit tests for booking rules, state transitions, permissions, and disruption handling.

- Integration tests against a real test database for transactions, constraints, and concurrent booking attempts.

- Frontend end-to-end tests for sign-in, booking, checkout/return, warnings, and organizer resolution.

- Run and report the actual commands and outcomes for lint, typecheck, tests, and production build. Do not fabricate successful results.

- Provide a requirements traceability table mapping R1–R5 and each acceptance test to implementation files and test names.

- List any incomplete features, assumptions, limitations, and manual checks still required.


## 10. Delivery expectations

- First inspect the repository and the supplied LLD. Do not overwrite existing work blindly.

- Create a short implementation plan and repository/file map before making broad changes.

- Implement in small milestones. After each milestone, run relevant checks and fix failures before proceeding.

- Provide all source code, migrations, seed/demo data, .env.example, README setup instructions, test instructions, and deployment instructions.

- Include a demo coordinator account and club accounts only through safe local seed scripts with clearly documented non-production credentials; never hardcode these into production.

- At the end, report: implemented features, exact validation commands/results, deployment status, known gaps, and how to reproduce the tests.


## 11. Assumptions requiring explicit confirmation

The LLD marks several policies as assumptions, including future-only bookings, cancellation/rebooking instead of editing, no maximum booking duration, the exact warning recipient, replacement-equipment policy, and who may cancel after a disruption. Antigravity must preserve the LLD's marked assumptions for the first implementation, list them in README, and avoid silently inventing new business rules. If a rule is ambiguous or contradictory, ask before implementing that rule.


## 12. Definition of done

Done means the app runs from documented setup instructions, core flows work end-to-end, R1–R5 have traceable tests, concurrency and authorization have been tested, the production build succeeds, no secrets are committed, and known limitations are disclosed. A visually complete frontend without a functioning backend, persisted data, and passing validation is not done.
