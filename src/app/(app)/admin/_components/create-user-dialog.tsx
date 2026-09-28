"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import type { Role } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { ROLE_LABEL } from "@/lib/labels";
import { createUserSchema } from "@/lib/validators";
import { zodErrors } from "@/lib/form";
import { createUserAction } from "@/app/actions/admin";

type Opt = { id: string; name: string };

export function CreateUserDialog({ roles, colleges, departments, fixedCollegeId }: { roles: Role[]; colleges: Opt[]; departments: (Opt & { collegeId: string })[]; fixedCollegeId: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ name: "", email: "", role: roles.includes("EVENT_ORGANIZER") ? "EVENT_ORGANIZER" : roles[0]!, collegeId: fixedCollegeId ?? "", departmentId: "", password: "" });
  const set = (k: keyof typeof form, v: string) => (setForm((f) => ({ ...f, [k]: v })), setErrors((e) => ({ ...e, [k]: "" })));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    const parsed = createUserSchema.safeParse(form);
    if (!parsed.success) return setErrors(zodErrors(parsed.error));
    setPending(true);
    const res = await createUserAction(form);
    setPending(false);
    if (!res.ok) {
      setErrors(res.fieldErrors ?? {});
      toast.error(res.error);
      return;
    }
    toast.success(`${form.name} can now sign in with the password you set.`);
    setOpen(false);
    setForm((f) => ({ ...f, name: "", email: "", password: "", departmentId: "" }));
    router.refresh();
  }

  const collegeDepartments = departments.filter((d) => d.collegeId === (fixedCollegeId ?? form.collegeId));
  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus /> Add user
        </Button>
      </DialogTrigger>
      <DialogContent title="Add a user" description="Create an account for an organizer, faculty coordinator, administrator or student. Share the temporary password securely.">
        <form onSubmit={submit} noValidate className="space-y-4">
          <Field label="Full name" htmlFor="cu-name" error={errors.name} required>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Email" htmlFor="cu-email" error={errors.email} required>
            <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Role" htmlFor="cu-role" error={errors.role} required>
            <Select value={form.role} onChange={(e) => set("role", e.target.value)}>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </Select>
          </Field>
          {!fixedCollegeId && form.role !== "SUPER_ADMIN" && (
            <Field label="College" htmlFor="cu-college" error={errors.collegeId} required>
              <Select value={form.collegeId} onChange={(e) => (set("collegeId", e.target.value), set("departmentId", ""))}>
                <option value="">Select a college</option>
                {colleges.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {collegeDepartments.length > 0 && form.role !== "SUPER_ADMIN" && (
            <Field label="Department" htmlFor="cu-dept" error={errors.departmentId}>
              <Select value={form.departmentId} onChange={(e) => set("departmentId", e.target.value)}>
                <option value="">No department</option>
                {collegeDepartments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Temporary password" htmlFor="cu-password" error={errors.password} hint="At least 8 characters with a letter and a number." required>
            <Input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} autoComplete="new-password" />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              Create account
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
