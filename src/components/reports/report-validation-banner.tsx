import { reportValidationNotice } from "@/application/report-presentation";

export function ReportValidationBanner({ isValid, validationNotes }: {
  isValid: boolean;
  validationNotes: string | null;
}) {
  const notice = reportValidationNotice(isValid, validationNotes);
  if (!notice.summary) return null;
  return <div className="report-section mt-4 border-l-2 border-[#a56817] bg-[#fff9ed] px-4 py-3 text-sm text-[#6d4915]">
    <p className="font-medium">{notice.summary}</p>
    <details className="mt-1"><summary className="cursor-pointer text-xs underline">อ่านหมายเหตุที่บันทึกไว้</summary><p className="mt-2 text-xs">{notice.fullNote}</p></details>
  </div>;
}
