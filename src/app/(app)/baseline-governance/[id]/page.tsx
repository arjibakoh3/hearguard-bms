import Link from "next/link";
import { ArrowLeft, AudioLines, CalendarCheck2, CircleAlert, Landmark, ShieldCheck, Stethoscope } from "lucide-react";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageHeader } from "@/components/ui/page-header";
import {
  baselineReviewBadge,
  baselineReviewLabel,
  baselineSuggestionLabel,
} from "@/lib/baseline-governance-labels";
import { formatDate, formatDateTime } from "@/lib/format";
import { requireCurrentActor } from "@/lib/server/current-actor";
import { getHearGuardReadService } from "@/lib/server/hearguard-read-service";
import { reviewBaselineSuggestion } from "./actions";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function BaselineGovernanceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ id }, query, actor] = await Promise.all([params, searchParams, requireCurrentActor()]);
  if (!z.uuid().safeParse(id).success) notFound();
  const suggestion = await getHearGuardReadService().getBaselineGovernanceSuggestion(id);
  if (!suggestion) notFound();
  const canDecide = actor.canReviewBaseline
    && (suggestion.reviewStatus === "PENDING" || suggestion.reviewStatus === "DEFERRED");
  const isOshaRevision = suggestion.suggestionType.startsWith("OSHA_REVISED_BASELINE_CANDIDATE");
  const isThaiInitial = suggestion.suggestionType === "THAI_INITIAL_BASELINE_CANDIDATE";
  const currentThaiBaselines = suggestion.baselineHistory.filter(
    (version) => version.frameworkOrContext === "THAI_OPERATIONAL" && version.status === "ACTIVE",
  );
  const sourceBaseline = suggestion.baselineHistory.find(
    (version) => version.id === suggestion.activeBaselineHistoryId,
  );

  return (
    <>
      <Link href="/baseline-governance" className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-teal-700"><ArrowLeft aria-hidden="true" size={16} /> กลับไป Baseline governance</Link>
      <PageHeader
        eyebrow={`${suggestion.framework} · ${suggestion.earScope} · ${suggestion.employeeNumber}`}
        title={baselineSuggestionLabel(suggestion.suggestionType)}
        description={`${suggestion.employeeName} · ${suggestion.organizationNameTh ?? suggestion.organizationName}`}
        actions={<span className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-semibold ${baselineReviewBadge(suggestion.reviewStatus)}`}>{baselineReviewLabel(suggestion.reviewStatus)}</span>}
      />

      {query.reviewed === "1" ? <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">บันทึกการตัดสินใจของแพทย์และ audit event เรียบร้อยแล้ว</div> : null}

      <section className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-5 py-4">
        <div className="flex items-start gap-3"><ShieldCheck aria-hidden="true" className="mt-0.5 shrink-0 text-rose-700" size={20} /><div><h2 className="font-semibold text-rose-950">คำเตือนก่อนตัดสินใจ</h2>{isThaiInitial ? <p className="mt-1 text-sm leading-6 text-rose-900">การอนุมัติรายการนี้จะกำหนด <strong>Thai operational baseline ครั้งแรก</strong> ต้องตรวจความครบถ้วนและความถูกต้องของ Final Baseline โดยแพทย์ก่อนทุกครั้ง</p> : <><p className="mt-1 text-sm leading-6 text-rose-900">การอนุมัติ OSHA candidate จะสร้าง baseline version ใหม่ในบริบท <strong>OSHA_ANALYTICAL</strong> เท่านั้น Historical evaluations จะไม่ถูกเขียนทับ และ Thai operational baseline/Thai follow-up จะไม่เปลี่ยน</p><p className="mt-2 text-sm leading-6 text-rose-900">OSHA/NIOSH suggestion ไม่อนุญาตให้เปลี่ยน Thai operational baseline หรือ Thai follow-up</p></>}</div></div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SequenceCard
          icon={Landmark}
          label="Current Thai baseline"
          value={currentThaiBaselines.length === 1 ? formatDate(currentThaiBaselines[0]?.baselineDate ?? null) : `${currentThaiBaselines.length} active versions`}
          detail={currentThaiBaselines.map((version) => `${version.earScope}: ${formatDate(version.baselineDate)}`).join(" · ") || "ไม่พบ active Thai baseline"}
        />
        <SequenceCard icon={AudioLines} label={isThaiInitial ? "Initial baseline candidate" : "Monitoring"} value={formatDate(isThaiInitial ? suggestion.candidateDate : suggestion.monitoringDate)} />
        <SequenceCard icon={CalendarCheck2} label="Immediate retest (legacy)" value={formatDate(suggestion.immediateRetestDate)} />
        <SequenceCard icon={Stethoscope} label="Confirmation" value={formatDate(suggestion.confirmationDate)} detail={suggestion.confirmationQuietHours === null ? "Quiet period not documented" : `${suggestion.confirmationQuietHours} ชั่วโมงหลังสัมผัสเสียง`} />
      </div>

      <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4 sm:px-6">
          <h2 className="font-semibold text-slate-950">Baseline version history</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">แยก operational baseline, analytical reference และ historical versions อย่างชัดเจน รายการเดิมไม่ถูกแก้ทับ</p>
        </div>
        {suggestion.baselineHistory.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[940px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr><th className="px-5 py-3 sm:px-6">Context</th><th className="px-5 py-3">Ear</th><th className="px-5 py-3">Audiogram</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Effective</th><th className="px-5 py-3">Governance</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {suggestion.baselineHistory.map((version) => (
                  <tr key={version.id} className={version.id === sourceBaseline?.id ? "bg-teal-50/50" : undefined}>
                    <td className="px-5 py-4 sm:px-6"><p className="font-semibold text-slate-900">{version.frameworkOrContext}</p>{version.id === sourceBaseline?.id ? <p className="mt-1 text-[11px] font-semibold text-teal-700">USED BY THIS SUGGESTION</p> : null}</td>
                    <td className="px-5 py-4 text-slate-700">{version.earScope}</td>
                    <td className="px-5 py-4 font-medium text-slate-800">{formatDate(version.baselineDate)}</td>
                    <td className="px-5 py-4"><BaselineVersionStatus status={version.status} /></td>
                    <td className="px-5 py-4 text-slate-600">{formatDate(version.effectiveFrom)} → {version.effectiveTo ? formatDate(version.effectiveTo) : "ปัจจุบัน"}</td>
                    <td className="px-5 py-4 text-slate-600"><p>{version.reasonCode}</p><p className="mt-1 text-xs text-slate-500">{version.approvedAt ? `Physician approval: ${formatDateTime(version.approvedAt)}` : "Initial designation / no approval record"}</p></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="px-5 py-6 text-sm text-slate-500 sm:px-6">ไม่พบ baseline history สำหรับพนักงานรายนี้</p>}
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="font-semibold text-slate-950">Interpretation evidence</h2>
          <dl className="mt-5 space-y-4 text-sm">
            <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">ข้อสังเกต</dt><dd className="mt-1.5 leading-6 text-slate-800">{suggestion.explanation}</dd></div>
            <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Required action</dt><dd className="mt-1.5 leading-6 text-slate-800">{suggestion.requiredAction}</dd></div>
            <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Qualitative state</dt><dd className="mt-1.5 font-semibold text-slate-800">{suggestion.qualitativeState}</dd></div>
          </dl>
          <div className="mt-5 grid gap-3 sm:grid-cols-2"><SafetyCheck label="Automatic baseline change" safe={!suggestion.automaticBaselineChange} /><SafetyCheck label="Thai follow-up mutation" safe={!suggestion.thaiFollowUpMutation} /></div>
        </section>
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 px-5 py-4"><h2 className="font-semibold text-slate-950">Structured evidence</h2></div><pre className="max-h-[28rem] overflow-auto bg-slate-950 p-5 text-xs leading-6 text-slate-200">{JSON.stringify(suggestion.evidence, null, 2)}</pre></section>
      </div>

      {canDecide ? (
        <section className="mt-6 rounded-xl border border-teal-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3"><Stethoscope aria-hidden="true" className="mt-0.5 text-teal-700" size={21} /><div><h2 className="font-semibold text-slate-950">Physician decision</h2><p className="mt-1 text-sm leading-6 text-slate-500">บันทึกเหตุผลก่อน Approve, Reject หรือ Defer ทุกครั้ง {isThaiInitial ? "Approve จะสร้าง Thai operational baseline ครั้งแรก" : isOshaRevision ? "Approve จะสร้าง OSHA analytical baseline version ใหม่" : "NIOSH approval เป็นการรับรองผลทบทวนและไม่สร้าง baseline ใหม่"}</p></div></div>
          <form action={reviewBaselineSuggestion} className="mt-5">
            <input type="hidden" name="suggestionId" value={suggestion.id} />
            <label><span className="mb-2 block text-sm font-semibold text-slate-700">เหตุผลประกอบการตัดสินใจ</span><textarea name="reviewNote" required minLength={8} maxLength={2000} rows={5} placeholder="ระบุหลักฐาน การพิจารณาทางวิชาชีพ และเหตุผล…" className="w-full rounded-lg border border-slate-200 px-3.5 py-3 text-sm leading-6 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100" /></label>
            <div className="mt-4 flex flex-wrap gap-3"><button type="submit" name="decision" value="APPROVE" className="rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800">Approve</button><button type="submit" name="decision" value="REJECT" className="rounded-lg border border-rose-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50">Reject</button><button type="submit" name="decision" value="DEFER" className="rounded-lg border border-sky-200 bg-white px-4 py-2.5 text-sm font-semibold text-sky-700 hover:bg-sky-50">Defer</button></div>
          </form>
        </section>
      ) : (
        <section className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm leading-6 text-slate-600"><div className="flex items-start gap-2"><CircleAlert aria-hidden="true" className="mt-0.5 shrink-0" size={18} /><p>{suggestion.reviewStatus === "APPROVED" || suggestion.reviewStatus === "REJECTED" ? `ตัดสินใจโดย ${suggestion.reviewedByEmail ?? "assigned physician"} เมื่อ ${formatDateTime(suggestion.reviewedAt)} — ${suggestion.reviewNote ?? "ไม่พบหมายเหตุ"}` : "หน้าจอนี้เป็น read-only สำหรับบทบาทปัจจุบัน การตัดสินใจสงวนไว้สำหรับ Occupational physician ที่ได้รับมอบหมาย"}</p></div></section>
      )}
    </>
  );
}

function SequenceCard({ icon: Icon, label, value, detail }: { icon: typeof Landmark; label: string; value: string; detail?: string }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700"><Icon aria-hidden="true" size={18} /></span><div><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>{detail ? <p className="mt-1 text-[11px] leading-5 text-slate-500">{detail}</p> : null}</div></div></div>;
}

function SafetyCheck({ label, safe }: { label: string; safe: boolean }) {
  return <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5"><p className="text-xs text-emerald-700">{label}</p><p className="mt-1 text-sm font-semibold text-emerald-900">{safe ? "NO" : "YES"}</p></div>;
}

function BaselineVersionStatus({ status }: { status: "ACTIVE" | "SUPERSEDED" | "REJECTED" }) {
  const className = status === "ACTIVE"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : status === "SUPERSEDED"
      ? "border-slate-200 bg-slate-50 text-slate-600"
      : "border-rose-200 bg-rose-50 text-rose-700";
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${className}`}>{status}</span>;
}
