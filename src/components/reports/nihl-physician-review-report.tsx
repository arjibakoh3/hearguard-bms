import type { ReportNihlReview } from "@/application/view-models";
import { nihlPhysicianDecisionLabel } from "@/application/report-presentation";
import { formatDateTime } from "@/lib/format";

export function NihlPhysicianReviewReport({ review, print = false }: {
  review: ReportNihlReview | null;
  print?: boolean;
}) {
  if (!review) return null;
  return <section className={print ? "hg-print-nihl" : "report-section mt-5 border-y border-[#c5cbc6] bg-white py-5"}>
    <div className="hg-nihl-review-heading">
      <h2 className={print ? "" : "font-semibold text-[#18201e]"}>{print ? "05 · " : ""}ความเห็นแพทย์เกี่ยวกับ NIHL</h2>
      <p className="hg-nihl-review-decision mt-2 font-semibold">{nihlPhysicianDecisionLabel(review.decision)}</p>
      <p className={print ? "hg-print-muted" : "mt-1 text-xs text-[#68716e]"}>ลงความเห็นเมื่อ {formatDateTime(review.reviewedAt)}</p>
      {review.amendedAt ? <p className={print ? "hg-print-muted" : "mt-1 text-xs text-[#68716e]"}>แก้ไขล่าสุด {formatDateTime(review.amendedAt)}</p> : null}
    </div>
    <p className="hg-nihl-review-note mt-3 whitespace-pre-wrap text-sm leading-6">{review.reviewNote}</p>
    {review.identityScope === "EMPLOYEE_ONLY" ? <p className={print ? "hg-print-muted hg-nihl-review-scope" : "mt-3 text-xs leading-5 text-[#68716e]"}>ข้อมูลเฉพาะพนักงานรายนี้ ยังไม่เชื่อม HN ณ วันที่บันทึกการประเมิน อาจไม่รวมประวัติการได้ยินและการสัมผัสเสียงจากการทำงานที่อื่น</p> : null}
  </section>;
}
