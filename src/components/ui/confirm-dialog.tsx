"use client";

import * as React from "react";
import { Button } from "./button";
import { Dialog, DialogContent, DialogTrigger } from "./dialog";
import { Field } from "./field";
import { Textarea } from "./input";

type Props = {
  trigger: React.ReactElement;
  title: string;
  description: string;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  /** Ask for a reason (e.g. cancellations); passed to onConfirm. */
  reasonLabel?: string;
  onConfirm: (reason: string) => Promise<boolean | void> | boolean | void;
};

/** Accessible confirmation dialog for destructive or irreversible actions. */
export function ConfirmDialog({ trigger, title, description, confirmLabel = "Confirm", tone = "danger", reasonLabel, onConfirm }: Props) {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string>();

  async function confirm() {
    if (reasonLabel && !reason.trim()) {
      setError("Please provide a reason");
      return;
    }
    setPending(true);
    try {
      const keepOpen = (await onConfirm(reason.trim())) === false;
      if (!keepOpen) {
        setOpen(false);
        setReason("");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent title={title} description={description}>
        {reasonLabel && (
          <Field label={reasonLabel} htmlFor="confirm-reason" error={error} required className="mb-4">
            <Textarea value={reason} onChange={(e) => (setReason(e.target.value), setError(undefined))} maxLength={300} rows={3} />
          </Field>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Go back
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} onClick={confirm} loading={pending}>
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
