import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReportSigner } from "@/application/report-signer";

const SIGNATURE_ERROR = "โหลดลายเซ็นสำหรับรายงานไม่สำเร็จ กรุณาตรวจไฟล์ลายเซ็นของ HearGuard แล้วโหลดหน้านี้ใหม่ก่อนพิมพ์";

// Called only after the route has authorized and loaded its report/record.
// This asset is deliberately outside public and is not a downloadable endpoint.
export async function loadReportSigner(): Promise<ReportSigner> {
  const png = await readFile(join(process.cwd(), "private/report-assets/physician-signature.png"));
  if (png.length < 33 || !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    || png.toString("ascii", 12, 16) !== "IHDR" || !png.readUInt32BE(16) || !png.readUInt32BE(20)
    || png[25] !== 6) {
    throw new Error("Invalid transparent report signature PNG");
  }
  return {
    displayName: "นพ.แบงก์ชาติ จินตรัตน์",
    licenseNumber: "ว.50587",
    signatureDataUrl: `data:image/png;base64,${png.toString("base64")}`,
  };
}

export async function getReportSigningState(): Promise<{ signer: ReportSigner; error: null } | { signer: null; error: string }> {
  try {
    return { signer: await loadReportSigner(), error: null };
  } catch {
    return { signer: null, error: SIGNATURE_ERROR };
  }
}
