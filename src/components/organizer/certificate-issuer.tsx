"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { CertificateType } from "@prisma/client";
import { Award, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Checkbox, Input, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { issueCertificatesAction, revokeCertificateAction } from "@/app/actions/organizer";
import { CERTIFICATE_TYPE } from "@/lib/labels";

export type CertificateCandidate = { userId: string; name: string; detail: string; checkedIn: boolean; staff: boolean };

const PICK_TYPES: CertificateType[] = ["WINNER", "RUNNER_UP", "SPEAKER"];

const ELIGIBILITY: Record<CertificateType, string> = {
  PARTICIPATION: "Every checked-in participant who doesn't already have one.",
  WINNER: "Choose winners from checked-in participants.",
  RUNNER_UP: "Choose runners-up from checked-in participants.",
  VOLUNTEER: "Every volunteer assigned to this event.",
  ORGANIZER: "The organizer, co-organizers and faculty coordinators.",
  SPEAKER: "Choose speakers from event staff or registered participants.",
};

/** Issue certificates of a given type, picking recipients where the type needs it. */
export function CertificateIssuer({ eventId, candidates, blockedReason }: { eventId: string; candidates: CertificateCandidate[]; blockedReason?: string }) {
  const router = useRouter();
  const [type, setType] = React.useState<CertificateType>("PARTICIPATION");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [query, setQuery] = React.useState("");
  const [position, setPosition] = React.useState("");
  const [error, setError] = React.useState<string>();
  const [pending, setPending] = React.useState(false);
  const id = React.useId();
  const picking = PICK_TYPES.includes(type);

  const pool = React.useMemo(
    () => candidates.filter((c) => (type === "SPEAKER" ? true : c.checkedIn && !c.staff)),
    [candidates, type],
  );
  const q = query.trim().toLowerCase();
  const visible = q ? pool.filter((c) => c.name.toLowerCase().includes(q) || c.detail.toLowerCase().includes(q)) : pool;

  function toggle(userId: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(userId);
      else next.delete(userId);
      return next;
    });
    setError(undefined);
  }

  async function issue() {
    if (pending) return;
    if (picking && selected.size === 0) {
      setError("Select at least one recipient");
      return;
    }
    setPending(true);
    try {
      const res = await issueCertificatesAction({
        eventId,
        type,
        userIds: picking ? [...selected] : undefined,
        position: (type === "WINNER" || type === "RUNNER_UP") && position.trim() ? position.trim() : undefined,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const { issued, skippedExisting, ineligible } = res.data;
      const extras = [skippedExisting ? `${skippedExisting} already had one` : "", ineligible ? `${ineligible} not eligible` : ""].filter(Boolean).join(" · ");
      if (issued > 0) toast.success(`Issued ${issued} ${CERTIFICATE_TYPE[type].toLowerCase()} certificate${issued === 1 ? "" : "s"}.`, { description: extras || undefined });
      else toast.info("No new certificates were issued.", { description: extras || undefined });
      setSelected(new Set());
      setPosition("");
      router.refresh();
    } catch {
      toast.error("Something went wrong while issuing certificates. Please try again.");
    } finally {
      setPending(false);
    }
  }

  if (blockedReason) return <Alert tone="info">{blockedReason}</Alert>;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Certificate type" htmlFor={`${id}-type`} hint={ELIGIBILITY[type]}>
          <Select
            value={type}
            onChange={(e) => {
              setType(e.target.value as CertificateType);
              setSelected(new Set());
              setError(undefined);
            }}
          >
            {Object.entries(CERTIFICATE_TYPE).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        {(type === "WINNER" || type === "RUNNER_UP") && (
          <Field label="Position (optional)" htmlFor={`${id}-position`} hint={type === "WINNER" ? "Defaults to “First Place”." : "Defaults to “Runner-up”."}>
            <Input value={position} onChange={(e) => setPosition(e.target.value)} maxLength={60} placeholder={type === "WINNER" ? "First Place" : "Second Place"} />
          </Field>
        )}
      </div>

      {picking && (
        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-medium">
            Recipients <span className="font-normal text-muted-foreground">({selected.size} selected)</span>
          </legend>
          {pool.length === 0 ? (
            <Alert tone="info">{type === "SPEAKER" ? "There are no staff or confirmed participants yet." : "No participants have checked in yet."}</Alert>
          ) : (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people…" aria-label="Search recipients" className="pl-9" />
              </div>
              <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                {visible.map((c) => (
                  <li key={c.userId}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-surface-2/60">
                      <Checkbox checked={selected.has(c.userId)} onChange={(e) => toggle(c.userId, e.target.checked)} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{c.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{c.detail}</span>
                      </span>
                    </label>
                  </li>
                ))}
                {visible.length === 0 && <li className="px-3 py-4 text-center text-sm text-muted-foreground">No one matches “{query}”.</li>}
              </ul>
            </>
          )}
          {error && (
            <p role="alert" className="text-xs font-medium text-danger">
              {error}
            </p>
          )}
        </fieldset>
      )}

      <div className="flex justify-end">
        <Button onClick={issue} loading={pending}>
          <Award /> {picking ? `Issue to ${selected.size || "selected"}` : `Issue ${CERTIFICATE_TYPE[type].toLowerCase()} certificates`}
        </Button>
      </div>
    </div>
  );
}

/** Revoke an issued certificate (confirm + reason). */
export function RevokeCertificateButton({ eventId, certificateId, name }: { eventId: string; certificateId: string; name: string }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="sm" className="text-danger">
          Revoke
        </Button>
      }
      title={`Revoke ${name}'s certificate?`}
      description="The certificate will immediately show as revoked on the verification page and can no longer be downloaded."
      confirmLabel="Revoke"
      reasonLabel="Reason"
      onConfirm={async (reason) => {
        try {
          const res = await revokeCertificateAction(eventId, certificateId, reason);
          if (!res.ok) {
            toast.error(res.error);
            return false;
          }
          toast.success(res.message ?? "Certificate revoked.");
          router.refresh();
        } catch {
          toast.error("Something went wrong. Please try again.");
          return false;
        }
      }}
    />
  );
}
