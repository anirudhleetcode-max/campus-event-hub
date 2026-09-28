import "server-only";
import bcrypt from "bcryptjs";

const COST = process.env.NODE_ENV === "test" ? 4 : 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

let dummyHash: string | null = null;

/** Performs a comparable amount of work when the user doesn't exist (prevents user enumeration by timing). */
export async function burnPasswordCheck(plain: string): Promise<false> {
  dummyHash ??= await bcrypt.hash("timing-equaliser-password", COST);
  await bcrypt.compare(plain, dummyHash);
  return false;
}
