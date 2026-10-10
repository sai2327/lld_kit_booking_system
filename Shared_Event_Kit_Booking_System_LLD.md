LOW-LEVEL DESIGN

Shared Event Kit Booking System

Camera • Microphone • Tripod

Purpose: Define an accurate, implementable design for clubs that reserve one shared event kit for student-team presentations.

Implementation language: Java 17 (illustrative skeleton).

Fixed requirements: R1–R5 only. No user interface, payments, reporting, or additional product features are included.


## 1. Assumptions and Open Questions



| Topic | Assumption / open question | Rationale |

| --- | --- | --- |

| Booking edits | [ASSUMED] Bookings cannot be edited after creation; cancel and create a new booking. | Avoids changing a reservation while conflict validation is in progress. |

| Organizer identity | [ASSUMED] Organizer identity is verified outside the domain service. | The requirements do not define authentication or roles. |

| Past-time bookings | [ASSUMED] New bookings must start in the future according to an injected clock. | Prevents backdated reservations; policy needs confirmation. |

| Timezone | [ASSUMED] Store timezone-aware instants; callers supply unambiguous instants. | Avoids local-time and daylight-saving ambiguity. |

| Maximum slot length | [ASSUMED] No maximum duration is enforced until specified. | No duration cap is in R1–R5. |

| Booking interval | [ASSUMED] Use half-open interval [start, end), with start < end. | Makes boundary behavior precise. |

| Active bookings | [ASSUMED] All non-cancelled bookings participate in schedule-conflict checks where their intervals are relevant. | Cancellation releases a reservation while preserving history. |

| Usability | [ASSUMED] Items become usable only after passing return inspection. | Missing or unverified equipment cannot be handed over. |

| Inspection duration | The 15-minute gap is a scheduling buffer, not a guarantee that inspection always finishes in 15 minutes. | Late returns can consume the buffer. |

| Warning recipient | [ASSUMED] Warn the earliest upcoming non-cancelled booking that cannot safely be served. | R4 does not define channels or escalation. |

| Warning delivery | [ASSUMED] Warning is delivered only after adapter confirmation; failures remain recorded. | Avoids false delivery success. |

| Replacement | [ASSUMED] Replacement must match the missing/damaged item type and pass inspection. | A different item type does not restore the required kit. |

| Return time | [ASSUMED] Record actual return and inspection times separately from scheduled times. | Late returns must be represented accurately. |

| Cancellation timing | [ASSUMED] An at-risk booking may be cancelled after its start if it has not been handed over; completed handover cannot be retroactively cancelled. | R5 does not define timing. |

| Concurrency | [ASSUMED] Storage supports atomic transaction or equivalent serialization for booking, handover, and resolution. | Application checks alone do not prevent races. |



Open questions: Should booking edits be supported? Who qualifies as an organizer? Are past-time bookings permitted? Which timezone will clients use? What is the maximum slot length? These are policy gaps, not added requirements.


## 2. Entities: Responsibility, Fields, Invariants


### Booking

Responsibility: Represents a club reservation of the entire kit for a time interval.



| Field | Type | Invariant |

| --- | --- | --- |

| id | BookingId | Unique and immutable. |

| clubId | ClubId | Required reserving club. |

| start / end | Instant | Required; start < end. |

| status | BookingStatus | Must follow the booking state machine. |

| riskReasons | Set<ItemId> | Items currently putting this booking at risk. |

| warningStatus | WarningStatus | Pending, delivered, or failed. |

| checkedOutAt / returnedAt | Optional Instant | Actual lifecycle timestamps. |



- A non-cancelled booking must not overlap another booking or sit less than 15 minutes from it.

- The reservation is for the entire kit, not individual items.

- AT_RISK means the reservation exists but the kit may not be handed over safely.

- COMPLETED requires checkout, return evidence, and recorded inspection outcomes.


### Kit

Responsibility: Represents the shared kit and determines handover readiness.

Fields: id: KitId; requiredItemTypes: exactly CAMERA, MIC, TRIPOD; itemIds: inventory identities. Invariant: a usable inspected item must exist for every required type.


### KitItem

Responsibility: Tracks the identity, type, and physical condition of one item.

Fields: id, type, state, conditionNote. MISSING and DAMAGED are never usable.


### HandoverRecord

Responsibility: Preserves item-by-item checkout and return evidence.

Fields: bookingId, checkoutAt, checkoutItems, returnAt, returnItems. Checkout must account for all required items; return must record missing items rather than omit them.


### InspectionRecord

Responsibility: Records inspection results for returned items.

Fields: bookingId, itemId, inspectedAt, result (PASS/DAMAGED/MISSING), note. Only PASS can make a returned item available.


### Disruption and Warning

Disruption fields: id, sourceBookingId, affectedBookingId, affectedItemIds, status (OPEN/RESOLVED/CANCELLED). It is resolved only when the kit is restored for the affected handover, not merely acknowledged.

Warning fields: bookingId, disruptionId, status (PENDING/DELIVERED/FAILED). Delivery is successful only after notification-adapter confirmation.


### Supporting types

Identifiers: BookingId, ClubId, KitId, ItemId, DisruptionId, OrganizerId. ItemType: CAMERA, MIC, TRIPOD. ItemCondition: USABLE, DAMAGED, MISSING. BookingStatus: RESERVED, AT_RISK, CHECKED_OUT, RETURNED_PENDING_INSPECTION, COMPLETED, CANCELLED. KitItemState: AVAILABLE, CHECKED_OUT, RETURNED_PENDING_INSPECTION, DAMAGED, MISSING, REPLACED.


## 3. Class Relationships (Mermaid)

classDiagram

class Booking {

BookingId id

ClubId clubId

Instant start

Instant end

BookingStatus status

Set<ItemId> riskReasons

}

class Kit {

KitId id

Set<ItemType> requiredItemTypes

Set<ItemId> itemIds

isReadyForHandover()

}

class KitItem {

ItemId id

ItemType type

KitItemState state

}

class HandoverRecord {

BookingId bookingId

Instant checkoutAt

Instant returnAt

}

class InspectionRecord {

BookingId bookingId

ItemId itemId

Instant inspectedAt

InspectionResult result

}

class Disruption {

DisruptionId id

BookingId sourceBookingId

BookingId affectedBookingId

Set<ItemId> affectedItemIds

DisruptionStatus status

}

class Warning {

BookingId bookingId

DisruptionId disruptionId

WarningStatus status

}

class BookingService

class BookingRepository {

<<interface>>

transaction()

findConflicts()

saveBooking()

}

class NotificationGateway {

<<interface>>

sendWarning()

}

BookingService --> BookingRepository

BookingService --> NotificationGateway

Booking "1" --> "0..1" HandoverRecord

HandoverRecord --> InspectionRecord

Kit "1" o-- "3..*" KitItem

BookingService --> Kit

BookingService --> Disruption

Disruption --> Warning

Decision: BookingService coordinates use cases but does not implement database access or message delivery. Related records must be loaded and saved atomically when a use case changes multiple entities.


## 4. State Machines


### 4.1 Booking state machine



| State | Event | Guard | Next state | Side effects / trace |

| --- | --- | --- | --- | --- |

| — | Book | Valid interval; no conflict | RESERVED | Persist reservation. R1, R2 |

| RESERVED | Disruption affects booking | Kit cannot safely be handed over | AT_RISK | Record reasons and warning. R4 |

| AT_RISK | Restoration verified | Complete usable kit; not cancelled | RESERVED | Clear resolved risk. R5 |

| RESERVED | Checkout | Eligible; all items present and usable | CHECKED_OUT | Record each item. R3 |

| AT_RISK | Checkout | Kit restored and verified | CHECKED_OUT | Record checkout and resolve risk. R3, R5 |

| CHECKED_OUT | Return | Outcome recorded for every expected item | RETURNED_PENDING_INSPECTION | Record actual return. R3 |

| RETURNED_PENDING_INSPECTION | Inspection | All items passed | COMPLETED | Persist inspection evidence. R3 |

| RETURNED_PENDING_INSPECTION | Inspection finds missing/damaged items | Next booking is at risk | COMPLETED | Create disruption and warn. R3, R4 |

| RESERVED | Cancel | Not handed over | CANCELLED | Release interval; retain history. R5 |

| AT_RISK | Cancel | Not handed over | CANCELLED | Release interval; retain history. R5 |



stateDiagram-v2

[*] --> RESERVED

RESERVED --> AT_RISK : disruption

AT_RISK --> RESERVED : verified restoration

RESERVED --> CHECKED_OUT : valid checkout

AT_RISK --> CHECKED_OUT : restored and verified

CHECKED_OUT --> RETURNED_PENDING_INSPECTION : return recorded

RETURNED_PENDING_INSPECTION --> COMPLETED : inspection recorded

RESERVED --> CANCELLED : organizer cancels

AT_RISK --> CANCELLED : organizer cancels

A return with missing or damaged equipment can complete the source booking once its return record and inspection findings are complete; the equipment issue is tracked separately. AT_RISK describes reservation risk and never permits an incomplete handover.


### 4.2 KitItem state machine



| State | Event | Guard | Next state | Side effects / trace |

| --- | --- | --- | --- | --- |

| — | Register | Unique identity and valid type | AVAILABLE | Add to inventory. R3 |

| AVAILABLE | Checkout | Kit and booking valid | CHECKED_OUT | Record checkout condition. R3 |

| CHECKED_OUT | Return | Physically returned | RETURNED_PENDING_INSPECTION | Record actual return. R3 |

| CHECKED_OUT | Missing at return | Item cannot be located | MISSING | Record loss and assess disruption. R3, R4 |

| RETURNED_PENDING_INSPECTION | Inspection passes | Present and usable | AVAILABLE | Record pass. R3 |

| RETURNED_PENDING_INSPECTION | Inspection fails | Damaged | DAMAGED | Record damage and assess disruption. R3, R4 |

| MISSING | Recovery | Original item physically recovered | RETURNED_PENDING_INSPECTION | Require fresh inspection. R5 |

| DAMAGED | Restoration | Item restored | RETURNED_PENDING_INSPECTION | Require fresh inspection. R5 |

| MISSING/DAMAGED | Replacement | Same type, accepted replacement | Old: REPLACED; new: pending inspection | Preserve old history. R5 |



The old item's REPLACED state is terminal for active inventory. The replacement is a distinct KitItem and becomes AVAILABLE only after passing inspection.


## 5. Pseudocode


### 5.1 Conflict check and boundary

Intervals are half-open [start, end). The 15-minute boundary is inclusive: ending at 15:00 and starting at 15:15 is valid. A start at 15:14:59 is invalid. Strict less-than comparisons implement this rule.

INSPECTION_GAP = 15 minutes

function conflicts(existing, candidate):                 // Traces to: R1, R2

if existing.status == CANCELLED:

return false

return candidate.start < existing.end + INSPECTION_GAP

AND existing.start < candidate.end + INSPECTION_GAP

function canBook(candidate, bookings):                    // Traces to: R1, R2

require candidate.start < candidate.end

for each existing in bookings:

if conflicts(existing, candidate): return false

return true


### 5.2 Booking

function book(clubId, start, end):                        // Traces to: R1, R2

require clubId present; require start/end valid; require start < end

require start > clock.now()                           // [ASSUMED]

transaction:

candidate = Booking(clubId, start, end, RESERVED)

if repository.findConflicts(candidate) not empty:

raise BookingConflictError

repository.save(candidate)

return candidate


### 5.3 Checkout

function checkout(bookingId, observedItems):              // Traces to: R3

transaction:

booking = repository.getForUpdate(bookingId)

require status in {RESERVED, AT_RISK}

require booking.start <= now < booking.end        // [ASSUMED]

require every required type represented

require all required items present and usable

require no unresolved disruption blocks handover

require kit complete and usable

record checkout condition for every item

set booking CHECKED_OUT and persist all changes


### 5.4 Return and inspection

function returnAndInspect(bookingId, observations):       // Traces to: R3, R4

transaction:

lock booking and expected items

require booking status == CHECKED_OUT

for each expected item:

if item absent from observations: record MISSING

else record observed condition and inspect item

PASS -> AVAILABLE; DAMAGED -> DAMAGED; MISSING -> MISSING

persist inspection result and timestamp

record actual return time

complete source booking once return/inspection evidence is recorded

if any required item missing/damaged:

find earliest next non-cancelled booking that is at risk

persist disruption and pending warning

commit all domain changes


### 5.5 Warning

function findNextAtRiskBooking(affectedItems):            // Traces to: R4

for booking in future non-cancelled bookings ordered by start:

if booking is RESERVED or AT_RISK

and kit cannot be complete with affectedItems:

return booking

return NONE

function createDisruptionAndWarning(source, affected, items): // Traces to: R4

persist OPEN disruption(source, affected, items)

persist PENDING warning(affected, disruption)

enqueue persisted warning for notification adapter

Delivery runs outside the database transaction. Mark DELIVERED only after confirmation; record FAILED when delivery fails. Retry/dispatch is an adapter responsibility.


### 5.6 Recover

function recoverItem(disruptionId, itemId, result):       // Traces to: R5

transaction:

lock open disruption and item

require item belongs to disruption and state == MISSING

set item RETURNED_PENDING_INSPECTION

persist actual recovery and inspection result

PASS -> AVAILABLE; otherwise -> DAMAGED or MISSING as observed

recalculate readiness; resolve only if all required items restored


### 5.7 Replace

function replaceItem(disruptionId, oldItemId, replacement): // Traces to: R5

transaction:

lock open disruption and old item

require old item affected and MISSING or DAMAGED

require replacement type == old item type and ID unique

old item -> REPLACED

new item -> RETURNED_PENDING_INSPECTION

assign new item to kit; persist both

require inspection before readiness can be restored


### 5.8 Cancel

function cancelAtRiskBooking(bookingId, organizerId):    // Traces to: R5

transaction:

authorize organizer

lock booking

require status == AT_RISK and no successful checkout

set CANCELLED; release scheduled interval

retain warning and disruption history

Late recovery cannot be backdated. If the booking is no longer valid or the kit cannot safely be handed over, cancel the affected booking under the stated assumption.


## 6. Public Interfaces, Validation, and Errors



| Method | Signature (conceptual) | Validation / errors | Trace |

| --- | --- | --- | --- |

| Book | Booking book(ClubId, Instant start, Instant end) | Required fields; start < end; future start [ASSUMED]; no conflict. ValidationError, BookingConflictError. | R1, R2 |

| Checkout | HandoverRecord checkout(BookingId, Map<ItemId, ItemCondition>) | Eligible booking; full kit present and usable. NotFoundError, InvalidStateError, KitNotReadyError. | R3 |

| Return and inspect | ReturnOutcome returnAndInspect(BookingId, Map<ItemId, ItemCondition>) | Checked-out booking; reconcile every expected item. NotFoundError, InvalidStateError, ValidationError. | R3, R4 |

| Recover | void recoverItem(DisruptionId, ItemId, InspectionResult) | Open disruption; affected item recovered; inspection recorded. NotFoundError, InvalidStateError, ValidationError. | R5 |

| Replace | void replaceItem(DisruptionId, ItemId, KitItem replacement) | Same type, unique ID, inspection required. NotFoundError, InvalidStateError, ValidationError. | R5 |

| Cancel | void cancelAtRiskBooking(BookingId, OrganizerId) | Authorized organizer; at-risk; not checked out. NotFoundError, UnauthorizedError, InvalidStateError. | R5 |




### Storage interface (interface only)

interface BookingRepository {

// Traces to: R1, R2, R3, R4, R5

<T> T transaction(TransactionWork<T> work);

// Traces to: R1, R2

List<Booking> findConflicts(Booking candidate);

// Traces to: R1, R3, R4, R5

Booking getBookingForUpdate(BookingId id);

// Traces to: R3, R5

Kit loadKitForUpdate();

// Traces to: R3, R5

KitItem getItemForUpdate(ItemId id);

// Traces to: R3, R4, R5

void saveBooking(Booking booking);

// Traces to: R3, R5

void saveItem(KitItem item);

// Traces to: R3

void saveHandover(HandoverRecord record);

// Traces to: R3

void saveInspection(InspectionRecord record);

// Traces to: R4, R5

void saveDisruption(Disruption disruption);

// Traces to: R4

void saveWarning(Warning warning);

}


### Notification interface

interface NotificationGateway {

// Traces to: R4

DeliveryResult sendWarning(Warning warning, ClubId recipientClubId);

}

Separation: domain holds lifecycle and readiness rules; application service coordinates use cases and transactions; storage owns persistence and atomicity; notification adapter delivers warnings; injected Clock makes time checks deterministic.



| Error | Meaning |

| --- | --- |

| ValidationError | Missing or invalid input, including end <= start. |

| BookingConflictError | Another non-cancelled booking violates R1/R2. |

| KitNotReadyError | Required item is missing, damaged, or not inspected. |

| NotFoundError | Booking, item, or disruption does not exist. |

| InvalidStateError | Operation is illegal in current state. |

| UnauthorizedError | Caller is not an authorized organizer. |

| ConcurrentModificationError | Concurrent transaction invalidated operation; reload/retry. |

| NotificationDeliveryError | Warning delivery failed; warning remains recorded. |




## 7. Design Patterns Used and Why



| Pattern | Where | Why |

| --- | --- | --- |

| Repository | BookingRepository | Separates domain decisions from persistence and exposes a transaction boundary. |

| Adapter boundary | NotificationGateway | Lets delivery provider change without changing disruption logic; no extra Strategy class needed unless multiple policies exist. |

| State machine | BookingStatus and KitItemState | Makes lifecycle transitions explicit and rejects illegal transitions. |

| Transactional Unit of Work | Repository transaction | Makes conflict checks and multi-record state changes atomic; can use database-native transactions. |

| Clock abstraction | BookingService | Makes time-based validation deterministic in tests. |



Not used: Factory, Singleton, Observer, or event sourcing. They do not solve a named requirement here. A durable warning queue is a delivery mechanism, not a reason to introduce an event-sourcing architecture.


## 8. Concurrency: Two Clubs Booking the Same Slot

1. Club X and Club Y both submit 15:00–16:00.

1. Without atomicity, each could read an empty schedule and both insert.

1. Begin a transaction and serialize booking creation for the single kit, or use an equivalent database-enforced exclusion mechanism.

1. Read relevant non-cancelled bookings, apply the conflict formula, insert only if clear, then commit.

1. If serialization fails, reload and retry validation or return ConcurrentModificationError.

A normal unique constraint on (start, end) is insufficient because it cannot enforce arbitrary interval overlap or the 15-minute gap. The same concurrency discipline protects checkout, return/inspection, and resolution so an item cannot become AVAILABLE and MISSING concurrently.


## 9. Edge Cases



| Case | Expected behavior | Trace |

| --- | --- | --- |

| Exactly 15 minutes apart | Accept; boundary is inclusive. | R1, R2 |

| 14m 59s apart | Reject. | R1, R2 |

| Late return collides with next booking | Record actual return; inspect; warn if at risk; block unsafe handover. | R3, R4 |

| Multiple missing items | Record each; resolve only when all required items restored or booking cancelled. | R3–R5 |

| Cancel already-warned booking | Cancel and release interval; retain warning history. | R1, R5 |

| Resolve after next booking starts | Record actual times; never backdate handover; hand over only if still valid and verified, otherwise cancel. | R3–R5 |

| Checkout with missing tripod | Reject checkout. | R3 |

| Damaged replacement | Unavailable until inspection passes. | R3, R5 |

| Repeated warning | Reuse logical open disruption/warning; avoid duplicates. | R4 |

| Concurrent bookings | At most one conflicting booking commits. | R1, R2 |

| Concurrent resolution | Serialize; no contradictory item state. | R3, R5 |

| Cancel after successful checkout | Reject cancellation; return reconciliation remains mandatory. | R3, R5 |

| One item recovered, another missing | Booking remains at risk; handover blocked. | R3–R5 |

| Inspection result absent | Do not mark item usable or kit ready. | R3 |

| Notification failure | Persist failure/pending retry; never claim delivery. | R4 |

| Past-time booking | Reject under future-booking assumption. | R1 |

| Duplicate replacement ID | Reject; inventory unchanged. | R3, R5 |

| Return omits expected item | Record MISSING or reject incomplete return; never silently pass. | R3 |



Late-return limitation: R2 guarantees a 15-minute gap between scheduled bookings, not actual inspection time when returns are late. If the buffer is consumed, the kit remains unavailable until inspection finishes. R1–R5 do not specify how long the next club must wait before cancellation; that cutoff remains an open policy question.


## 10. Club A / Club B Walkthrough



| Time | Event | System behavior | Trace |

| --- | --- | --- | --- |

| 14:00 | Club A checkout | Record camera, mic, tripod and their checkout conditions; booking becomes CHECKED_OUT. | R3 |

| 15:00 | Club A returns camera and mic; tripod missing | Record outcomes for all three expected items; tripod becomes MISSING. | R3 |

| 15:00 | Inspection | Camera and mic pass; tripod remains missing. Complete source booking with return evidence; track loss separately. | R3 |

| 15:00 | Risk detection | Club B is the next non-cancelled booking needing the complete kit; create disruption and pending warning. | R4 |

| 15:15 | Club B's scheduled start | Checkout is blocked; a valid reservation does not override the incomplete-kit guard. | R3 |

| After 15:15 | Recovery path | Organizer records tripod recovery; inspect it; only PASS restores availability. | R5 |

| After 15:15 | Replacement path | Register same-type tripod with a new identity; inspect before making it available. | R5 |

| If not restored | Cancellation path | Organizer cancels at-risk booking; retain warning and disruption history. | R5 |



Outcome: The system never hands over a camera and mic while the required tripod is missing. Recovery or replacement is recorded truthfully, and cancellation remains available under the stated assumption.


## 11. Java 17 Code Skeleton

The following core skeleton shows the domain types and key guards. Persistence is an interface only. Application methods requiring multi-entity orchestration are explicitly marked as implementation-required rather than represented as complete.

enum BookingStatus { RESERVED, AT_RISK, CHECKED_OUT,

RETURNED_PENDING_INSPECTION, COMPLETED, CANCELLED } // Traces to: R1, R3, R4, R5

enum KitItemState { AVAILABLE, CHECKED_OUT, RETURNED_PENDING_INSPECTION,

DAMAGED, MISSING, REPLACED } // Traces to: R3, R5

enum ItemType { CAMERA, MIC, TRIPOD } // Traces to: R3

enum ItemCondition { USABLE, DAMAGED, MISSING } // Traces to: R3

enum InspectionResult { PASS, DAMAGED, MISSING } // Traces to: R3, R5

enum DisruptionStatus { OPEN, RESOLVED, CANCELLED } // Traces to: R4, R5

enum WarningStatus { PENDING, DELIVERED, FAILED } // Traces to: R4

record BookingId(UUID value) {} // Traces to: R1

record ClubId(UUID value) {} // Traces to: R1

record KitId(UUID value) {} // Traces to: R3

record ItemId(UUID value) {} // Traces to: R3

record DisruptionId(UUID value) {} // Traces to: R4, R5

record OrganizerId(UUID value) {} // Traces to: R5

final class Booking { // Traces to: R1, R2, R3, R4, R5

final BookingId id;

final ClubId clubId;

final Instant start, end;

BookingStatus status = BookingStatus.RESERVED;

final Set<ItemId> riskReasons = new HashSet<>();

Instant checkedOutAt, returnedAt;

Booking(BookingId id, ClubId clubId, Instant start, Instant end) {

if (start == null || end == null || !start.isBefore(end))

throw new ValidationError("Invalid booking interval");

this.id = Objects.requireNonNull(id);

this.clubId = Objects.requireNonNull(clubId);

this.start = start; this.end = end;

} // Traces to: R1, R2

void markCheckedOut(Instant at) { // Traces to: R3

if (status != BookingStatus.RESERVED && status != BookingStatus.AT_RISK)

throw new InvalidStateError("Invalid checkout state");

checkedOutAt = Objects.requireNonNull(at);

status = BookingStatus.CHECKED_OUT;

}

void markReturned(Instant at) { // Traces to: R3

if (status != BookingStatus.CHECKED_OUT)

throw new InvalidStateError("Not checked out");

returnedAt = Objects.requireNonNull(at);

status = BookingStatus.RETURNED_PENDING_INSPECTION;

}

void markAtRisk(Set<ItemId> items) { // Traces to: R4

if (status != BookingStatus.RESERVED)

throw new InvalidStateError("Cannot mark at risk");

riskReasons.addAll(items);

status = BookingStatus.AT_RISK;

}

void cancel() { // Traces to: R5

if (status != BookingStatus.RESERVED && status != BookingStatus.AT_RISK)

throw new InvalidStateError("Cannot cancel");

status = BookingStatus.CANCELLED;

}

}

final class KitItem { // Traces to: R3, R5

final ItemId id;

final ItemType type;

KitItemState state = KitItemState.AVAILABLE;

String conditionNote;

KitItem(ItemId id, ItemType type) {

this.id = Objects.requireNonNull(id);

this.type = Objects.requireNonNull(type);

} // Traces to: R3

void markCheckedOut() { // Traces to: R3

if (state != KitItemState.AVAILABLE)

throw new KitNotReadyError("Item unavailable");

state = KitItemState.CHECKED_OUT;

}

void recordInspection(InspectionResult result) { // Traces to: R3, R5

state = switch (Objects.requireNonNull(result)) {

case PASS -> KitItemState.AVAILABLE;

case DAMAGED -> KitItemState.DAMAGED;

case MISSING -> KitItemState.MISSING;

};

}

}

final class Kit { // Traces to: R3

final KitId id;

final Set<ItemType> requiredTypes =

Set.of(ItemType.CAMERA, ItemType.MIC, ItemType.TRIPOD);

final Map<ItemType, KitItem> items = new EnumMap<>(ItemType.class);

Kit(KitId id) { this.id = Objects.requireNonNull(id); } // Traces to: R3

boolean isReadyForHandover() { // Traces to: R3

for (ItemType type : requiredTypes) {

KitItem item = items.get(type);

if (item == null || item.state != KitItemState.AVAILABLE) return false;

}

return true;

}

}

record HandoverRecord(BookingId bookingId, Instant checkoutAt,

Map<ItemId, ItemCondition> checkoutItems, Instant returnAt,

Map<ItemId, ItemCondition> returnItems) { // Traces to: R3

static HandoverRecord checkout(BookingId id, Instant at,

Map<ItemId, ItemCondition> items) { // Traces to: R3

return new HandoverRecord(id, at, Map.copyOf(items), null, Map.of());

}

HandoverRecord recordReturn(Instant at, Map<ItemId, ItemCondition> items) {

return new HandoverRecord(bookingId, checkoutAt, checkoutItems,

at, Map.copyOf(items));

} // Traces to: R3

}

record InspectionRecord(BookingId bookingId, ItemId itemId,

Instant inspectedAt, InspectionResult result, String note) {} // Traces to: R3

final class Disruption { // Traces to: R4, R5

final DisruptionId id;

final BookingId sourceBookingId, affectedBookingId;

final Set<ItemId> affectedItemIds;

DisruptionStatus status = DisruptionStatus.OPEN;

Disruption(DisruptionId id, BookingId source, BookingId affected,

Set<ItemId> items) {

this.id = id; this.sourceBookingId = source;

this.affectedBookingId = affected; this.affectedItemIds = Set.copyOf(items);

} // Traces to: R4

void resolve() { // Traces to: R5

if (status != DisruptionStatus.OPEN)

throw new InvalidStateError("Not open");

status = DisruptionStatus.RESOLVED;

}

void cancel() { // Traces to: R5

if (status != DisruptionStatus.OPEN)

throw new InvalidStateError("Not open");

status = DisruptionStatus.CANCELLED;

}

}

record Warning(BookingId bookingId, DisruptionId disruptionId,

WarningStatus status) {} // Traces to: R4

final class BookingConflictPolicy { // Traces to: R1, R2

static final Duration GAP = Duration.ofMinutes(15);

boolean conflicts(Booking existing, Booking candidate) {

if (existing.status == BookingStatus.CANCELLED) return false;

return candidate.start.isBefore(existing.end.plus(GAP))

&& existing.start.isBefore(candidate.end.plus(GAP));

} // Traces to: R1, R2

}

interface BookingRepository { // Traces to: R1, R2, R3, R4, R5

<T> T transaction(TransactionWork<T> work); // Traces to: R1, R2, R3, R4, R5

List<Booking> findConflicts(Booking candidate); // Traces to: R1, R2

Booking getBookingForUpdate(BookingId id); // Traces to: R1, R3, R4, R5

Kit loadKitForUpdate(); // Traces to: R3, R5

KitItem getItemForUpdate(ItemId id); // Traces to: R3, R5

Map<ItemId, ItemCondition> getCheckoutItems(BookingId id); // Traces to: R3

void saveBooking(Booking booking); // Traces to: R1, R3, R4, R5

void saveItem(KitItem item); // Traces to: R3, R5

void saveHandover(HandoverRecord record); // Traces to: R3

void saveInspection(InspectionRecord record); // Traces to: R3

void saveDisruption(Disruption disruption); // Traces to: R4, R5

void saveWarning(Warning warning); // Traces to: R4

}

@FunctionalInterface

interface TransactionWork<T> { T execute(); } // Traces to: R1, R2, R3, R4, R5

interface NotificationGateway { // Traces to: R4

DeliveryResult sendWarning(Warning warning, ClubId recipient); // Traces to: R4

}

enum DeliveryResult { CONFIRMED, FAILED } // Traces to: R4

final class BookingService { // Traces to: R1, R2, R3, R4, R5

private final BookingRepository repository;

private final NotificationGateway notifications;

private final BookingConflictPolicy policy = new BookingConflictPolicy();

private final java.time.Clock clock;

BookingService(BookingRepository r, NotificationGateway n, java.time.Clock c) {

repository = Objects.requireNonNull(r);

notifications = Objects.requireNonNull(n);

clock = Objects.requireNonNull(c);

} // Traces to: R1, R2, R3, R4, R5

Booking book(ClubId clubId, Instant start, Instant end) { // Traces to: R1, R2

if (start == null || end == null || !start.isBefore(end))

throw new ValidationError("Invalid interval");

if (!start.isAfter(clock.instant()))

throw new ValidationError("Start must be in future");

return repository.transaction(() -> {

Booking b = new Booking(new BookingId(UUID.randomUUID()),

clubId, start, end);

if (!repository.findConflicts(b).isEmpty())

throw new BookingConflictError("Kit already reserved");

repository.saveBooking(b);

return b;

});

}

HandoverRecord checkout(BookingId id,

Map<ItemId, ItemCondition> observations) { // Traces to: R3

return repository.transaction(() -> {

Booking b = repository.getBookingForUpdate(id);

Instant now = clock.instant();

if (b.status != BookingStatus.RESERVED && b.status != BookingStatus.AT_RISK)

throw new InvalidStateError("Invalid checkout state");

if (now.isBefore(b.start) || !now.isBefore(b.end))

throw new InvalidStateError("Outside booking interval");

Kit kit = repository.loadKitForUpdate();

if (!kit.isReadyForHandover())

throw new KitNotReadyError("Kit incomplete");

if (observations == null || observations.size() != 3 ||

observations.values().stream().anyMatch(x -> x != ItemCondition.USABLE))

throw new KitNotReadyError("Invalid checkout observations");

for (KitItem item : kit.items.values()) item.markCheckedOut();

HandoverRecord h = HandoverRecord.checkout(id, now, observations);

b.markCheckedOut(now);

repository.saveHandover(h);

repository.saveBooking(b);

kit.items.values().forEach(repository::saveItem);

return h;

});

}

void returnAndInspect(BookingId id,

Map<ItemId, InspectionResult> observations) { // Traces to: R3, R4

throw new UnsupportedOperationException("Implementation required");

}

void recoverItem(DisruptionId id, ItemId itemId,

InspectionResult result) { // Traces to: R5

throw new UnsupportedOperationException("Implementation required");

}

void replaceItem(DisruptionId id, ItemId oldItemId,

KitItem replacement) { // Traces to: R5

throw new UnsupportedOperationException("Implementation required");

}

void cancelAtRiskBooking(BookingId id, OrganizerId organizerId) { // Traces to: R5

throw new UnsupportedOperationException("Implementation required");

}

}

class ValidationError extends RuntimeException {

ValidationError(String m) { super(m); } // Traces to: R1, R2, R3, R4, R5

}

class BookingConflictError extends RuntimeException {

BookingConflictError(String m) { super(m); } // Traces to: R1, R2

}

class KitNotReadyError extends RuntimeException {

KitNotReadyError(String m) { super(m); } // Traces to: R3, R5

}

class InvalidStateError extends RuntimeException {

InvalidStateError(String m) { super(m); } // Traces to: R3, R5

}

Skeleton limitations: the conflict formula is present, but atomicity depends on the repository. Return/inspection, recovery, replacement, cancellation, and the warning dispatcher need concrete implementation. Physical inspection requires a supplied observation. This is a design skeleton, not a production-ready application.


## 12. Test Table



| ID | Scenario / input | Expected result | Trace |

| --- | --- | --- | --- |

| T01 | Valid future interval, no conflicts | Created as RESERVED | R1 |

| T02 | start == end | ValidationError; no booking | R1 |

| T03 | end < start | ValidationError; no booking | R1 |

| T04 | Overlapping booking | Second rejected | R1 |

| T05 | A ends 15:00; B starts 15:15 | Both accepted | R1, R2 |

| T06 | A ends 15:00; B starts 15:14:59 | Second rejected | R1, R2 |

| T07 | Reverse ordering with 10-minute gap | Conflict rejected | R1, R2 |

| T08 | Two concurrent same-slot requests | At most one succeeds | R1, R2 |

| T09 | Cancel then reuse interval | New booking succeeds if otherwise clear | R1, R2, R5 |

| T10 | Checkout all three usable items | Full checkout record; CHECKED_OUT | R3 |

| T11 | Checkout with missing tripod | Rejected; not checked out | R3 |

| T12 | Checkout with damaged mic | Rejected | R3 |

| T13 | All items returned and pass | Records saved; source booking completed | R3 |

| T14 | Camera/mic returned, tripod omitted | Tripod recorded MISSING | R3 |

| T15 | Tripod inspection fails | Tripod DAMAGED; kit unavailable | R3 |

| T16 | Tripod and mic missing | Both items recorded in disruption | R3, R4 |

| T17 | Next booking at risk | Disruption and pending warning persisted | R4 |

| T18 | Notification confirms delivery | Warning DELIVERED | R4 |

| T19 | Notification fails | Failure/pending retry recorded; no false success | R4 |

| T20 | Same disruption reprocessed | No duplicate logical warning | R4 |

| T21 | Recover tripod and pass inspection | Tripod available; readiness recalculated | R5 |

| T22 | Recover tripod but inspection reports damage | Unavailable; disruption stays open | R5 |

| T23 | Replace tripod with microphone | Type mismatch rejected | R5 |

| T24 | New tripod not inspected | Replacement unavailable | R3, R5 |

| T25 | Valid same-type replacement passes | New item available; old history retained | R3, R5 |

| T26 | Cancel warned at-risk booking before checkout | Cancelled; warning history retained | R5 |

| T27 | Cancel after checkout | InvalidStateError; return still required | R3, R5 |

| T28 | Resolve after next booking starts | Actual times recorded; no backdated handover | R3, R5 |

| T29 | One item recovered, another missing | Still at risk; handover blocked | R3–R5 |

| T30 | Return at 15:10; next starts 15:15 | Inspect before handover; warn if at risk | R3, R4 |

| T31 | Return at 15:20 after 15:15 start | Actual times recorded; no false on-time claim | R3, R4 |

| T32 | Checkout before start | InvalidStateError | R3 |

| T33 | Checkout after end | InvalidStateError under assumption | R3 |

| T34 | Recover unrelated item | Rejected; inventory unchanged | R5 |

| T35 | Concurrent recovery same item | Serialized consistent final state | R3, R5 |

| T36 | Duplicate replacement ID | Rejected; inventory unchanged | R3, R5 |

| T37 | Return omits required observation | Missing recorded or incomplete return rejected | R3 |

| T38 | Past-time booking | Rejected under assumption | R1 |

| T39 | Long duration, no specified cap | Accepted if otherwise valid | R1 |

| T40 | Cancel completed booking | InvalidStateError; history unchanged | R5 |




## Verification



| Requirement | Class / method / tests | Status |

| --- | --- | --- |

| R1 | Booking, BookingService.book, BookingConflictPolicy.conflicts; T01–T04, T08–T09 | Design covered; concurrency implementation pending |

| R2 | BookingConflictPolicy and book; T05–T08 | Boundary rule specified and testable |

| R3 | Kit, KitItem, HandoverRecord, InspectionRecord; checkout and returnAndInspect; T10–T16, T21–T25, T27–T37 | Design covered; full service implementation pending |

| R4 | Disruption, Warning, NotificationGateway; disruption detection and warning delivery; T17–T20, T30–T31 | Partly implemented in skeleton; dispatcher pending |

| R5 | Disruption, KitItem, Booking; recoverItem, replaceItem, cancelAtRiskBooking; T21–T29, T34–T36, T40 | Design covered; service methods pending |



- The Club A / Club B tripod scenario follows the stated state machines and pseudocode: tripod is recorded missing, Club B is warned, and checkout remains blocked until a verified complete kit is available or the booking is cancelled.

- The inclusive 15-minute boundary is explicit: T05 accepts exactly 15 minutes; T06 rejects less than 15 minutes.

- No incomplete kit is handed over under the checkout guard.

- Multiple missing items, cancellation after warning, late return, concurrent bookings, and resolution after the next start are covered by stated guards and test expectations.

- Executable verification remains pending; the Java skeleton contains placeholders and the repository implementation is not supplied.

Partly met: R4 requires a concrete warning dispatcher, retry behavior, and delivery-state persistence. R5's recovery, replacement, and cancellation methods are pseudocode-level in the Java skeleton. R1/R2 concurrency correctness requires storage-level atomicity. R3 requires physical inspection observations. R1–R5 do not define a late-arrival cancellation cutoff; that remains an open policy question.

Final conclusion: The LLD specifies reservation spacing, item-level handover evidence, safe handover guards, warnings, and resolution paths. It is a consistent design specification, but the code is not yet a complete production implementation and the full test suite has not been executed.
