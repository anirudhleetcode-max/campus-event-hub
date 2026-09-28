"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  reasonLabel?: string;
  /** Return false to keep the dialog open (e.g. on error). */
  onConfirm: (reason: string) => Promise<boolean | void>;
};

/**
 * Controlled confirmation dialog — used where the trigger lives inside a
 * dropdown menu (which unmounts on select, so it can't own the dialog).
 */
export function ActionDialog({ open, onOpenChange, title, description, confirmLabel, danger, reasonLabel, onConfirm }: Props) {
  const [pending, setPending] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string>();
  const id = React.useId();

  async function confirm() {
    if (reasonLabel && !reason.trim()) {
      setError("Please provide a reason");
      return;
    }
    setPending(true);
    try {
      const keepOpen = (await onConfirm(reason.trim())) === false;
      if (!keepOpen) {
        setReason("");
        onOpenChange(false);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (pending) return;
        if (!o) setError(undefined);
        onOpenChange(o);
      }}
    >
      <DialogContent title={title} description={description}>
        {reasonLabel && (
          <Field label={reasonLabel} htmlFor={`${id}-reason`} error={error} required className="mb-4">
            <Textarea value={reason} onChange={(e) => (setReason(e.target.value), setError(undefined))} maxLength={300} rows={3} />
          </Field>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Go back
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={confirm} loading={pending}>
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
