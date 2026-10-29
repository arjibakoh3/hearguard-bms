import { z } from "zod";

const LOCAL_LOGIN_DOMAIN = "hearguard.local";
const LoginIdSchema = z.string().trim().toLowerCase()
  .regex(/^[a-z0-9][a-z0-9._-]{2,63}$/, "ID เข้าสู่ระบบไม่ถูกต้อง");

export function loginEmailFromIdentifier(value: unknown): string {
  const input = z.string().trim().toLowerCase().parse(value);
  if (input.includes("@")) return z.email().parse(input);
  return `${LoginIdSchema.parse(input)}@${LOCAL_LOGIN_DOMAIN}`;
}
