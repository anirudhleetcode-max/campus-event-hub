import type { Metadata } from "next";
import Link from "next/link";
import { Award, Download } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { pageUser, pageNum, sp, type SearchParams } from "@/server/page-guard";
import { collegeScope } from "@/server/auth/permissions";
import { db } from "@/server/db";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { SearchInput, UrlSelect } from "@/components/ui/url-controls";
import { CERTIFICATE_TYPE } from "@/lib/labels";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Certificates" };

export default async function CertificatesAdmin({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await pageUser(["SUPER_ADMIN", "COLLEGE_ADMIN"]);
  const params = await searchParams;
  const q = sp(params, "q")?.trim();
  const type = sp(params, "type");
  const page = pageNum(params);
  const pageSize = 25;
  const where: Prisma.CertificateWhereInput = {
    event: collegeScope(user),
    ...(type && type in CERTIFICATE_TYPE ? { type: type as keyof typeof CERTIFICATE_TYPE } : {}),
    ...(sp(params, "status") === "REVOKED" ? { status: "REVOKED" } : sp(params, "status") === "ISSUED" ? { status: "ISSUED" } : {}),
    ...(q ? { OR: [{ code: { contains: q.toUpperCase() } }, { recipientName: { contains: q, mode: "insensitive" } }, { event: { title: { contains: q, mode: "insensitive" } } }] } : {}),
  };
  const [total, items] = await Promise.all([
    db.certificate.count({ where }),
    db.certificate.findMany({ where, orderBy: { issuedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { event: { select: { id: true, title: true } } } }),
  ]);
  return (
    <>
      <PageHeader
        title="Certificates"
        description={`${total.toLocaleString("en-IN")} certificates. Every certificate can be verified publicly by its ID or QR code.`}
        actions={
          <a href="/api/exports/certificates" className={buttonClasses("outline")}>
            <Download /> Export CSV
          </a>
        }
      />
      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center">
          <SearchInput placeholder="Search by ID, recipient or event" className="lg:max-w-md lg:flex-1" label="Search certificates" />
          <div className="flex flex-wrap gap-2">
            <UrlSelect param="type" label="Certificate type" options={Object.entries(CERTIFICATE_TYPE).map(([v, l]) => ({ value: v, label: l }))} allLabel="All types" />
            <UrlSelect param="status" label="Status" options={[{ value: "ISSUED", label: "Valid" }, { value: "REVOKED", label: "Revoked" }]} allLabel="Any status" />
          </div>
        </div>
        {items.length === 0 ? (
          <EmptyState icon={Award} title="No certificates found" description="Certificates appear here once organizers issue them after an event." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Certificate ID</TH>
                <TH>Recipient</TH>
                <TH>Event</TH>
                <TH>Type</TH>
                <TH className="hidden md:table-cell">Issued</TH>
                <TH className="text-right">
                  <span className="sr-only">Actions</span>
                </TH>
              </tr>
            </THead>
            <TBody>
              {items.map((c) => (
                <TR key={c.id}>
                  <TD className="font-mono text-xs whitespace-nowrap">{c.code}</TD>
                  <TD className="font-medium">{c.recipientName}</TD>
                  <TD>
                    <Link href={`/organizer/events/${c.event.id}/certificates`} className="line-clamp-1 min-w-40 hover:text-primary">
                      {c.event.title}
                    </Link>
                  </TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      <Badge tone="primary">{CERTIFICATE_TYPE[c.type]}</Badge>
                      {c.status === "REVOKED" && <Badge tone="danger">Revoked</Badge>}
                    </div>
                  </TD>
                  <TD className="hidden whitespace-nowrap text-muted-foreground md:table-cell">{formatDate(c.issuedAt)}</TD>
                  <TD className="text-right whitespace-nowrap">
                    <Link href={`/verify/${c.code}`} className={buttonClasses("ghost", "sm")}>
                      Verify
                    </Link>
                    {c.status === "ISSUED" && (
                      <a href={`/api/certificates/${c.code}/pdf`} className={buttonClasses("ghost", "sm")}>
                        PDF
                      </a>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        <div className="border-t border-border p-4">
          <Pagination page={page} pageCount={Math.max(1, Math.ceil(total / pageSize))} total={total} pageSize={pageSize} basePath="/admin/certificates" searchParams={params} />
        </div>
      </Card>
    </>
  );
}
