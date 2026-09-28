import type { EventStatus, RegistrationStatus } from "@prisma/client";

/**
 * Event lifecycle state machine.
 *
 *  DRAFT ──submit──▶ PENDING_APPROVAL ──approve──▶ PUBLISHED ──open──▶ REGISTRATION_OPEN
 *    │ ▲                    │ reject                  │                    │ close
 *    │ └────────────────────┘                         ▼                    ▼
 *    └──publish (no approval needed)──▶ PUBLISHED   ONGOING ◀──start── REGISTRATION_CLOSED
 *                                                     │ complete
 *                                                     ▼
 *                                   COMPLETED ──archive──▶ ARCHIVED ◀── CANCELLED
 */
export const EVENT_ACTIONS = {
  submit: { from: ["DRAFT"], to: "PENDING_APPROVAL", label: "Submit for approval" },
  approve: { from: ["PENDING_APPROVAL"], to: "PUBLISHED", label: "Approve & publish" },
  reject: { from: ["PENDING_APPROVAL"], to: "DRAFT", label: "Send back to draft" },
  publish: { from: ["DRAFT"], to: "PUBLISHED", label: "Publish" },
  unpublish: { from: ["PUBLISHED", "REGISTRATION_OPEN", "REGISTRATION_CLOSED"], to: "DRAFT", label: "Unpublish" },
  openRegistration: { from: ["PUBLISHED", "REGISTRATION_CLOSED"], to: "REGISTRATION_OPEN", label: "Open registration" },
  closeRegistration: { from: ["PUBLISHED", "REGISTRATION_OPEN"], to: "REGISTRATION_CLOSED", label: "Close registration" },
  start: { from: ["PUBLISHED", "REGISTRATION_OPEN", "REGISTRATION_CLOSED"], to: "ONGOING", label: "Mark as ongoing" },
  complete: { from: ["ONGOING", "REGISTRATION_CLOSED"], to: "COMPLETED", label: "Mark as completed" },
  cancel: {
    from: ["PENDING_APPROVAL", "PUBLISHED", "REGISTRATION_OPEN", "REGISTRATION_CLOSED", "ONGOING"],
    to: "CANCELLED",
    label: "Cancel event",
  },
  archive: { from: ["DRAFT", "COMPLETED", "CANCELLED"], to: "ARCHIVED", label: "Archive" },
} as const satisfies Record<string, { from: readonly EventStatus[]; to: EventStatus; label: string }>;

export type EventAction = keyof typeof EVENT_ACTIONS;

export function isEventAction(v: string): v is EventAction {
  return Object.prototype.hasOwnProperty.call(EVENT_ACTIONS, v);
}

export function canApplyAction(status: EventStatus, action: EventAction): boolean {
  return (EVENT_ACTIONS[action].from as readonly EventStatus[]).includes(status);
}

/** All statuses reachable from `from` in one step. */
export function allowedTransitions(from: EventStatus): EventStatus[] {
  return [...new Set(Object.values(EVENT_ACTIONS).filter((a) => (a.from as readonly EventStatus[]).includes(from)).map((a) => a.to))];
}

export function canTransition(from: EventStatus, to: EventStatus): boolean {
  return allowedTransitions(from).includes(to);
}

/** Statuses in which an event is visible on the public site. */
export const PUBLIC_STATUSES: EventStatus[] = ["PUBLISHED", "REGISTRATION_OPEN", "REGISTRATION_CLOSED", "ONGOING", "COMPLETED", "CANCELLED"];

/** Statuses in which the event content may still be edited. */
export const EDITABLE_STATUSES: EventStatus[] = ["DRAFT", "PENDING_APPROVAL", "PUBLISHED", "REGISTRATION_OPEN", "REGISTRATION_CLOSED"];

type RegWindow = {
  status: EventStatus;
  registrationOpensAt: Date | null;
  registrationDeadline: Date;
  startsAt: Date;
};

/** Time is authoritative: a stale stored status can never extend the registration window. */
export function isRegistrationOpen(e: RegWindow, now = new Date()): boolean {
  return (
    (e.status === "PUBLISHED" || e.status === "REGISTRATION_OPEN") &&
    (!e.registrationOpensAt || e.registrationOpensAt <= now) &&
    now < e.registrationDeadline &&
    now < e.startsAt
  );
}

export type RegistrationCta =
  | { state: "open"; label: "Register Now" | "Register & Pay" }
  | { state: "registered"; label: "View Registration" }
  | { state: "pending_payment"; label: "Complete Payment" }
  | { state: "full"; label: "Event Full" }
  | { state: "not_open"; label: "Registration Opens Soon" }
  | { state: "closed"; label: "Registration Closed" }
  | { state: "cancelled"; label: "Event Cancelled" }
  | { state: "ended"; label: "Event Ended" };

export function registrationCta(
  e: RegWindow & { feeAmount: number; capacity: number; endsAt: Date },
  seatsTaken: number,
  myRegistration: { status: RegistrationStatus; holdExpiresAt: Date | null } | null,
  now = new Date(),
): RegistrationCta {
  if (e.status === "CANCELLED") return { state: "cancelled", label: "Event Cancelled" };
  if (myRegistration?.status === "CONFIRMED") return { state: "registered", label: "View Registration" };
  if (myRegistration?.status === "PENDING_PAYMENT" && myRegistration.holdExpiresAt && myRegistration.holdExpiresAt > now && isRegistrationOpen(e, now)) {
    return { state: "pending_payment", label: "Complete Payment" };
  }
  if (e.status === "COMPLETED" || e.status === "ARCHIVED" || now >= e.endsAt) return { state: "ended", label: "Event Ended" };
  if ((e.status === "PUBLISHED" || e.status === "REGISTRATION_OPEN") && e.registrationOpensAt && e.registrationOpensAt > now) {
    return { state: "not_open", label: "Registration Opens Soon" };
  }
  if (!isRegistrationOpen(e, now)) return { state: "closed", label: "Registration Closed" };
  if (seatsTaken >= e.capacity) return { state: "full", label: "Event Full" };
  return { state: "open", label: e.feeAmount > 0 ? "Register & Pay" : "Register Now" };
}

/** Automatic, time-driven status for published events (used by the status cron). */
export function timeDrivenStatus(e: RegWindow & { endsAt: Date }, now = new Date()): EventStatus {
  const s = e.status;
  if (!["PUBLISHED", "REGISTRATION_OPEN", "REGISTRATION_CLOSED", "ONGOING"].includes(s)) return s;
  if (now >= e.endsAt) return "COMPLETED";
  if (now >= e.startsAt) return "ONGOING";
  if (s === "ONGOING") return s;
  if (now >= e.registrationDeadline) return "REGISTRATION_CLOSED";
  if (s === "PUBLISHED" && (!e.registrationOpensAt || e.registrationOpensAt <= now)) return "REGISTRATION_OPEN";
  return s;
}
