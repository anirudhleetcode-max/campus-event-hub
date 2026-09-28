import { PrismaClient, type EventStatus, type Role } from "@prisma/client";
import { randomBytes } from "node:crypto";
import type { SessionUser } from "@/server/auth/session";

export const prisma = new PrismaClient();

const uid = () => randomBytes(4).toString("hex");

export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

export async function makeCollege(opts: { requireEventApproval?: boolean } = {}) {
  return prisma.college.create({
    data: { name: `Test College ${uid()}`, slug: `test-${uid()}`, requireEventApproval: opts.requireEventApproval ?? false, signatoryName: "Dr. Test", signatoryTitle: "Dean" },
  });
}

export async function makeUser(role: Role, collegeId: string | null, extra: { name?: string } = {}) {
  return prisma.user.create({
    data: { email: `${role.toLowerCase()}-${uid()}@test.dev`, passwordHash: "x", name: extra.name ?? `${role} ${uid()}`, role, collegeId },
  });
}

export function asSession(u: { id: string; email: string; name: string; role: Role; collegeId: string | null }): SessionUser {
  return { id: u.id, email: u.email, name: u.name, role: u.role, status: "ACTIVE", collegeId: u.collegeId, departmentId: null, avatarUrl: null, collegeName: null };
}

let categoryId: string | null = null;
export async function category() {
  if (categoryId && (await prisma.eventCategory.findUnique({ where: { id: categoryId } }))) return categoryId;
  const c = await prisma.eventCategory.create({ data: { name: `Cat ${uid()}`, slug: `cat-${uid()}` } });
  categoryId = c.id;
  return c.id;
}

const H = 3_600_000;
export async function makeEvent(opts: {
  collegeId: string;
  organizerId: string;
  capacity?: number;
  fee?: number;
  status?: EventStatus;
  startsInH?: number;
  durationH?: number;
  deadlineInH?: number;
}) {
  const startsAt = new Date(Date.now() + (opts.startsInH ?? 72) * H);
  return prisma.event.create({
    data: {
      slug: `ev-${uid()}`,
      title: "Integration Test Event",
      summary: "A test event summary",
      description: "A description long enough for validation purposes.",
      categoryId: await category(),
      collegeId: opts.collegeId,
      organizerId: opts.organizerId,
      status: opts.status ?? "REGISTRATION_OPEN",
      startsAt,
      endsAt: new Date(startsAt.getTime() + (opts.durationH ?? 3) * H),
      registrationDeadline: new Date(Date.now() + (opts.deadlineInH ?? Math.min(48, (opts.startsInH ?? 72) - 1)) * H),
      capacity: opts.capacity ?? 10,
      feeAmount: opts.fee ?? 0,
      venueName: "Main Hall",
    },
  });
}

export function datetimeLocal(d: Date): string {
  // Format in the app timezone (Asia/Kolkata = UTC+05:30, no DST)
  const ist = new Date(d.getTime() + 5.5 * H);
  return ist.toISOString().slice(0, 16);
}
