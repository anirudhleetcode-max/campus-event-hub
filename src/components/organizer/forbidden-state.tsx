import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";

/** Friendly 403 shown when a signed-in user opens a page they are not allowed to see. */
export function ForbiddenState({ message, backHref = "/dashboard", backLabel = "Go to dashboard" }: { message?: string; backHref?: string; backLabel?: string }) {
  return (
    <Card>
      <EmptyState
        icon={ShieldAlert}
        title="You don't have access to this page"
        description={message ?? "This area is limited to the event's organizers and assigned staff. Ask the organizer if you think you should have access."}
        action={
          <Link href={backHref} className={buttonClasses("outline")}>
            {backLabel}
          </Link>
        }
      />
    </Card>
  );
}
