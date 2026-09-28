import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Award, Download, Eye, ShieldCheck } from "lucide-react";
import { getCurrentUser } from "@/server/auth/session";
import { listMyCertificates } from "@/server/services/certificates";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { CertificatePreview } from "@/components/certificates/certificate-preview";
import { CopyButton } from "@/components/student/copy-button";
import { CERTIFICATE_TYPE } from "@/lib/labels";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "My certificates" };

export default async function MyCertificatesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const certs = await listMyCertificates(user);
  const issued = certs.filter((c) => c.status === "ISSUED").length;

  return (
    <>
      <PageHeader
        title="My certificates"
        description={certs.length ? `${issued} certificate${issued === 1 ? "" : "s"} earned. Every certificate carries a unique ID anyone can verify online.` : "Certificates you earn at events will appear here."}
      />
      {certs.length === 0 ? (
        <Card>
          <EmptyState
            icon={Award}
            title="No certificates yet"
            description="Attend events and organizers will issue participation, winner or volunteer certificates here."
            action={
              <Link href="/events" className={buttonClasses("primary")}>
                Explore events
              </Link>
            }
          />
        </Card>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {certs.map((c) => {
            const revoked = c.status === "REVOKED";
            return (
              <li key={c.id}>
                <Card className="flex h-full flex-col p-4">
                  <CertificatePreview
                    collegeName={c.event.college.name}
                    type={c.type}
                    recipientName={c.recipientName}
                    eventTitle={c.event.title}
                    date={c.event.startsAt}
                    code={c.code}
                    position={c.position}
                    accentColor={c.event.category.color}
                    revoked={revoked}
                  />
                  <div className="mt-4 mb-4 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="text-sm leading-snug font-semibold break-words">
                        <Link href={`/events/${c.event.slug}`} className="hover:text-primary">
                          {c.event.title}
                        </Link>
                      </h2>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Issued {formatDate(c.issuedAt)} · <span className="font-mono">{c.code}</span>
                      </p>
                    </div>
                    {revoked ? <Badge tone="danger">Revoked</Badge> : <Badge tone="success">{CERTIFICATE_TYPE[c.type]}</Badge>}
                  </div>
                  {revoked ? (
                    <p className="mt-3 rounded-lg bg-danger-soft p-2.5 text-xs text-danger-soft-foreground">
                      This certificate was revoked{c.revokedAt ? ` on ${formatDate(c.revokedAt)}` : ""}
                      {c.revokedReason ? `: ${c.revokedReason}` : "."}
                    </p>
                  ) : (
                    <div className="mt-auto flex flex-wrap gap-2 border-t border-border pt-3">
                      <a href={`/api/certificates/${c.code}/pdf`} className={buttonClasses("primary", "sm")} download>
                        <Download aria-hidden />
                        Download PDF
                      </a>
                      <a href={`/api/certificates/${c.code}/pdf?inline=1`} target="_blank" rel="noopener" className={buttonClasses("outline", "sm")}>
                        <Eye aria-hidden />
                        View
                      </a>
                      <Link href={`/verify/${c.code}`} className={buttonClasses("ghost", "sm")}>
                        <ShieldCheck aria-hidden />
                        Verify
                      </Link>
                      <CopyButton path={`/verify/${c.code}`} label="Copy link" successMessage="Verification link copied" />
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
