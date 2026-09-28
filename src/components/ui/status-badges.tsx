import type { EventStatus, PaymentStatus, RefundStatus, RegistrationStatus } from "@prisma/client";
import { EVENT_STATUS, PAYMENT_STATUS, REFUND_STATUS, REGISTRATION_STATUS } from "@/lib/labels";
import { Badge } from "./badge";

export const EventStatusBadge = ({ status }: { status: EventStatus }) => (
  <Badge tone={EVENT_STATUS[status].tone} dot>
    {EVENT_STATUS[status].label}
  </Badge>
);
export const RegistrationStatusBadge = ({ status }: { status: RegistrationStatus }) => <Badge tone={REGISTRATION_STATUS[status].tone}>{REGISTRATION_STATUS[status].label}</Badge>;
export const PaymentStatusBadge = ({ status }: { status: PaymentStatus }) => <Badge tone={PAYMENT_STATUS[status].tone}>{PAYMENT_STATUS[status].label}</Badge>;
export const RefundStatusBadge = ({ status }: { status: RefundStatus }) => (status === "NONE" ? null : <Badge tone={REFUND_STATUS[status].tone}>{REFUND_STATUS[status].label}</Badge>);
