import Link from "next/link";
import { ArrowLeft, AudioLines, CheckCircle2, ClipboardList, FileCheck2, RefreshCw, UserPlus, Users } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { ImportBatchBadge, ImportWorkflow } from "@/components/imports/import-workflow";
import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { formatDate, formatNumber, getSingleQueryValue } from "@/lib/format";
import { getHearGuardImportService } from "@/lib/server/hearguard-import-service";
import { requireManagingActor } from "@/lib/server/current-actor";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function ImportBatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  await requireManagingActor();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [batch, query] = await Promise.all([getHearGuardImportService().getBatch(id), searchParams]);
  if (!batch) notFound();
  if (batch.status === "UPLOADED") redirect(`/imports/${id}/map`);
  if (["VALIDATING", "READY", "IMPORTING"].includes(batch.status)) redirect(`/imports/${id}/validate`);
  const error = getSingleQueryValue(query.error) ?? batch.errorMessage;
  const importedCount = batch.audiogramsImported || batch.rowsSuccess;
  const legacySeedBatch = batch.status === "COMPLETED" && batch.headers.length === 0;

  return (
    <>
      <Link href="/imports" className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-teal-700"><ArrowLeft aria-hidden="true" size={16} /> กลับไปประวัติ import</Link>
      <PageHeader
        eyebrow="Structured data intake · Summary"
        title={batch.status === "COMPLETED" ? "นำเข้าข้อมูลสำเร็จ" : "นำเข้าข้อมูลไม่สำเร็จ"}
        description={`${batch.filename} · ${batch.organizationNameTh ?? batch.organizationName} · ${formatDate(batch.completedAt ?? batch.uploadedAt)}`}
        actions={<ImportBatchBadge status={batch.status} />}
      />
      <ImportWorkflow currentStep={4} />

      {error ? <div role="alert" className="mb-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div> : null}

      {batch.status === "COMPLETED" ? (
        <>
          <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4">
            <div className="flex items-center gap-2 font-semibold text-emerald-950"><CheckCircle2 aria-hidden="true" size={20} /> Batch commit เสร็จสมบูรณ์</div>
            <p className="mt-1 text-sm leading-6 text-emerald-800">Audiograms และ thresholds ถูกบันทึกครบ พร้อม evaluation ไทย/OSHA และ follow-up จากกฎไทยตามผลจริง</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard label="Existing matched" value={formatNumber(batch.existingEmployeesMatched)} icon={Users} />
            <MetricCard label="New employees" value={formatNumber(batch.newEmployeesCreated)} icon={UserPlus} />
            <MetricCard label="Audiograms" value={formatNumber(importedCount)} icon={AudioLines} />
            <MetricCard label="Thai shifts" value={formatNumber(batch.thresholdShiftsDetected)} icon={FileCheck2} />
            <MetricCard label="Follow-up cases" value={formatNumber(batch.followUpCasesCreated)} icon={ClipboardList} />
          </div>
          {legacySeedBatch ? <p className="mt-3 text-xs text-slate-500">Batch สังเคราะห์รุ่นเดิมมีเฉพาะจำนวนแถวเดิม ไม่มีรายละเอียด mapping และตัวนับ outcome ชุดใหม่</p> : null}
          <div className="mt-7 grid gap-4 sm:grid-cols-3">
            <SummaryLink href="/audiograms" title="ดู Audiograms" description="ตรวจรายการที่นำเข้าและ raw thresholds" />
            <SummaryLink href="/surveillance" title="เปิด Surveillance queue" description="ติดตามเคสที่สร้างจากกฎไทย" />
            <SummaryLink href="/workspace" title="กลับ Dashboard" description="ดู metrics ระดับประชากรที่อัปเดตแล้ว" />
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-rose-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3"><span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-700"><RefreshCw aria-hidden="true" size={21} /></span><div><h2 className="font-semibold text-slate-950">ไม่มี clinical data บางส่วนถูกบันทึก</h2><p className="mt-1 text-sm leading-6 text-slate-500">Transaction ถูกยกเลิกทั้ง batch คุณสามารถกลับไปตรวจ mapping และ validation ใหม่ได้</p></div></div>
          <Link href={`/imports/${id}/map`} className="mt-5 inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">ตรวจสอบ batch ใหม่</Link>
        </div>
      )}
    </>
  );
}

function SummaryLink({ href, title, description }: { href: string; title: string; description: string }) {
  return <Link href={href} className="hg-surface-interactive rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-teal-300"><p className="font-semibold text-slate-900">{title}</p><p className="mt-1 text-sm leading-6 text-slate-500">{description}</p></Link>;
}
