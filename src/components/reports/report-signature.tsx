import type { ReportSigner } from "@/application/report-signer";

export function ReportSignature({ signer }: { signer: ReportSigner | null }) {
  if (!signer) return null;
  return <div className="hg-report-signature" data-report-signature>
    {/* Embedded local PNG: no public asset URL or image optimizer request. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={signer.signatureDataUrl} alt={`ลายเซ็น ${signer.displayName}`} width={240} height={58} />
    <p className="hg-report-signature-name">{signer.displayName}</p>
    <p>{signer.licenseNumber}</p>
  </div>;
}

export function ReportSignatureError({ message }: { message: string }) {
  return <p role="alert" className="hg-report-signature-error my-5 border-l-2 border-red-700 bg-red-50 p-4 text-sm font-semibold text-red-800">{message}</p>;
}
