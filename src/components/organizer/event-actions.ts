import type { EventStatus } from "@prisma/client";
import { EVENT_ACTIONS, canApplyAction, type EventAction } from "@/lib/event-status";

export type EventActionSpec = {
  action: EventAction;
  label: string;
  danger?: boolean;
  confirm?: { title: string; description: string; confirmLabel: string; reasonLabel?: string };
};

const CONFIRM: Partial<Record<EventAction, EventActionSpec["confirm"]>> = {
  reject: {
    title: "Send this event back to draft?",
    description: "The organizer will be notified with your note so they can make changes and resubmit.",
    confirmLabel: "Send back",
    reasonLabel: "Note for the organizer",
  },
  unpublish: {
    title: "Unpublish this event?",
    description: "The event will be hidden from the public site and return to draft.",
    confirmLabel: "Unpublish",
  },
  complete: {
    title: "Mark this event as completed?",
    description: "Registration closes and participants are invited to share feedback.",
    confirmLabel: "Mark completed",
  },
  cancel: {
    title: "Cancel this event?",
    description:
      "All active registrations will be cancelled, participants will be notified, and paid registrations will be queued for refunds. This can't be undone.",
    confirmLabel: "Cancel event",
    reasonLabel: "Reason (shared with participants)",
  },
  archive: {
    title: "Archive this event?",
    description: "Archived events are read-only and hidden from active lists. This can't be undone.",
    confirmLabel: "Archive",
  },
};

const ORDER: EventAction[] = ["submit", "publish", "approve", "reject", "openRegistration", "closeRegistration", "start", "complete", "unpublish", "cancel", "archive"];

/**
 * Lifecycle actions the viewer may apply to an event in its current status.
 * Mirrors the server rules in transitionEvent (which remain authoritative).
 */
export function availableEventActions(
  status: EventStatus,
  opts: { canManage: boolean; canApprove: boolean; requireApproval: boolean },
): EventActionSpec[] {
  if (!opts.canManage) return [];
  return ORDER.filter((action) => {
    if (!canApplyAction(status, action)) return false;
    if (action === "approve" || action === "reject") return opts.canApprove;
    if (action === "publish") return !opts.requireApproval || opts.canApprove;
    if (action === "submit") return opts.requireApproval && !opts.canApprove;
    return true;
  }).map((action) => ({
    action,
    label: EVENT_ACTIONS[action].label,
    danger: action === "cancel" || action === "reject",
    confirm: CONFIRM[action],
  }));
}
