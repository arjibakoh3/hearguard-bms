import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  FileCheck2,
  FileUp,
  ShieldCheck,
  TableProperties,
} from "lucide-react";
import { ImportBatchBadge, ImportWorkflow } from "@/components/imports/import-workflow";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatDate, formatNumber, getSingleQueryValue } from "@/lib/format";
import { audiogramTypeLabel } from "@/lib/hearing-labels";
import { getHearGuardImportService } from "@/lib/server/hearguard-import-service";
import { getBeerthipImportService } from "@/application/beerthip-import-service";
import { getHearGuardReadService } from "@/lib/server/hearguard-read-service";
import { requireCurrentActor } from "@/lib/server/current-actor";
import { uploadBeerthipFiles, uploadCsvBatch } from "./actions";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function ImportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const actor = await requireCurrentActor();
  if (!actor.canManage && !actor.canReviewBaseline) redirect("/workspace?denied=clinical");
  const query = await searchParams;
  const error = getSingleQueryValue(query.error);
  const [organizations, batches, beerthipBatches] = await Promise.all([
    actor.canManage ? getHearGuardReadService().listOrganizations() : Promise.resolve([]),
    actor.canManage ? getHearGuardImportService().listBatches() : Promise.resolve([]),
    getBeerthipImportService().list(),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Structured data intake"
        title="นำเข้าผลตรวจการได้ยิน"
        description="อัปโหลดไฟล์ผลตรวจ ตรวจ mapping และคำเตือนก่อนนำข้อมูลเข้าสู่เวชระเบียน"
      />

      {error ? (
        <div role="alert" className="mb-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      {actor.canManage ? <section className="mb-7 border-y border-[var(--hg-rule-strong)] bg-[var(--hg-surface)] p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><FileUp aria-hidden="true" size={22} /></span>
          <div>
            <h2 className="font-semibold text-slate-950">Beerthip Audio XLSX</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">เลือกไฟล์ Audio_*.xlsx ได้พร้อมกันสูงสุด 50 ไฟล์ ระบบจะตรวจทั้งชุดและเก็บไว้ใน staging</p>
          </div>
        </div>
        <form action={uploadBeerthipFiles} className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end">
          <label className="block flex-1 text-sm font-semibold text-slate-700">
            ไฟล์ผลตรวจ
            <input name="audioFiles" type="file" accept=".xlsx" multiple required className="mt-2 block w-full text-sm font-normal text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white" />
          </label>
          <SubmitButton pendingLabel="กำลังตรวจไฟล์…" className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-teal-700 px-5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60">ตรวจและจัดเก็บ staging <ArrowRight aria-hidden="true" size={17} /></SubmitButton>
        </form>
        <p className="mt-3 text-xs text-slate-500">องค์กรปลายทาง: บริษัท เบียร์ทิพย์ บริวเวอรี่ (1991) จำกัด · รวมไม่เกิน 5 MB</p>
      </section> : null}

      {beerthipBatches.length > 0 ? (
        <section className="hg-table-frame mb-7 overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-4"><h2 className="font-semibold text-slate-950">ชุดไฟล์ Beerthip</h2></div>
          <div className="divide-y divide-slate-100">
            {beerthipBatches.map((batch) => (
              <Link key={batch.id} href={`/imports/beerthip/${batch.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm hover:bg-slate-50">
                <span className="font-semibold text-slate-900">{formatNumber(batch.file_count)} ไฟล์ · {formatNumber(batch.row_count)} ผลตรวจ</span>
                <span className="text-slate-500">{batch.status} · {formatNumber(batch.warning_count)} คำเตือน · {formatNumber(batch.error_count)} ข้อผิดพลาด · {formatDate(batch.uploaded_at)}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {actor.canManage ? <>
      <ImportWorkflow currentStep={1} />
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="border-y border-[var(--hg-rule-strong)] bg-[var(--hg-surface)] p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              <FileUp aria-hidden="true" size={22} />
            </span>
            <div>
              <h2 className="font-semibold text-slate-950">นำเข้า CSV ทั่วไป</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">รองรับ CSV สูงสุด 750 KB หรือ 2,000 แถวต่อ batch</p>
            </div>
          </div>

          <form action={uploadCsvBatch} className="mt-6 space-y-5">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">สถานประกอบการ</span>
              <select name="organizationId" required className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100">
                <option value="">เลือกสถานประกอบการ</option>
                {organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>{organization.nameTh ?? organization.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">ประเภทการตรวจของ batch</span>
              <select name="examType" defaultValue="ANNUAL" className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100">
                <option value="ANNUAL">Annual surveillance</option>
                <option value="CONFIRMATION">ตรวจซ้ำภายใน 30 วัน</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
            <label className="hg-interactive block rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-6 text-center hover:border-teal-300 hover:bg-teal-50/40">
              <FileUp aria-hidden="true" className="mx-auto text-slate-400" size={28} />
              <span className="mt-3 block text-sm font-semibold text-slate-800">เลือกไฟล์ CSV</span>
              <span className="mt-1 block text-xs text-slate-500">ระบบยังไม่เขียน clinical data จนกว่าจะผ่าน validation และกดยืนยัน</span>
              <input name="csvFile" type="file" accept=".csv,text/csv" required className="mt-4 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white" />
            </label>
            <SubmitButton
              pendingLabel="กำลังอัปโหลด…"
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-5 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-wait disabled:opacity-60 sm:w-auto"
            >
              อัปโหลดและดูตัวอย่าง <ArrowRight aria-hidden="true" size={17} />
            </SubmitButton>
          </form>
        </section>

        <aside className="space-y-4">
          <div className="rounded-xl border border-teal-200 bg-teal-50 p-5">
            <div className="flex items-center gap-2 font-semibold text-teal-950"><ShieldCheck aria-hidden="true" size={19} /> กฎที่ทำงานอัตโนมัติ</div>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-teal-900">
              <li>• Thai Hearing Rule 2561 — ใช้สร้าง operational follow-up</li>
              <li>• OSHA STS — ตัวเปรียบเทียบแยกอิสระ ไม่เปลี่ยน workflow ไทย</li>
              <li>• NIOSH — ไม่รันอัตโนมัติ และไม่เปลี่ยน baseline</li>
            </ul>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2 font-semibold text-slate-900"><TableProperties aria-hidden="true" className="text-teal-700" size={19} /> Validation ก่อน commit</div>
            <p className="mt-2 text-sm leading-6 text-slate-500">ตรวจ employee number, วันที่, threshold 14 จุด, ช่วง -20 ถึง 140 dB HL, แผนก, รายการซ้ำ และการ match พนักงาน</p>
          </div>
        </aside>
      </div>

      <section className="hg-table-frame mt-7 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="font-semibold text-slate-950">ประวัติ import batch</h2>
            <p className="mt-1 text-sm text-slate-500">เก็บ mapping ผล validation และผลลัพธ์ของแต่ละ batch</p>
          </div>
          <FileCheck2 aria-hidden="true" className="text-slate-400" size={21} />
        </div>
        {batches.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-slate-500">ยังไม่มีประวัติการนำเข้า</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr><th className="px-5 py-3">ไฟล์</th><th className="px-5 py-3">สถานประกอบการ</th><th className="px-5 py-3">วันที่อัปโหลด</th><th className="px-5 py-3">แถว</th><th className="px-5 py-3">สถานะ</th><th className="px-5 py-3">ผลลัพธ์</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {batches.map((batch) => (
                  <tr key={batch.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-4"><Link href={`/imports/${batch.id}`} className="font-semibold text-slate-900 hover:text-teal-700">{batch.filename}</Link><p className="mt-1 text-xs text-slate-500">{audiogramTypeLabel(batch.examType)}</p></td>
                    <td className="px-5 py-4 text-slate-700">{batch.organizationNameTh ?? batch.organizationName}</td>
                    <td className="px-5 py-4 text-slate-600">{formatDate(batch.uploadedAt)}</td>
                    <td className="px-5 py-4 font-medium text-slate-700">{formatNumber(batch.rowsTotal)}</td>
                    <td className="px-5 py-4"><ImportBatchBadge status={batch.status} /></td>
                    <td className="px-5 py-4 text-xs text-slate-600">{batch.status === "COMPLETED" ? `${formatNumber(batch.audiogramsImported || batch.rowsSuccess)} audiograms` : `${batch.rowsWarning} warning · ${batch.rowsFailed} error`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      </> : null}
    </>
  );
}
