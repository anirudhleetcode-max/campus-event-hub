"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { PaymentStatus, RegistrationStatus } from "@prisma/client";
import { Ban, Eye, IndianRupee, MoreHorizontal, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { DescriptionList } from "@/components/ui/misc";
import { PaymentStatusBadge, RegistrationStatusBadge } from "@/components/ui/status-badges";
import { cancelRegistrationAction, manualCheckInAction } from "@/app/actions/organizer";
import { formatDateTime } from "@/lib/utils";
import { ActionDialog } from "./action-dialog";
import { formatAmount } from "./format";

export type RegistrationDetails = {
  id: string;
  code: string;
  participantName: string;
  participantEmail: string;
  participantPhone: string | null;
  collegeName: string | null;
  departmentName: string | null;
  year: number | null;
  studentId: string | null;
  status: RegistrationStatus;
  amount: number;
  createdAt: Date;
  confirmedAt: Date | null;
  cancelReason: string | null;
  checkInAt: Date | null;
  checkInMethod: string | null;
  paymentStatus: PaymentStatus | null;
  answers: { label: string; value: string }[];
};

/** Per-registration actions: details, manual check-in, cancellation, refund shortcut. */
export function RegistrationActions({ eventId, reg, canManage, canScan }: { eventId: string; reg: RegistrationDetails; canManage: boolean; canScan: boolean }) {
  const router = useRouter();
  const [dialog, setDialog] = React.useState<"details" | "cancel" | "checkin" | null>(null);
  const active = reg.status === "CONFIRMED" || reg.status === "PENDING_PAYMENT";
  const canCheckIn = canScan && reg.status === "CONFIRMED" && !reg.checkInAt;
  const canRefund = canManage && reg.paymentStatus === "CAPTURED";

  async function cancel(reason: string) {
    try {
      const res = await cancelRegistrationAction(eventId, reg.id, reason);
      if (!res.ok) {
        toast.error(res.error);
        return false;
      }
      toast.success(res.message ?? "Registration cancelled.");
      router.refresh();
    } catch {
      toast.error("Something went wrong. Please try again.");
      return false;
    }
  }

  async function checkIn() {
    try {
      const res = await manualCheckInAction(eventId, reg.id);
      if (!res.ok) {
        toast.error(res.error);
        return false;
      }
      toast.success(`${res.data.name} is checked in.`);
      router.refresh();
    } catch {
      toast.error("Something went wrong. Please try again.");
      return false;
    }
  }

  return (
    <>
      <Dropdown modal={false}>
        <DropdownTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Actions for ${reg.participantName}`}>
            <MoreHorizontal />
          </Button>
        </DropdownTrigger>
        <DropdownContent>
          <DropdownItem onSelect={() => setDialog("details")}>
            <Eye /> View details
          </DropdownItem>
          {canCheckIn && (
            <DropdownItem onSelect={() => setDialog("checkin")}>
              <UserCheck /> Mark as attended
            </DropdownItem>
          )}
          {canRefund && (
            <DropdownItem asChild>
              <Link href={`/organizer/events/${eventId}/payments?q=${encodeURIComponent(reg.code)}`}>
                <IndianRupee /> Refund payment
              </Link>
            </DropdownItem>
          )}
          {canManage && active && (
            <>
              <DropdownSeparator />
              <DropdownItem destructive onSelect={() => setDialog("cancel")}>
                <Ban /> Cancel registration
              </DropdownItem>
            </>
          )}
        </DropdownContent>
      </Dropdown>

      <Dialog open={dialog === "details"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent title={reg.participantName} description={`Registration ${reg.code}`} wide>
          <div className="mb-4 flex flex-wrap gap-2">
            <RegistrationStatusBadge status={reg.status} />
            {reg.paymentStatus && <PaymentStatusBadge status={reg.paymentStatus} />}
          </div>
          <DescriptionList
            items={[
              { label: "Email", value: reg.participantEmail },
              { label: "Phone", value: reg.participantPhone ?? "—" },
              { label: "College", value: reg.collegeName ?? "—" },
              { label: "Department", value: reg.departmentName ?? "—" },
              { label: "Year of study", value: reg.year ?? "—" },
              { label: "Student ID", value: reg.studentId ?? "—" },
              { label: "Amount", value: reg.amount ? formatAmount(reg.amount) : "Free" },
              { label: "Registered", value: formatDateTime(reg.createdAt) },
              { label: "Confirmed", value: reg.confirmedAt ? formatDateTime(reg.confirmedAt) : "—" },
              { label: "Checked in", value: reg.checkInAt ? `${formatDateTime(reg.checkInAt)}${reg.checkInMethod === "MANUAL" ? " (manual)" : ""}` : "Not yet" },
              ...(reg.cancelReason ? [{ label: "Cancellation reason", value: reg.cancelReason }] : []),
            ]}
          />
          {reg.answers.length > 0 && (
            <div className="mt-5">
              <h3 className="mb-2 text-sm font-semibold">Answers</h3>
              <dl className="space-y-3 rounded-lg bg-surface-2/60 p-4 text-sm">
                {reg.answers.map((a) => (
                  <div key={a.label}>
                    <dt className="text-muted-foreground">{a.label}</dt>
                    <dd className="mt-0.5 font-medium whitespace-pre-line break-words">{a.value === "true" ? "Yes" : a.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ActionDialog
        open={dialog === "checkin"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Check in ${reg.participantName}?`}
        description="Use this when the participant can't show their QR pass. The check-in is recorded as manual."
        confirmLabel="Mark as attended"
        onConfirm={checkIn}
      />
      <ActionDialog
        open={dialog === "cancel"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Cancel ${reg.participantName}'s registration?`}
        description="The participant will be notified. Paid registrations are added to the refund queue."
        confirmLabel="Cancel registration"
        reasonLabel="Reason (shared with the participant)"
        danger
        onConfirm={cancel}
      />
    </>
  );
}
