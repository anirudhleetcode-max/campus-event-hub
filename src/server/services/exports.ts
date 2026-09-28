import "server-only";
import { db } from "../db";
import { AppError } from "../errors";
import { audit } from "../audit";
import { toCsv } from "../csv";
import { collegeScope, requireEventAccess } from "../auth/permissions";
import type { SessionUser } from "../auth/session";
import { CERTIFICATE_TYPE } from "@/lib/labels";
import { dashboardAnalytics, eventAnalytics, resolveRange } from "./analytics";

export const EXPORT_KINDS = ["registrations", "payments", "attendance", "certificates", "feedback", "analytics"] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

const rupees = (paise: number) => (paise / 100).toFixed(2);

async function scope(actor: SessionUser, eventId?: string) {
  if (eventId) {
    await requireEventAccess(actor, eventId, "canView");
    return { eventId };
  }
  if (actor.role !== "SUPER_ADMIN" && actor.role !== "COLLEGE_ADMIN") {
    throw new AppError("FORBIDDEN", "Choose an event to export its data.");
  }
  return { event: collegeScope(actor) };
}

export async function exportCsv(actor: SessionUser, kind: ExportKind, opts: { eventId?: string; range?: string; from?: string; to?: string }) {
  const where = await scope(actor, opts.eventId);
  let headers: string[] = [];
  let rows: (string | number | null | Date)[][] = [];

  if (kind === "registrations") {
    const data = await db.registration.findMany({
      where,
      orderBy: { createdAt: "asc" },
      include: { event: { select: { title: true } }, attendance: { select: { checkInAt: true } }, answers: { include: { question: { select: { label: true } } } } },
    });
    const questionLabels = [...new Set(data.flatMap((r) => r.answers.map((a) => a.question.label)))];
    headers = ["Registration ID", "Event", "Participant", "Email", "Phone", "College", "Department", "Year", "Student ID", "Status", "Amount (INR)", "Registered at", "Confirmed at", "Checked in at", ...questionLabels];
    rows = data.map((r) => [
      r.code, r.event.title, r.participantName, r.participantEmail, r.participantPhone, r.collegeName, r.departmentName, r.year, r.studentId,
      r.status, rupees(r.amount), r.createdAt, r.confirmedAt, r.attendance?.checkInAt ?? null,
      ...questionLabels.map((l) => r.answers.find((a) => a.question.label === l)?.value ?? null),
    ]);
  } else if (kind === "payments") {
    const data = await db.payment.findMany({ where, orderBy: { createdAt: "asc" }, include: { event: { select: { title: true } }, registration: { select: { code: true, participantName: true, participantEmail: true } } } });
    headers = ["Payment ID", "Receipt", "Mode", "Event", "Registration ID", "Participant", "Email", "Amount (INR)", "Currency", "Status", "Method", "Razorpay order", "Razorpay payment", "Paid at", "Refund status", "Refunded (INR)", "Refund reason"];
    rows = data.map((p) => [
      p.id, p.receipt, p.mode, p.event.title, p.registration.code, p.registration.participantName, p.registration.participantEmail, rupees(p.amount), p.currency,
      p.status, p.method, p.razorpayOrderId, p.razorpayPaymentId, p.paidAt, p.refundStatus, rupees(p.refundAmount), p.refundReason,
    ]);
  } else if (kind === "attendance") {
    const data = await db.attendance.findMany({ where, orderBy: { checkInAt: "asc" }, include: { event: { select: { title: true } }, registration: { select: { code: true, participantName: true, participantEmail: true } }, markedBy: { select: { name: true } } } });
    headers = ["Registration ID", "Event", "Participant", "Email", "Checked in at", "Checked out at", "Method", "Marked by"];
    rows = data.map((a) => [a.registration.code, a.event.title, a.registration.participantName, a.registration.participantEmail, a.checkInAt, a.checkOutAt, a.method, a.markedBy.name]);
  } else if (kind === "certificates") {
    const data = await db.certificate.findMany({ where, orderBy: { issuedAt: "asc" }, include: { event: { select: { title: true } }, user: { select: { email: true } } } });
    headers = ["Certificate ID", "Event", "Recipient", "Email", "Type", "Position", "Status", "Issued at", "Revoked at"];
    rows = data.map((c) => [c.code, c.event.title, c.recipientName, c.user.email, CERTIFICATE_TYPE[c.type], c.position, c.status, c.issuedAt, c.revokedAt]);
  } else if (kind === "feedback") {
    const data = await db.feedback.findMany({ where, orderBy: { createdAt: "asc" }, include: { event: { select: { title: true } } } });
    headers = ["Event", "Overall", "Organization", "Venue", "Speakers", "Experience", "Comments", "Suggestions", "Submitted at"];
    rows = data.map((f) => [f.event.title, f.overall, f.organization, f.venue, f.speakers, f.experience, f.comments, f.suggestions, f.createdAt]);
  } else if (kind === "analytics") {
    if (opts.eventId) {
      const a = await eventAnalytics(actor, opts.eventId);
      headers = ["Date", "Confirmed registrations", "Cumulative"];
      rows = a.timeline.map((t) => [t.date, t.value, t.cumulative]);
      rows.push([], ["Summary"], ["Registrations", a.registrations], ["Capacity", a.capacity], ["Attendance", a.attendance], ["Revenue (INR)", rupees(a.revenue)], ["Conversion rate", a.conversionRate.toFixed(3)], ["No-show rate", a.noShowRate?.toFixed(3) ?? "n/a"], ["Average rating", a.feedbackAvg?.toFixed(2) ?? "n/a"], ["Certificates", a.certificates]);
    } else {
      const range = resolveRange(opts.range, opts.from, opts.to);
      const a = await dashboardAnalytics(actor, range);
      headers = ["Date", "Registrations", "Revenue (INR)", "Check-ins"];
      rows = a.registrationTrend.map((r, i) => [r.date, r.value, rupees(a.revenueTrend[i]?.value ?? 0), a.attendanceTrend[i]?.value ?? 0]);
    }
  }
  await audit({ actorId: actor.id, action: "export.csv", entityType: opts.eventId ? "event" : "platform", entityId: opts.eventId ?? null, metadata: { kind, rows: rows.length } });
  return toCsv(headers, rows);
}
