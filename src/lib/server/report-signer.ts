import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReportSigner } from "@/application/report-signer";

const SIGNATURE_ERROR = "โหลดลายเซ็นสำหรับรายงานไม่สำเร็จ กรุณาตรวจไฟล์ลายเซ็นของ HearGuard แล้วโหลดหน้านี้ใหม่ก่อนพิมพ์";

// Called only after the route has authorized and loaded its report/record.
// This asset is deliberately outside public and is not a downloadable endpoint.
export async function loadReportSigner(): Promise<ReportSigner> {
  const displayName = process.env.HEARGUARD_REPORT_SIGNER_NAME?.trim();
  const licenseNumber = process.env.HEARGUARD_REPORT_SIGNER_LICENSE?.trim();
  if (!displayName || !licenseNumber) throw new Error("Report signer name and license must be configured");
  const encoded = process.env.HEARGUARD_REPORT_SIGNATURE_BASE64?.trim();
  if (encoded && (encoded.length > 1_400_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))) {
    throw new Error("Invalid report signature encoding");
  }
  const png = encoded
    ? Buffer.from(encoded, "base64")
    : await readFile(join(process.cwd(), "private/report-assets/physician-signature.png"));
  if (png.length < 33 || !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    || png.toString("ascii", 12, 16) !== "IHDR" || !png.readUInt32BE(16) || !png.readUInt32BE(20)
    || png[25] !== 6) {
    throw new Error("Invalid transparent report signature PNG");
  }
  return {
    displayName,
    licenseNumber,
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
