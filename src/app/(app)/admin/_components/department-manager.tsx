"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { departmentSchema } from "@/lib/validators";
import { zodToFieldErrors } from "@/lib/form-errors";
import { deleteDepartmentAction, saveDepartmentAction } from "@/app/actions/admin";

type Dept = { id: string; name: string; code: string; collegeId: string };

export function DepartmentDialog({ dept, colleges, defaultCollegeId }: { dept?: Dept; colleges: { id: string; name: string }[]; defaultCollegeId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ collegeId: dept?.collegeId ?? defaultCollegeId, name: dept?.name ?? "", code: dept?.code ?? "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    const parsed = departmentSchema.safeParse(v);
    if (!parsed.success) return setErrors(zodToFieldErrors(parsed.error));
    setPending(true);
    const res = await saveDepartmentAction(dept?.id ?? null, v);
    setPending(false);
    if (!res.ok) {
      setErrors(res.fieldErrors ?? {});
      return toast.error(res.error);
    }
    toast.success(res.message);
    setOpen(false);
    if (!dept) setV((p) => ({ ...p, name: "", code: "" }));
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger asChild>
        {dept ? (
          <Button variant="ghost" size="icon" aria-label={`Edit ${dept.name}`}>
            <Pencil />
          </Button>
        ) : (
          <Button>
            <Plus /> Add department
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title={dept ? "Edit department" : "Add department"}>
        <form onSubmit={submit} noValidate className="space-y-4">
          {colleges.length > 1 && !dept && (
            <Field label="College" htmlFor="dept-college" error={errors.collegeId} required>
              <Select value={v.collegeId} onChange={(e) => setV({ ...v, collegeId: e.target.value })}>
                {colleges.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Department name" htmlFor="dept-name" error={errors.name} required>
            <Input value={v.name} onChange={(e) => (setV({ ...v, name: e.target.value }), setErrors({ ...errors, name: "" }))} />
          </Field>
          <Field label="Code" htmlFor="dept-code" error={errors.code} hint="Short unique code, e.g. CSE" required>
            <Input value={v.code} onChange={(e) => (setV({ ...v, code: e.target.value.toUpperCase() }), setErrors({ ...errors, code: "" }))} maxLength={12} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteDepartmentButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="icon" aria-label={`Remove ${name}`}>
          <Trash2 />
        </Button>
      }
      title={`Remove ${name}?`}
      description="The department will no longer be selectable. Existing users, events and reports keep their historical department."
      confirmLabel="Remove"
      onConfirm={async () => {
        const res = await deleteDepartmentAction(id);
        if (res.ok) {
          toast.success(res.message);
          router.refresh();
        } else toast.error(res.error);
      }}
    />
  );
}
