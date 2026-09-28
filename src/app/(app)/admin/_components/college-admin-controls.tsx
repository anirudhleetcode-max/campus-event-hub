"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { CollegeStatus, SubscriptionPlan, SubscriptionStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { setCollegeStatusAction, updateSubscriptionAction } from "@/app/actions/admin";

export function CollegeStatusControl({ id, name, status }: { id: string; name: string; status: CollegeStatus }) {
  const router = useRouter();
  const act = async (next: CollegeStatus) => {
    const res = await setCollegeStatusAction(id, next);
    if (res.ok) {
      toast.success(res.message);
      router.refresh();
    } else toast.error(res.error);
  };
  return status === "ACTIVE" ? (
    <ConfirmDialog
      trigger={<Button variant="danger">Suspend institution</Button>}
      title={`Suspend ${name}?`}
      description="All users of this college are signed out and cannot sign in; its events disappear from public listings. Data is preserved and access can be restored."
      confirmLabel="Suspend"
      onConfirm={() => act("SUSPENDED")}
    />
  ) : (
    <ConfirmDialog trigger={<Button>Reactivate institution</Button>} title={`Reactivate ${name}?`} description="Users will be able to sign in again and published events become visible." confirmLabel="Reactivate" tone="primary" onConfirm={() => act("ACTIVE")} />
  );
}

export function SubscriptionForm({ collegeId, initial }: { collegeId: string; initial: { plan: SubscriptionPlan; status: SubscriptionStatus; eventLimit: number | null } }) {
  const router = useRouter();
  const [v, setV] = useState({ plan: initial.plan, status: initial.status, eventLimit: initial.eventLimit?.toString() ?? "" });
  const [pending, start] = useTransition();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await updateSubscriptionAction(collegeId, v);
      if (res.ok) {
        toast.success(res.message);
        router.refresh();
      } else toast.error(res.error);
    });
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Plan" htmlFor="sub-plan">
        <Select value={v.plan} onChange={(e) => setV({ ...v, plan: e.target.value as SubscriptionPlan })}>
          <option value="FREE">Free</option>
          <option value="PRO">Pro</option>
          <option value="ENTERPRISE">Enterprise</option>
        </Select>
      </Field>
      <Field label="Status" htmlFor="sub-status">
        <Select value={v.status} onChange={(e) => setV({ ...v, status: e.target.value as SubscriptionStatus })}>
          <option value="TRIALING">Trialing</option>
          <option value="ACTIVE">Active</option>
          <option value="PAST_DUE">Past due</option>
          <option value="CANCELLED">Cancelled</option>
        </Select>
      </Field>
      <Field label="Event limit" htmlFor="sub-limit" hint="Maximum active events (cancelled and archived events don't count). Leave empty for unlimited.">
        <Input type="number" min={1} value={v.eventLimit} onChange={(e) => setV({ ...v, eventLimit: e.target.value })} />
      </Field>
      <Button type="submit" loading={pending} className="w-full">
        Update subscription
      </Button>
    </form>
  );
}
