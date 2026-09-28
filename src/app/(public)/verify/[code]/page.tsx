import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgeCheck, CalendarDays, SearchX, ShieldAlert } from "lucide-react";
import { verifyCertificate } from "@/server/services/certificates";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, Breadcrumbs, DescriptionList } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatDateTime } from "@/lib/utils";
import { VerifySearchForm } from "../verify-search-form";

export const dynamic = "force-dynamic";

/** Certificate IDs only contain A–Z, 0–9 and dashes; anything else is dropped so redirects stay stable. */
function normalise(code: string) {
  return code.replace(/[^A-Za-z0-9-]/g, "").toUpperCase().slice(0, 64);
}

export async function generateMetadata({ params }: PageProps<"/verify/[code]">): Promise<Metadata> {
  const { code } = await params;
  return {
    title: `Certificate ${normalise(code)}`,
    description: "Certificate verification result from Campus Event Hub.",
    robots: { index: false, follow: false },
  };
}

export default async function VerifyCodePage({ params }: PageProps<"/verify/[code]">) {
  const { code: rawCode } = await params;
  const code = normalise(rawCode);
  if (!code) redirect("/verify");
  if (code !== rawCode) redirect(`/verify/${code}`);

  const cert = await verifyCertificate(code);
  const breadcrumbs = [{ label: "Verify a certificate", href: "/verify" }, { label: code }];

  return (
    <div className="container-page max-w-3xl py-10 sm:py-14">
      <Breadcrumbs items={breadcrumbs} />

      <div className="mt-6">
        {!cert ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 p-8 text-center sm:p-10">
              <span className="flex size-14 items-center justify-center rounded-full bg-surface-2 text-muted-foreground">
                <SearchX className="size-7" aria-hidden />
              </span>
              <h1 className="text-xl font-semibold">No certificate found</h1>
              <p className="max-w-md text-sm text-muted-foreground">
                We couldn&apos;t find a certificate with the ID <span className="font-mono font-medium break-all text-foreground">{code}</span>. Check the ID
                for typos — it looks like <span className="font-mono">CEH-2026-ABCD2345</span>.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            {cert.valid ? (
              <div className="flex flex-col items-center gap-2 bg-success-soft px-6 py-8 text-center text-success-soft-foreground">
                <BadgeCheck className="size-12" aria-hidden />
                <h1 className="text-2xl font-semibold tracking-tight">Verified certificate</h1>
                <p className="max-w-md text-sm opacity-90">This certificate is authentic and was issued through Campus Event Hub.</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 bg-danger-soft px-6 py-8 text-center text-danger-soft-foreground">
                <ShieldAlert className="size-12" aria-hidden />
                <h1 className="text-2xl font-semibold tracking-tight">Certificate revoked</h1>
                <p className="max-w-md text-sm opacity-90">
                  This certificate was issued but has since been revoked by the issuing institution
                  {cert.revokedAt ? ` on ${formatDateTime(cert.revokedAt)}` : ""}. It is no longer valid.
                </p>
              </div>
            )}

            <CardContent className="space-y-6 p-5 pt-6 sm:p-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Awarded to</p>
                  <p className="mt-1 text-2xl font-semibold break-words">{cert.recipientName}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge tone="primary">{cert.typeLabel}</Badge>
                  {cert.position && <Badge tone="warning">{cert.position}</Badge>}
                  <Badge tone={cert.valid ? "success" : "danger"} dot>
                    {cert.valid ? "Valid" : "Revoked"}
                  </Badge>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-lg bg-surface-2 p-4">
                <Avatar name={cert.issuer.name} src={cert.issuer.logoUrl} size={40} />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Issued by</p>
                  <p className="font-medium break-words">{cert.issuer.name}</p>
                </div>
              </div>

              <DescriptionList
                items={[
                  { label: "Certificate type", value: `Certificate of ${cert.typeLabel}` },
                  ...(cert.position ? [{ label: "Position", value: cert.position }] : []),
                  {
                    label: "Event",
                    value: (
                      <Link href={`/events/${cert.event.slug}`} className="text-primary hover:underline">
                        {cert.event.title}
                      </Link>
                    ),
                  },
                  {
                    label: "Event dates",
                    value: (
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays className="size-3.5 text-muted-foreground" aria-hidden />
                        {cert.event.dates}
                      </span>
                    ),
                  },
                  { label: "Issuing organization", value: cert.issuer.name },
                  { label: "Issued on", value: formatDate(cert.issuedAt, { day: "numeric", month: "long", year: "numeric" }) },
                  ...(cert.revokedAt ? [{ label: "Revoked on", value: formatDateTime(cert.revokedAt) }] : []),
                  { label: "Certificate ID", value: <span className="font-mono">{cert.code}</span> },
                ]}
              />
            </CardContent>
          </Card>
        )}
      </div>

      <div className="mt-8 rounded-xl border border-border bg-surface p-5 shadow-sm sm:p-6">
        <h2 className="mb-3 text-sm font-semibold">Verify another certificate</h2>
        <VerifySearchForm />
      </div>
    </div>
  );
}
