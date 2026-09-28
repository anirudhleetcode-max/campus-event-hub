"use client";

import { useRouter } from "next/navigation";
import { XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cancelMyRegistrationAction } from "@/app/actions/student";

export function CancelRegistrationButton({ registrationId, eventTitle, paid }: { registrationId: string; eventTitle: string; paid: boolean }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button variant="outline" className="text-danger">
          <XCircle aria-hidden />
          Cancel registration
        </Button>
      }
      title="Cancel this registration?"
      description={`You'll lose your seat for "${eventTitle}".${paid ? " A refund request will be sent to the organizer as per the event's refund policy." : ""} This can't be undone.`}
      confirmLabel="Yes, cancel registration"
      onConfirm={async () => {
        const res = await cancelMyRegistrationAction(registrationId);
        if (!res.ok) {
          toast.error(res.error);
          return false;
        }
        toast.success("Registration cancelled", {
          description: res.data.refundRequested ? "Your refund request has been sent to the organizer." : undefined,
        });
        router.refresh();
      }}
    />
  );
}
