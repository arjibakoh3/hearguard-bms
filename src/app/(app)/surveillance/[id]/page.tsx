import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ArrowLeft, CheckCircle2, Clock3, FileClock, ShieldAlert, UserRound } from "lucide-react";
import type { FollowUpCaseStatus } from "@/application/view-models";
import { PageHeader } from "@/components/ui/page-header";
import { EvaluationBadge, StatusBadge } from "@/components/ui/status-badge";
import { formatDate, getSingleQueryValue } from "@/lib/format";
import { getHearGuardReadService } from "@/lib/server/hearguard-read-service";
import { requireCurrentActor } from "@/lib/server/current-actor";
import { advanceFollowUpCase } from "./actions";

const STATUS_LABEL: Record<FollowUpCaseStatus, string> = {
  SHIFT_DETECTED: "สร้างกำหนดตรวจซ้ำ",
  REPEAT_REQUIRED: "กำหนดให้ตรวจซ้ำ",
  REPEAT_COMPLETED: "บันทึกว่าตรวจซ้ำแล้ว",
  PHYSICIAN_REVIEW: "ส่งให้แพทย์ทบทวน",
  INTERVENTION_REQUIRED: "กำหนดมาตรการแทรกแซง",
  FOLLOW_UP: "เข้าสู่การติดตาม",
  CLOSED: "ปิดเคส",
};

function workflowHistoryLabel(status: string | null): string {
  if (status === "REPEAT_COMPLETED") return "ตรวจซ้ำแล้ว";
  if (status && status in STATUS_LABEL) {
    return STATUS_LABEL[status as FollowUpCaseStatus];
  }
  return status?.replaceAll("_", " ") ?? "—";
}

function DateRow({ label, value }: { label: string; value: string | null }) {
  return <div className="flex justify-between gap-4 py-2 text-sm"><dt className="text-slate-500">{label}</dt><dd className="text-right font-medium text-slate-800">{formatDate(value)}</dd></div>;
}

export default async function FollowUpCasePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [detail, actor] = await Promise.all([
    getHearGuardReadService().getFollowUpCase(id),
    requireCurrentActor(),
  ]);
  if (!detail) notFound();
  const updated = getSingleQueryValue((await searchParams).updated) === "1";

  return (
    <>
      <Link href="/surveillance" className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-teal-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"><ArrowLeft aria-hidden="true" size={16} /> กลับไป Surveillance queue</Link>
      <PageHeader
        eyebrow={`Follow-up case · ${detail.employeeNumber}`}
        title={detail.employeeName}
        description={`${detail.organizationName} · ${detail.departmentName ?? "ไม่ระบุแผนก"}`}
        actions={<StatusBadge status={detail.status} />}
      />
      {detail.historicalImport ? <p className="mb-5 border-l-2 border-amber-600 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950">นำเข้าย้อนหลัง · วันที่ตรวจและวันครบกำหนดมาจากไฟล์ต้นฉบับ ไม่ใช่วันที่นำเข้าระบบ</p> : null}

      {updated ? (
        <div className="mb-6 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800"><CheckCircle2 aria-hidden="true" size={18} /> อัปเดตสถานะและบันทึก audit log แล้ว</div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.45fr_0.8fr]">
        <div className="space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2"><ShieldAlert aria-hidden="true" className="text-amber-600" size={19} /><h2 className="font-semibold text-slate-950">Trigger evaluation</h2></div>
                <p className="mt-2 text-sm font-semibold text-slate-900">{detail.ruleName}</p>
                <p className="mt-1 text-xs text-slate-500">{detail.ruleCode} · v{detail.ruleVersion}</p>
              </div>
              <EvaluationBadge status={detail.evaluation.status} />
            </div>
            <div className="mt-5 space-y-3">
              {detail.evaluation.findings.map((finding) => (
                <dl key={`${finding.ear}-${finding.frequenciesHz.join("-")}`} className="grid gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:grid-cols-4">
                  <div><dt className="text-xs text-amber-700">ตำแหน่ง</dt><dd className="mt-1 text-sm font-semibold text-amber-950">{finding.ear === "RIGHT" ? "หูขวา" : "หูซ้าย"} · {finding.frequenciesHz.join("/")} Hz</dd></div>
                  <div><dt className="text-xs text-amber-700">Baseline</dt><dd className="mt-1 text-sm font-semibold text-amber-950">{finding.baselineDbHl} dB HL</dd></div>
                  <div><dt className="text-xs text-amber-700">Current</dt><dd className="mt-1 text-sm font-semibold text-amber-950">{finding.currentDbHl} dB HL</dd></div>
                  <div><dt className="text-xs text-amber-700">Change</dt><dd className="mt-1 text-sm font-semibold text-amber-950">+{finding.differenceDb} dB</dd></div>
                </dl>
              ))}
            </div>
            {detail.evaluation.recommendedAction ? <div className="mt-5 border-t border-slate-100 pt-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recommended next step</p><p className="mt-2 text-sm leading-6 text-slate-700">{detail.evaluation.recommendedAction}</p></div> : null}
          </section>

          {detail.interventionNotes ? (
            <section className="border-l-2 border-amber-500 bg-amber-50/50 p-5 sm:p-6">
              <h2 className="font-semibold text-slate-950">Intervention plan</h2>
              <p className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-700">{detail.interventionNotes}</p>
            </section>
          ) : null}

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center gap-2"><FileClock aria-hidden="true" className="text-teal-700" size={19} /><h2 className="font-semibold text-slate-950">Workflow history</h2></div>
            <ol className="mt-5 space-y-0">
              {detail.auditTrail.map((event, index) => (
                <li key={event.id} className="relative flex gap-3 pb-5 last:pb-0">
                  {index < detail.auditTrail.length - 1 ? <span aria-hidden="true" className="absolute left-[7px] top-4 h-full w-px bg-slate-200" /> : null}
                  <span className="relative z-10 mt-1.5 size-4 shrink-0 rounded-full border-4 border-white bg-teal-600 ring-1 ring-teal-200" />
                  <div><p className="text-sm font-semibold text-slate-900">{event.action.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-slate-500">{event.previousStatus ? `${workflowHistoryLabel(event.previousStatus)} → ` : ""}{workflowHistoryLabel(event.newStatus ?? detail.status)} · {formatDate(event.createdAt)}</p></div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2"><Clock3 aria-hidden="true" className="text-teal-700" size={19} /><h2 className="font-semibold text-slate-950">Milestones</h2></div>
            <dl className="mt-4 divide-y divide-slate-100">
              <DateRow label="Detected" value={detail.detectedDate} />
              <DateRow label="Repeat due" value={detail.repeatDueDate} />
              <DateRow label="Repeat completed" value={detail.repeatCompletedDate} />
              <DateRow label="Sent to physician review" value={detail.physicianReviewDate} />
              <DateRow label="Follow-up" value={detail.followUpDate} />
              <DateRow label="Closed" value={detail.closedDate} />
            </dl>
            {detail.isOverdue ? <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">Repeat audiometry overdue</p> : null}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2"><UserRound aria-hidden="true" className="text-teal-700" size={19} /><h2 className="font-semibold text-slate-950">Case ownership</h2></div>
            <dl className="mt-4 space-y-3 text-sm"><div className="flex justify-between gap-4"><dt className="text-slate-500">Assigned to</dt><dd className="font-medium text-slate-800">{detail.assignedTo ? detail.assignedTo.slice(0, 8) : "Unassigned"}</dd></div><div className="flex justify-between gap-4"><dt className="text-slate-500">Priority</dt><dd className="font-medium text-slate-800">{detail.priority ?? "NORMAL"}</dd></div></dl>
            <Link href={`/employees/${detail.employeeId}`} className="mt-4 inline-flex text-sm font-semibold text-teal-700 hover:text-teal-800 focus-visible:outline-2 focus-visible:outline-teal-600">เปิด employee profile →</Link>
          </section>

          <section className="rounded-xl border border-teal-200 bg-teal-50/60 p-5">
            <h2 className="font-semibold text-slate-950">Advance workflow</h2>
            {!actor.canManage ? (
              <p className="mt-3 text-sm leading-6 text-slate-600">บัญชีนี้เป็นสิทธิ์อ่านอย่างเดียว การเปลี่ยนสถานะสงวนไว้สำหรับทีมอาชีวอนามัย</p>
            ) : detail.allowedNextStatuses.length === 0 ? (
              <p className="mt-3 text-sm leading-6 text-slate-600">เคสนี้ปิดแล้ว ไม่มี transition ถัดไป</p>
            ) : (
              <div className="mt-4 space-y-2.5">
                {detail.allowedNextStatuses.map((status) => (
                  <form key={status} action={advanceFollowUpCase}>
                    <input type="hidden" name="caseId" value={detail.id} />
                    <input type="hidden" name="newStatus" value={status} />
                    <button type="submit" className={`w-full rounded-lg px-4 py-2.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 ${status === "CLOSED" ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50" : "bg-teal-700 text-white hover:bg-teal-800"}`}>{STATUS_LABEL[status]}</button>
                  </form>
                ))}
              </div>
            )}
            <p className="mt-4 text-xs leading-5 text-teal-900">ทุก transition ตรวจโดยฐานข้อมูลและบันทึก audit log</p>
          </section>
        </aside>
      </div>
    </>
  );
}
