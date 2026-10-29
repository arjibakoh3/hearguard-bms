import Link from "next/link";
import { ArrowLeft, CheckCircle2, FileWarning, ShieldAlert, TriangleAlert } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { ImportBatchBadge, ImportWorkflow } from "@/components/imports/import-workflow";
import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatNumber } from "@/lib/format";
import { getHearGuardImportService } from "@/lib/server/hearguard-import-service";
import { requireManagingActor } from "@/lib/server/current-actor";
import { commitCsvBatch } from "../../actions";

function normalizedText(normalized: Record<string, unknown> | null, key: string): string {
  const value = normalized?.[key];
  return typeof value === "string" ? value : "—";
}

function evaluationStatus(normalized: Record<string, unknown> | null, key: string): string {
  const evaluation = normalized?.[key];
  if (!evaluation || typeof evaluation !== "object") return "not_evaluable";
  const status = (evaluation as Record<string, unknown>).status;
  return typeof status === "string" ? status : "not_evaluable";
}

export default async function ImportValidationPage({ params }: { params: Promise<{ id: string }> }) {
  await requireManagingActor();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const service = getHearGuardImportService();
  const [batch, rows] = await Promise.all([service.getBatch(id), service.listBatchRows(id)]);
  if (!batch) notFound();
  if (batch.status === "UPLOADED") redirect(`/imports/${id}/map`);
  if (["COMPLETED", "FAILED", "ROLLED_BACK"].includes(batch.status)) redirect(`/imports/${id}`);

  const thaiPositive = rows.filter((row) => evaluationStatus(row.normalized, "thaiEvaluation") === "positive").length;
  const notEvaluable = rows.filter((row) => evaluationStatus(row.normalized, "thaiEvaluation") === "not_evaluable").length;
  const visibleRows = rows.slice(0, 250);

  return (
    <>
      <Link href={`/imports/${id}/map`} className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-teal-700"><ArrowLeft aria-hidden="true" size={16} /> กลับไปแก้ column mapping</Link>
      <PageHeader
        eyebrow="Structured data intake · Pre-commit validation"
        title="ตรวจสอบก่อนนำเข้า"
        description={`${batch.filename} · ทุกแถวต้องไม่มี ERROR ก่อน commit`}
        actions={<ImportBatchBadge status={batch.status} />}
      />
      <ImportWorkflow currentStep={3} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="แถวทั้งหมด" value={formatNumber(batch.rowsTotal)} icon={FileWarning} />
        <MetricCard label="พร้อมนำเข้า" value={formatNumber(batch.rowsSuccess)} icon={CheckCircle2} />
        <MetricCard label="คำเตือน" value={formatNumber(batch.rowsWarning)} icon={TriangleAlert} />
        <MetricCard label="ข้อผิดพลาด" value={formatNumber(batch.rowsFailed)} icon={ShieldAlert} />
        <MetricCard label="Thai shifts ที่คาด" value={formatNumber(thaiPositive)} detail={`${notEvaluable} แถว not evaluable`} icon={ShieldAlert} />
      </div>

      <div className="mt-6 rounded-xl border border-teal-200 bg-teal-50 px-5 py-4 text-sm leading-6 text-teal-950">
        หลัง commit ระบบจะสร้าง evaluation snapshot ของ <span className="font-semibold">Thai Hearing Rule 2561</span> และ <span className="font-semibold">OSHA STS</span> แยกกัน ส่วน NIOSH จะไม่รันอัตโนมัติและไม่เปลี่ยน operational baseline
      </div>

      {batch.rowsFailed > 0 ? (
        <div role="alert" className="mt-4 flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="font-semibold text-rose-900">ยังนำเข้าไม่ได้ — พบ {formatNumber(batch.rowsFailed)} แถวที่มี ERROR</p><p className="mt-1 text-sm text-rose-700">แก้ไฟล์หรือเปลี่ยน column mapping แล้วตรวจสอบใหม่</p></div>
          <Link href={`/imports/${id}/map`} className="inline-flex shrink-0 items-center justify-center rounded-lg bg-white px-4 py-2 text-sm font-semibold text-rose-700 shadow-sm ring-1 ring-rose-200">แก้ mapping</Link>
        </div>
      ) : (
        <form action={commitCsvBatch} className="mt-4 flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <input type="hidden" name="batchId" value={batch.id} />
          <div><p className="font-semibold text-emerald-950">พร้อม commit {formatNumber(batch.rowsTotal)} แถวแบบ transaction เดียว</p><p className="mt-1 text-sm text-emerald-700">หากแถวใดล้มเหลว ระบบจะไม่สร้าง audiogram บางส่วน</p></div>
          <SubmitButton pendingLabel="กำลังนำเข้าและประเมินผล…" className="inline-flex h-11 shrink-0 items-center justify-center rounded-lg bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60">ยืนยันการนำเข้าทั้ง batch</SubmitButton>
        </form>
      )}

      <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4"><h2 className="font-semibold text-slate-950">ผล validation รายแถว</h2><p className="mt-1 text-sm text-slate-500">READY นำเข้าได้ · WARNING นำเข้าได้หลังตรวจทาน · ERROR บล็อกทั้ง batch</p></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">แถว</th><th className="px-4 py-3">พนักงาน</th><th className="px-4 py-3">วันที่ตรวจ</th><th className="px-4 py-3">Match</th><th className="px-4 py-3">Thai</th><th className="px-4 py-3">OSHA</th><th className="px-4 py-3">Validation</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {visibleRows.map((row) => (
                <tr key={row.id} className="align-top hover:bg-slate-50/70">
                  <td className="px-4 py-4 font-semibold text-slate-500">{row.rowNumber}</td>
                  <td className="px-4 py-4"><p className="font-semibold text-slate-900">{normalizedText(row.normalized, "employeeNumber")}</p><p className="mt-1 text-xs text-slate-500">{normalizedText(row.normalized, "firstName")} {normalizedText(row.normalized, "lastName")}</p></td>
                  <td className="px-4 py-4 text-slate-700">{normalizedText(row.normalized, "examDate")}</td>
                  <td className="px-4 py-4 text-xs text-slate-600">{row.matchedEmployeeId ? "Existing employee" : "New employee"}</td>
                  <td className="px-4 py-4"><EvaluationLabel status={evaluationStatus(row.normalized, "thaiEvaluation")} /></td>
                  <td className="px-4 py-4"><EvaluationLabel status={evaluationStatus(row.normalized, "oshaEvaluation")} /></td>
                  <td className="px-4 py-4">
                    <RowClassification classification={row.classification} />
                    {row.messages.length > 0 ? <ul className="mt-2 max-w-md space-y-1 text-xs leading-5 text-slate-600">{row.messages.map((message, index) => <li key={`${message.code}-${index}`} className={message.severity === "ERROR" ? "text-rose-700" : "text-amber-700"}>• {message.message}</li>)}</ul> : <p className="mt-2 text-xs text-slate-400">ผ่านทุกเงื่อนไข</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > visibleRows.length ? <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">แสดง 250 แถวแรกจาก {formatNumber(rows.length)} แถว</p> : null}
      </section>
    </>
  );
}

function RowClassification({ classification }: { classification: "READY" | "WARNING" | "ERROR" | null }) {
  const config = classification === "READY"
    ? ["READY", "border-emerald-200 bg-emerald-50 text-emerald-700"]
    : classification === "WARNING"
      ? ["WARNING", "border-amber-200 bg-amber-50 text-amber-800"]
      : ["ERROR", "border-rose-200 bg-rose-50 text-rose-700"];
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold ${config[1]}`}>{config[0]}</span>;
}

function EvaluationLabel({ status }: { status: string }) {
  const className = status === "positive" ? "text-amber-700" : status === "negative" ? "text-emerald-700" : "text-slate-500";
  return <span className={`text-xs font-semibold capitalize ${className}`}>{status.replace("_", " ")}</span>;
}
