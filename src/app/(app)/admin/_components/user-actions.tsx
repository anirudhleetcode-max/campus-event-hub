"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreHorizontal, ShieldCheck, UserCheck, UserX, Eye } from "lucide-react";
import Link from "next/link";
import type { Role, UserStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { ROLE_LABEL } from "@/lib/labels";
import { changeUserRoleAction, setUserStatusAction } from "@/app/actions/admin";

export function UserActions({ user, assignable, isSelf }: { user: { id: string; name: string; role: Role; status: UserStatus }; assignable: Role[]; isSelf: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const changeRole = (role: Role) =>
    start(async () => {
      const res = await changeUserRoleAction(user.id, role);
      if (res.ok) {
        toast.success(res.message);
        router.refresh();
      } else toast.error(res.error);
    });

  const setStatus = async (status: UserStatus) => {
    const res = await setUserStatusAction(user.id, status);
    if (res.ok) {
      toast.success(res.message);
      router.refresh();
    } else toast.error(res.error);
  };

  const manageable = !isSelf && assignable.includes(user.role);
  return (
    <div className="flex items-center justify-end gap-1">
      {manageable &&
        (user.status === "ACTIVE" ? (
          <ConfirmDialog
            trigger={
              <Button variant="ghost" size="sm" aria-label={`Suspend ${user.name}`}>
                <UserX /> <span className="hidden sm:inline">Suspend</span>
              </Button>
            }
            title={`Suspend ${user.name}?`}
            description="They will be signed out immediately and won't be able to sign in until reactivated. Their data is kept."
            confirmLabel="Suspend user"
            onConfirm={() => setStatus("SUSPENDED")}
          />
        ) : (
          <ConfirmDialog
            trigger={
              <Button variant="ghost" size="sm" aria-label={`Activate ${user.name}`}>
                <UserCheck /> <span className="hidden sm:inline">Activate</span>
              </Button>
            }
            title={`Reactivate ${user.name}?`}
            description="They will be able to sign in again with their existing password."
            confirmLabel="Activate"
            tone="primary"
            onConfirm={() => setStatus("ACTIVE")}
          />
        ))}
      <Dropdown>
        <DropdownTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`More actions for ${user.name}`} disabled={pending}>
            <MoreHorizontal />
          </Button>
        </DropdownTrigger>
        <DropdownContent>
          <DropdownItem asChild>
            <Link href={`/admin/users/${user.id}`}>
              <Eye /> View activity
            </Link>
          </DropdownItem>
          {manageable && (
            <>
              <DropdownSeparator />
              <DropdownLabel>Change role</DropdownLabel>
              {assignable.map((r) => (
                <DropdownItem key={r} disabled={r === user.role} onSelect={() => changeRole(r)}>
                  <ShieldCheck /> {ROLE_LABEL[r]}
                </DropdownItem>
              ))}
            </>
          )}
        </DropdownContent>
      </Dropdown>
    </div>
  );
}
