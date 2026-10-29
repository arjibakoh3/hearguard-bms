import Link from "next/link";
import { ArrowLeft, ClipboardCheck, FileWarning, History, ShieldCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PAPERLESS_HISTORY_QUESTIONS } from "@/application/paperless-audiometry-models";
import { getPersistedBaselineAudiogramId } from "@/application/audiogram-presentation";
import { ElectronicAudiogramChart } from "@/components/charts/hearing-visualizations";
import { PrintRecordButton } from "@/components/paperless/print-record-button";
import { AudiogramPrintDocument } from "@/components/reports/audiogram-print-document";
import { AaoHnsReferralPanel } from "@/components/reports/aao-hns-referral-panel";
import { buildPaperlessPrintModel } from "@/application/audiogram-print-model";
import { ImportantHearingHistoryCard } from "@/components/paperless/important-hearing-history-card";
import { PageHeader } from "@/components/ui/page-header";
import { formatDate, formatDateTime, getSingleQueryValue } from "@/lib/format";
import { audiogramTypeLabel } from "@/lib/hearing-labels";
import { requireHospitalClinicalActor } from "@/lib/server/current-actor";
import { getHearGuardPaperlessAudiometryService } from "@/lib/server/hearguard-paperless-audiometry-service";
import { getHearGuardReadService } from "@/lib/server/hearguard-read-service";
import { createPaperlessCorrection, proposePaperlessInitialBaseline } from "../actions";
import { getReportSigningState } from "@/lib/server/report-signer";
import { ReportSignature, ReportSignatureError } from "@/components/reports/report-signature";

export default async function PaperlessRecordPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id }, raw, actor] = await Promise.all([params, searchParams, requireHospitalClinicalActor()]);
  if (!z.uuid().safeParse(id).success) notFound();
  const service = getHearGuardPaperlessAudiometryService();
  const record = await service.getRecord(id);
  if (!record) notFound();
  const { signer, error: signerError } = record.recordStatus === "FINAL"
    ? await getReportSigningState() : { signer: null, error: null };
  const readService = getHearGuardReadService();
  const report = record.recordStatus === "FINAL"
    ? await readService.getEmployeeAudiogramReport(record.employeeId, record.id)
    : null;
  const profile = report ? null : await readService.getEmployeeProfile(record.employeeId);
  const evaluations = report?.evaluations ?? profile?.evaluations.filter((item) => item.currentAudiogramId === record.id) ?? [];
  const persistedBaselineId = getPersistedBaselineAudiogramId(
    evaluations,
    record.id,
  );
  const loadedBaseline = persistedBaselineId && persistedBaselineId !== record.id
    ? await service.getRecord(persistedBaselineId)
    : null;
  const baseline = loadedBaseline?.employeeId === record.employeeId
    ? loadedBaseline
    : null;
  const error = getSingleQueryValue(raw.error);
  const positiveHistory = record.historyResponses.filter((item) => item.answer === "YES");
  const deniedHistoryCount = record.historyResponses.filter((item) => item.answer === "NO").length;
  const unknownHistoryCount = record.historyResponses.filter((item) => item.answer === "UNKNOWN").length;

  return <><div className="paperless-print-root print:hidden">
    <div className="print:hidden"><Link href="/paperless-audiometry" className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-teal-700"><ArrowLeft size={16} /> กลับไปรายการบันทึก</Link></div>
    <PageHeader
      eyebrow={`Electronic audiometry record · ${record.recordStatus}`}
      title={`${record.employeeName} · HN ${record.hospitalNumber}`}
      description={`${record.organizationName} · ${record.departmentName ?? "ไม่ระบุแผนก"} · ${record.employeeNumber}`}
      actions={<PrintRecordButton disabled={Boolean(signerError)} />}
    />
    {raw.finalized === "1" ? <div className="mb-5 border-l-2 border-[var(--hg-petrol)] bg-[var(--hg-petrol-soft)] px-5 py-4 text-sm text-[var(--hg-petrol-deep)] print:hidden">Final record และ immutable Thai/OSHA evaluation snapshots ถูกบันทึกแล้ว · สร้าง/อัปเดต suggestion {Number(getSingleQueryValue(raw.suggestions) ?? 0).toLocaleString("th-TH")} รายการ</div> : null}
    {error ? <div className="mb-5 border-l-2 border-[var(--hg-critical)] bg-[var(--hg-critical-soft)] px-5 py-4 text-sm text-[var(--hg-critical)] print:hidden">{error}</div> : null}

    <section className="border-y border-[var(--hg-rule-strong)] bg-[var(--hg-surface)] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-teal-700">{audiogramTypeLabel(record.examType)}</p><h2 className="mt-1 text-lg font-semibold text-slate-950">ตรวจเมื่อ {formatDateTime(record.examinedAt)}</h2><p className="mt-1 text-sm text-slate-500">Record ID {record.id}</p></div><StatusBadge status={record.recordStatus} /></div>
      <dl className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Meta label="ผู้ตรวจ" value={record.examiner || "—"} /><Meta label="สถานที่" value={record.location || "—"} /><Meta label="Audiometer" value={`${record.audiometerModel || "—"} · ${record.audiometerSerial || "—"}`} /><Meta label="สอบเทียบ" value={`${formatDate(record.calibrationDate || null)} · ${record.equipmentCalibrationStatus ?? "Legacy"}`} /><Meta label="พักเสียง" value={record.pretest.quietPeriodHours === null ? record.pretest.quietPeriodAnswer : `${record.pretest.quietPeriodHours} ชั่วโมง`} /><Meta label="Valid" value={record.isValid ? "Yes" : "No"} /><Meta label="Finalized" value={formatDateTime(record.finalizedAt)} /><Meta label="Updated" value={formatDateTime(record.updatedAt)} /></dl>
      {record.validationNotes ? <p className="mt-5 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">Validation notes: {record.validationNotes}</p> : null}
    </section>

    <section className="hg-table-frame mt-6 overflow-hidden">
      <header className="border-b border-slate-200 px-5 py-4">
        <h2 className="font-semibold text-slate-950">Threshold observations</h2>
        <p className="mt-1 text-sm text-slate-500">ตารางและกราฟอ่านจาก record ฉบับนี้โดยตรง · NR และ Not tested แสดงตามที่บันทึก ไม่แทนด้วย 0</p>
      </header>
      <div className="grid xl:grid-cols-[0.8fr_1.2fr]">
        <div className="overflow-x-auto xl:border-r xl:border-[var(--hg-rule)]">
          <table className="w-full min-w-[420px] text-sm">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-500"><tr><th className="px-4 py-3 text-left">Hz</th><th className="px-4 py-3 text-left">Left</th><th className="px-4 py-3 text-left">Right</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{[500, 1000, 2000, 3000, 4000, 6000, 8000].map((frequency) => <tr key={frequency}><td className="px-4 py-3 font-semibold">{frequency}</td><td className="px-4 py-3"><ThresholdValue record={record} ear="LEFT" frequency={frequency} /></td><td className="px-4 py-3"><ThresholdValue record={record} ear="RIGHT" frequency={frequency} /></td></tr>)}</tbody>
          </table>
        </div>
        <div className="border-t border-[var(--hg-rule)] p-5 xl:border-t-0">
          <ElectronicAudiogramChart
            current={{ id: record.id, examDate: record.examDate, thresholds: record.thresholds }}
            baseline={baseline ? { id: baseline.id, examDate: baseline.examDate, thresholds: baseline.thresholds } : null}
          />
        </div>
      </div>
    </section>

    <section className="mt-6 border-y border-[var(--hg-rule-strong)] bg-[var(--hg-surface)] p-5">
      <p className="hg-technical-label">Clinical evaluation snapshots</p>
      {evaluations.length === 0 ? <p className="mt-4 text-sm leading-6 text-slate-500">Baseline/Other จะยังไม่รันกฎ ส่วน record ที่ขาด operational baseline อาจมีผล Not evaluable</p> : <div className="mt-4 grid gap-x-6 divide-y divide-[var(--hg-rule)] lg:grid-cols-2 lg:divide-y-0">{evaluations.map((evaluation) => <div key={evaluation.id} className="border-[var(--hg-rule)] py-4 lg:border-t"><div className="flex items-center justify-between gap-3"><p className="font-semibold text-slate-900">{evaluation.ruleName}</p><span className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--hg-ink-soft)]"><span className={`size-1.5 ${evaluation.status === "positive" ? "bg-[var(--hg-critical)]" : evaluation.status === "negative" ? "bg-[var(--hg-petrol)]" : "bg-[var(--hg-review)]"}`} />{evaluation.status}</span></div><p className="hg-mono mt-2 text-[10px] text-slate-500">{evaluation.ruleCode} · v{evaluation.ruleVersion}</p>{evaluation.explanation ? <p className="mt-3 text-sm leading-6 text-slate-700">{evaluation.explanation}</p> : null}</div>)}</div>}
    </section>

    {report ? <AaoHnsReferralPanel className="mt-6" current={report.referralScreening} originalBaseline={report.originalBaselineReferralScreening} />
      : <section className="mt-6 border-y border-[#bcc4bf] bg-[#fafaf7]/55 p-5 text-sm text-[#68716e]">AAO-HNS 1983: รอผลตรวจ Final จึงประเมินเกณฑ์ส่งต่อเชิงตัวเลข</section>}

    <ImportantHearingHistoryCard
      className="mt-6"
      conditions={record.importantHistorySnapshots}
      legacy={!record.importantHistorySnapshotPresent}
      title="Important hearing history snapshot"
    />

    <section className="mt-6 border-y border-[var(--hg-rule-strong)] bg-[var(--hg-surface)] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold text-slate-950">Pretest history snapshot</h2><p className="mt-1 text-sm text-slate-500">แสดงรายการที่ตอบ Yes เพื่อให้อ่านและพิมพ์ได้เร็ว</p></div><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">{historyCaptureLabel(record.pretest.historyCaptureMode)}</span></div>
      {record.historySource ? <p className="mt-4 rounded-lg bg-teal-50 px-4 py-3 text-sm text-teal-900">ยืนยัน/ปรับจาก record <Link href={`/paperless-audiometry/${record.historySource.id}`} className="font-semibold underline">{record.historySource.id.slice(0, 8)}…</Link> · ตรวจเมื่อ {formatDateTime(record.historySource.examinedAt)}</p> : null}
      {positiveHistory.length > 0 ? <div className="mt-4 grid gap-3 md:grid-cols-2">{positiveHistory.map((response) => <div key={response.questionCode} className="rounded-lg border border-amber-200 bg-amber-50 p-4"><p className="text-sm font-semibold text-amber-950">{historyQuestionLabel(response.questionCode)}</p><p className="mt-1 text-sm leading-6 text-amber-800">{response.earScope ? `${response.earScope} · ` : ""}{response.details || "ไม่มีรายละเอียดเพิ่มเติม"}</p></div>)}</div> : <p className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">ไม่พบรายการที่ตอบ Yes</p>}
      <p className="mt-4 text-sm text-slate-600">{deniedHistoryCount > 0 ? `รายการอื่นปฏิเสธ ${deniedHistoryCount} ข้อ` : "ไม่มีรายการที่ตอบ No"}{unknownHistoryCount > 0 ? ` · ไม่แน่ชัด ${unknownHistoryCount} ข้อ` : ""}</p>
      <details className="mt-4 rounded-lg border border-slate-200 print:hidden"><summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-700">ขยายดูคำตอบครบ 21 ข้อ</summary><div className="overflow-x-auto border-t border-slate-200"><table className="w-full min-w-[760px] text-sm"><thead className="bg-slate-50 text-xs font-semibold text-slate-500"><tr><th className="px-4 py-3 text-left">หัวข้อ</th><th className="px-4 py-3 text-left">คำตอบ</th><th className="px-4 py-3 text-left">ข้างหู</th><th className="px-4 py-3 text-left">รายละเอียด</th></tr></thead><tbody className="divide-y divide-slate-100">{PAPERLESS_HISTORY_QUESTIONS.map((question) => { const response = record.historyResponses.find((item) => item.questionCode === question.code); return <tr key={question.code}><td className="px-4 py-3 text-slate-800">{question.label}</td><td className="px-4 py-3 font-semibold">{response?.answer ?? "—"}</td><td className="px-4 py-3 text-slate-600">{response?.earScope ?? "—"}</td><td className="px-4 py-3 text-slate-600">{response?.details || "—"}</td></tr>; })}</tbody></table></div></details>
    </section>

    <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-semibold text-slate-950">Otoscopy</h2><div className="mt-4 grid gap-4 sm:grid-cols-2">{record.otoscopyFindings.map((finding) => <div key={finding.ear} className="rounded-lg bg-slate-50 p-4"><p className="font-semibold text-slate-900">{finding.ear} · {finding.examinationStatus}</p><p className="mt-2 text-sm leading-6 text-slate-600">{[finding.canalObstruction && "Canal obstruction", finding.abnormalTympanicMembrane && "Abnormal tympanic membrane", finding.perforation && "Perforation", finding.otherFinding && "Other finding"].filter(Boolean).join(" · ") || "No abnormal finding documented"}</p>{finding.notes ? <p className="mt-2 text-sm text-slate-600">{finding.notes}</p> : null}</div>)}</div></section>

    <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start gap-3"><History className="mt-0.5 text-teal-700" size={20} /><div><h2 className="font-semibold text-slate-950">Revision chain</h2><p className="mt-1 text-sm text-slate-500">Final ไม่ถูกแก้ทับ ฉบับแก้ไขจะสร้าง record ใหม่และเก็บฉบับเดิมเป็น Superseded</p></div></div><div className="mt-4 flex flex-wrap gap-3">{record.revisionChain.map((item) => <Link key={item.id} href={`/paperless-audiometry/${item.id}`} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${item.id === record.id ? "border-teal-300 bg-teal-50 text-teal-800" : "border-slate-200 text-slate-600"}`}>{item.recordStatus} · {formatDateTime(item.examinedAt)}</Link>)}</div></section>

    {record.recordStatus === "FINAL" && actor.canManage ? <section className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-5 print:hidden"><div className="flex flex-wrap items-center justify-between gap-4"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 text-slate-600" size={20} /><div><h2 className="font-semibold text-slate-950">Record governance</h2><p className="mt-1 text-sm leading-6 text-slate-600">Correction ไม่ปิด follow-up case อัตโนมัติ และ active baseline แก้ไขไม่ได้จนกว่าจะผ่าน baseline governance</p></div></div><div className="flex flex-wrap gap-3">{record.examType === "BASELINE" ? <form action={proposePaperlessInitialBaseline}><input type="hidden" name="audiogramId" value={record.id} /><button className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white"><ClipboardCheck size={17} /> เสนอเป็น baseline</button></form> : null}<form action={createPaperlessCorrection}><input type="hidden" name="sourceId" value={record.id} /><button className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-4 py-2.5 text-sm font-semibold text-amber-800"><FileWarning size={17} /> สร้างฉบับแก้ไข</button></form></div></div></section> : null}
    {signerError ? <ReportSignatureError message={signerError} /> : <ReportSignature signer={signer} />}
  </div>{!signerError ? <AudiogramPrintDocument model={buildPaperlessPrintModel(record, baseline, evaluations, report, signer)} record={record} /> : <div className="hidden print:block"><ReportSignatureError message={signerError} /></div>}</>;
}

function Meta({ label, value }: { label: string; value: string }) { return <div className="border-l border-[var(--hg-rule)] pl-3"><dt className="hg-technical-label">{label}</dt><dd className="hg-mono mt-1.5 text-sm font-semibold text-slate-900">{value}</dd></div>; }
function StatusBadge({ status }: { status: "DRAFT" | "FINAL" | "SUPERSEDED" | "VOID" }) { const cls = status === "FINAL" ? "bg-[var(--hg-petrol)]" : status === "DRAFT" ? "bg-[var(--hg-review)]" : status === "VOID" ? "bg-[var(--hg-critical)]" : "bg-[var(--hg-muted)]"; return <span className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--hg-ink-soft)]"><span className={`size-1.5 ${cls}`} />{status}</span>; }
function ThresholdValue({ record, ear, frequency }: { record: Awaited<ReturnType<ReturnType<typeof getHearGuardPaperlessAudiometryService>["getRecord"]>> & {}; ear: "LEFT" | "RIGHT"; frequency: number }) { const item = record?.thresholds.find((observation) => observation.ear === ear && observation.frequencyHz === frequency); if (!item) return <span className="text-slate-400">Missing</span>; if (item.responseStatus === "MEASURED") return <span className="font-semibold text-slate-900">{item.thresholdDbHl} dB HL</span>; if (item.responseStatus === "NO_RESPONSE") return <span className="font-semibold text-rose-700">NR @ {item.noResponseAtDbHl} dB HL</span>; return <span className="font-semibold text-amber-700">Not tested</span>; }
function historyQuestionLabel(code: string) { return PAPERLESS_HISTORY_QUESTIONS.find((item) => item.code === code)?.label ?? code; }
function historyCaptureLabel(mode: "QUICK_SCREEN" | "UNCHANGED_FROM_PRIOR" | "UPDATED_FROM_PRIOR" | "LEGACY_FULL") { return mode === "QUICK_SCREEN" ? "ซักแบบ Quick screen" : mode === "UNCHANGED_FROM_PRIOR" ? "ยืนยันจากครั้งก่อน" : mode === "UPDATED_FROM_PRIOR" ? "ปรับจากครั้งก่อน" : "แบบเดิมครบทุกข้อ"; }
