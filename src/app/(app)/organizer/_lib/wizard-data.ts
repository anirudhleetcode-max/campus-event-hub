import "server-only";
import { db } from "@/server/db";

/** Reference data for the event wizard, scoped to one college (or all active colleges for super admins). */
export async function wizardOptions(collegeId: string | null) {
  const collegeFilter = collegeId ? { collegeId } : { college: { status: "ACTIVE" as const, deletedAt: null } };
  const [categories, departments, venues] = await Promise.all([
    db.eventCategory.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, color: true } }),
    db.department.findMany({ where: { deletedAt: null, ...collegeFilter }, orderBy: { name: "asc" }, select: { id: true, name: true, collegeId: true } }),
    db.venue.findMany({
      where: collegeFilter,
      orderBy: { name: "asc" },
      take: 500,
      select: { id: true, name: true, address: true, city: true, latitude: true, longitude: true, collegeId: true },
    }),
  ]);
  return { categories, departments, venues };
}
