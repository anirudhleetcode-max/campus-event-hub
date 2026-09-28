import type { MetadataRoute } from "next";
import { db } from "@/server/db";
import { PUBLIC_STATUSES } from "@/lib/event-status";

// Reads the database on each request so builds never need a DB connection.
export const dynamic = "force-dynamic";

const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const events = await db.event.findMany({
    where: { deletedAt: null, status: { in: PUBLIC_STATUSES }, college: { status: "ACTIVE", deletedAt: null } },
    select: { slug: true, updatedAt: true },
    orderBy: { startsAt: "desc" },
    take: 50_000 - 10,
  });
  const latest = events.reduce<Date | undefined>((max, e) => (!max || e.updatedAt > max ? e.updatedAt : max), undefined);

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1, lastModified: latest },
    { url: `${SITE_URL}/events`, changeFrequency: "hourly", priority: 0.9, lastModified: latest },
    { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/verify`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.3 },
  ];

  return [
    ...staticPages,
    ...events.map((e) => ({
      url: `${SITE_URL}/events/${e.slug}`,
      lastModified: e.updatedAt,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
  ];
}
