import "server-only";
import { db } from "../db";

export type PlatformSettings = {
  platformName: string;
  supportEmail: string;
  seatHoldMinutes: number;
  reminderOffsetsHours: number[];
  allowStudentSignup: boolean;
  maintenanceBanner?: string;
};

export const DEFAULT_SETTINGS: PlatformSettings = {
  platformName: "Campus Event Hub",
  supportEmail: "support@campuseventhub.app",
  seatHoldMinutes: 15,
  reminderOffsetsHours: [168, 24, 1],
  allowStudentSignup: true,
};

const KEY = "platform";

export async function getSettings(): Promise<PlatformSettings> {
  const row = await db.systemSetting.findUnique({ where: { key: KEY } });
  return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<PlatformSettings> | undefined) ?? {}) };
}

export async function saveSettings(value: PlatformSettings, actorId: string): Promise<void> {
  await db.systemSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value, updatedById: actorId },
    update: { value, updatedById: actorId },
  });
}
