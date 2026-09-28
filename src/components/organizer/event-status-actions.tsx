"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { EventStatus } from "@prisma/client";
import { ChevronDown, Copy, Eye, MoreHorizontal, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { duplicateEventAction, transitionEventAction } from "@/app/actions/organizer";
import { EVENT_STATUS } from "@/lib/labels";
import type { EventAction } from "@/lib/event-status";
import { ActionDialog } from "./action-dialog";
import { availableEventActions, type EventActionSpec } from "./event-actions";

type Common = {
  eventId: string;
  status: EventStatus;
  canManage: boolean;
  canApprove: boolean;
  canCreate: boolean;
  requireApproval: boolean;
};

function useEventActions({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [dialog, setDialog] = React.useState<EventActionSpec | null>(null);

  const run = React.useCallback(
    async (spec: EventActionSpec, reason?: string): Promise<boolean> => {
      setBusy(true);
      try {
        const res = await transitionEventAction(eventId, spec.action, reason);
        if (!res.ok) {
          toast.error(res.error);
          return false;
        }
        toast.success(`Done — the event is now ${EVENT_STATUS[res.data.status].label.toLowerCase()}.`);
        router.refresh();
        return true;
      } catch {
        toast.error("Something went wrong. Please try again.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [eventId, router],
  );

  const duplicate = React.useCallback(async () => {
    setBusy(true);
    try {
      const res = await duplicateEventAction(eventId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(res.message ?? "Event duplicated.");
      router.push(`/organizer/events/${res.data.id}/edit`);
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }, [eventId, router]);

  const trigger = React.useCallback(
    (spec: EventActionSpec) => {
      if (spec.confirm) setDialog(spec);
      else void run(spec);
    },
    [run],
  );

  const dialogEl = dialog?.confirm ? (
    <ActionDialog
      open
      onOpenChange={(o) => !o && setDialog(null)}
      title={dialog.confirm.title}
      description={dialog.confirm.description}
      confirmLabel={dialog.confirm.confirmLabel}
      reasonLabel={dialog.confirm.reasonLabel}
      danger={dialog.danger || dialog.action === "archive" || dialog.action === "unpublish"}
      onConfirm={(reason) => run(dialog, reason || undefined)}
    />
  ) : null;

  return { busy, trigger, duplicate, dialogEl };
}

const ROW_ACTIONS: EventAction[] = ["submit", "publish", "approve", "reject", "unpublish", "cancel", "archive"];

/** Per-row actions menu for the event management table. */
export function EventRowActions({ editable, title, ...props }: Common & { editable: boolean; title: string }) {
  const { busy, trigger, duplicate, dialogEl } = useEventActions(props);
  const specs = availableEventActions(props.status, props).filter((s) => ROW_ACTIONS.includes(s.action));
  const safe = specs.filter((s) => !s.danger && s.action !== "archive" && s.action !== "unpublish");
  const risky = specs.filter((s) => !safe.includes(s));
  return (
    <>
      <Dropdown modal={false}>
        <DropdownTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Actions for ${title}`} loading={busy}>
            {!busy && <MoreHorizontal />}
          </Button>
        </DropdownTrigger>
        <DropdownContent>
          <DropdownItem asChild>
            <Link href={`/organizer/events/${props.eventId}`}>
              <Eye /> View
            </Link>
          </DropdownItem>
          {props.canManage && editable && (
            <DropdownItem asChild>
              <Link href={`/organizer/events/${props.eventId}/edit`}>
                <Pencil /> Edit
              </Link>
            </DropdownItem>
          )}
          {safe.map((s) => (
            <DropdownItem key={s.action} onSelect={() => trigger(s)}>
              {s.label}
            </DropdownItem>
          ))}
          {props.canManage && props.canCreate && (
            <DropdownItem onSelect={() => void duplicate()}>
              <Copy /> Duplicate
            </DropdownItem>
          )}
          {risky.length > 0 && <DropdownSeparator />}
          {risky.map((s) => (
            <DropdownItem key={s.action} destructive={s.danger} onSelect={() => trigger(s)}>
              {s.label}
            </DropdownItem>
          ))}
        </DropdownContent>
      </Dropdown>
      {dialogEl}
    </>
  );
}

/** Lifecycle buttons in the event header: the most relevant action up front, the rest in a menu. */
export function EventHeaderActions(props: Common) {
  const { busy, trigger, duplicate, dialogEl } = useEventActions(props);
  const specs = availableEventActions(props.status, props);
  const primary = specs.find((s) => !s.danger && !s.confirm) ?? null;
  const rest = specs.filter((s) => s !== primary);
  const showMenu = rest.length > 0 || (props.canManage && props.canCreate);
  if (!primary && !showMenu) return null;
  return (
    <>
      {primary && (
        <Button size="sm" onClick={() => trigger(primary)} loading={busy}>
          {primary.label}
        </Button>
      )}
      {showMenu && (
        <Dropdown modal={false}>
          <DropdownTrigger asChild>
            <Button size="sm" variant="outline" disabled={busy}>
              More actions <ChevronDown />
            </Button>
          </DropdownTrigger>
          <DropdownContent>
            {rest
              .filter((s) => !s.danger && s.action !== "archive")
              .map((s) => (
                <DropdownItem key={s.action} onSelect={() => trigger(s)}>
                  {s.label}
                </DropdownItem>
              ))}
            {props.canManage && props.canCreate && (
              <DropdownItem onSelect={() => void duplicate()}>
                <Copy /> Duplicate
              </DropdownItem>
            )}
            {rest.some((s) => s.danger || s.action === "archive") && <DropdownSeparator />}
            {rest
              .filter((s) => s.danger || s.action === "archive")
              .map((s) => (
                <DropdownItem key={s.action} destructive={s.danger} onSelect={() => trigger(s)}>
                  {s.label}
                </DropdownItem>
              ))}
          </DropdownContent>
        </Dropdown>
      )}
      {dialogEl}
    </>
  );
}
