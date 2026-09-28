import type {
  CertificateType,
  EventMode,
  EventStatus,
  PaymentStatus,
  RefundStatus,
  RegistrationStatus,
  Role,
} from "@prisma/client";

export type Tone = "neutral" | "primary" | "success" | "warning" | "danger" | "info";

export const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  COLLEGE_ADMIN: "College Admin",
  EVENT_ORGANIZER: "Event Organizer",
  FACULTY_COORDINATOR: "Faculty Coordinator",
  STUDENT: "Student",
};

export const EVENT_STATUS: Record<EventStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  PENDING_APPROVAL: { label: "Pending approval", tone: "warning" },
  PUBLISHED: { label: "Published", tone: "info" },
  REGISTRATION_OPEN: { label: "Registration open", tone: "success" },
  REGISTRATION_CLOSED: { label: "Registration closed", tone: "warning" },
  ONGOING: { label: "Ongoing", tone: "primary" },
  COMPLETED: { label: "Completed", tone: "neutral" },
  CANCELLED: { label: "Cancelled", tone: "danger" },
  ARCHIVED: { label: "Archived", tone: "neutral" },
};

export const REGISTRATION_STATUS: Record<RegistrationStatus, { label: string; tone: Tone }> = {
  PENDING_PAYMENT: { label: "Awaiting payment", tone: "warning" },
  CONFIRMED: { label: "Confirmed", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "danger" },
  EXPIRED: { label: "Expired", tone: "neutral" },
  FAILED: { label: "Failed", tone: "danger" },
};

export const PAYMENT_STATUS: Record<PaymentStatus, { label: string; tone: Tone }> = {
  CREATED: { label: "Initiated", tone: "neutral" },
  AUTHORIZED: { label: "Authorized", tone: "info" },
  CAPTURED: { label: "Paid", tone: "success" },
  FAILED: { label: "Failed", tone: "danger" },
  REFUNDED: { label: "Refunded", tone: "info" },
  PARTIALLY_REFUNDED: { label: "Partially refunded", tone: "info" },
};

export const REFUND_STATUS: Record<RefundStatus, { label: string; tone: Tone }> = {
  NONE: { label: "—", tone: "neutral" },
  REQUESTED: { label: "Refund requested", tone: "warning" },
  PENDING: { label: "Refund processing", tone: "info" },
  PROCESSED: { label: "Refunded", tone: "success" },
  FAILED: { label: "Refund failed", tone: "danger" },
};

export const EVENT_MODE: Record<EventMode, string> = {
  IN_PERSON: "In person",
  ONLINE: "Online",
  HYBRID: "Hybrid",
};

export const CERTIFICATE_TYPE: Record<CertificateType, string> = {
  PARTICIPATION: "Participation",
  WINNER: "Winner",
  RUNNER_UP: "Runner-up",
  VOLUNTEER: "Volunteer",
  ORGANIZER: "Organizer",
  SPEAKER: "Speaker",
};

/** Default heading printed on each certificate type (templates can override). */
export const CERTIFICATE_HEADING: Record<CertificateType, string> = {
  PARTICIPATION: "Certificate of Participation",
  WINNER: "Certificate of Achievement",
  RUNNER_UP: "Certificate of Achievement",
  VOLUNTEER: "Certificate of Appreciation",
  ORGANIZER: "Certificate of Appreciation",
  SPEAKER: "Certificate of Appreciation",
};

/** Optional profile fields an organizer can require at registration. */
export const REGISTRATION_FIELDS = {
  phone: "Phone number",
  studentId: "Student ID",
  department: "Department",
  year: "Year of study",
} as const;
export type RegistrationField = keyof typeof REGISTRATION_FIELDS;
