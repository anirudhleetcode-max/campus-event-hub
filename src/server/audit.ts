import "server-only";
import type { Prisma } from "@prisma/client";
import { db, type Tx } from "./db";
import { logger } from "./logger";

export type AuditEntry = {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string | null;
};

/** Records an audit log entry. Never throws — auditing must not break the action. */
export async function audit(entry: AuditEntry, tx: Tx | typeof db = db): Promise<void> {
  try {
    await tx.auditLog.create({ data: entry });
  } catch (err) {
    logger.error("Failed to write audit log", { action: entry.action, error: err });
  }
}
