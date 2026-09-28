import "server-only";
import type { NotificationType } from "@prisma/client";
import { db } from "./db";
import { appUrl } from "./env";
import { emailLayout, sendEmail } from "./mailer";
import { publish } from "./realtime";

export type NotifyInput = {
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  /** Also send an email to each recipient. */
  email?: boolean;
  emailCta?: string;
};

/** Creates in-app notifications, pushes realtime unread counts, and optionally emails. */
export async function notify(userIds: string[], input: NotifyInput): Promise<number> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return 0;
  const CHUNK = 1000;
  for (let i = 0; i < ids.length; i += CHUNK) {
    await db.notification.createMany({
      data: ids.slice(i, i + CHUNK).map((userId) => ({
        userId, type: input.type, title: input.title, body: input.body, link: input.link,
      })),
    });
  }
  await Promise.all(ids.slice(0, 500).map((id) => pushUnreadCount(id)));

  if (input.email) {
    const users = await db.user.findMany({ where: { id: { in: ids }, status: "ACTIVE" }, select: { email: true, name: true } });
    const { html, text } = emailLayout({
      heading: input.title,
      paragraphs: [input.body],
      cta: input.link ? { label: input.emailCta ?? "Open Campus Event Hub", url: appUrl(input.link) } : undefined,
    });
    for (const u of users) {
      await sendEmail({ to: u.email, subject: input.title, template: input.type, html, text });
    }
  }
  return ids.length;
}

export async function pushUnreadCount(userId: string): Promise<void> {
  const unread = await db.notification.count({ where: { userId, readAt: null } });
  await publish(`user:${userId}`, { kind: "notification", unread });
}
