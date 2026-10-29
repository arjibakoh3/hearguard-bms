import { z } from "zod";

export const beerthipReviewNoteSchema = z.string().trim().max(2000)
  .refine((note) => note.length === 0 || note.length >= 10, "เหตุผลที่กรอกต้องมีอย่างน้อย 10 ตัวอักษร")
  .transform((note) => note || null)
  .nullable();
