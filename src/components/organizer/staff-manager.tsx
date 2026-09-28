"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, UserPlus, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Checkbox, Input, Label, Select } from "@/components/ui/input";
import { Avatar } from "@/components/ui/misc";
import { addStaffAction, removeStaffAction } from "@/app/actions/organizer";
import { emailSchema } from "@/lib/validators";

export type StaffMember = { userId: string; name: string; email: string; role: "VOLUNTEER" | "CO_ORGANIZER" | "FACULTY_COORDINATOR"; canScan: boolean };

const ROLE_LABEL: Record<StaffMember["role"], string> = {
  VOLUNTEER: "Volunteer",
  CO_ORGANIZER: "Co-organizer",
  FACULTY_COORDINATOR: "Faculty coordinator",
};

/** Lists event staff and (for managers) lets them add or remove people by email. */
export function StaffManager({ eventId, staff, canManage }: { eventId: string; staff: StaffMember[]; canManage: boolean }) {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<StaffMember["role"]>("VOLUNTEER");
  const [canScan, setCanScan] = React.useState(true);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);
  const id = React.useId();

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setErrors({ email: parsed.error.issues[0]?.message ?? "Enter a valid email address" });
      return;
    }
    setPending(true);
    setErrors({});
    try {
      const res = await addStaffAction(eventId, { email: parsed.data, role, canScan });
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.error);
        return;
      }
      toast.success(`${res.data.name} was added as ${ROLE_LABEL[role].toLowerCase()}.`);
      setEmail("");
      router.refresh();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function remove(userId: string) {
    try {
      const res = await removeStaffAction(eventId, userId);
      if (!res.ok) {
        toast.error(res.error);
        return false;
      }
      toast.success(res.message ?? "Removed.");
      router.refresh();
    } catch {
      toast.error("Something went wrong. Please try again.");
      return false;
    }
  }

  return (
    <div className="space-y-5">
      {staff.length === 0 ? (
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          <Users className="size-5 shrink-0" aria-hidden />
          No volunteers, co-organizers or faculty coordinators yet.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {staff.map((s) => (
            <li key={s.userId} className="flex items-center gap-3 py-2.5 first:pt-0">
              <Avatar name={s.name} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{s.name}</p>
                <p className="truncate text-xs text-muted-foreground">{s.email}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center">
                <Badge tone={s.role === "CO_ORGANIZER" ? "primary" : s.role === "FACULTY_COORDINATOR" ? "info" : "neutral"}>{ROLE_LABEL[s.role]}</Badge>
                {s.canScan && <Badge tone="success">Can scan</Badge>}
              </div>
              {canManage && (
                <ConfirmDialog
                  trigger={
                    <Button variant="ghost" size="icon" aria-label={`Remove ${s.name}`}>
                      <Trash2 />
                    </Button>
                  }
                  title={`Remove ${s.name}?`}
                  description="They will immediately lose access to this event's staff tools."
                  confirmLabel="Remove"
                  onConfirm={() => remove(s.userId)}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <form onSubmit={add} className="space-y-3 rounded-lg bg-surface-2/60 p-4" noValidate>
          <p className="text-sm font-medium">Add staff member</p>
          <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
            <Field label="Email" htmlFor={`${id}-email`} error={errors.email} hint="They need an active account in this college.">
              <Input type="email" value={email} onChange={(e) => (setEmail(e.target.value), setErrors({}))} placeholder="name@college.edu" autoComplete="off" maxLength={254} />
            </Field>
            <Field label="Role" htmlFor={`${id}-role`}>
              <Select value={role} onChange={(e) => setRole(e.target.value as StaffMember["role"])}>
                {Object.entries(ROLE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Checkbox id={`${id}-scan`} checked={canScan} onChange={(e) => setCanScan(e.target.checked)} />
              <Label htmlFor={`${id}-scan`} className="font-normal">
                Allow QR check-in scanning
              </Label>
            </div>
            <Button type="submit" size="sm" loading={pending}>
              <UserPlus /> Add
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
