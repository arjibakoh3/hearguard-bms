import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getBeerthipImportService } from "@/application/beerthip-import-service";
import { PageHeader } from "@/components/ui/page-header";
import { formatDate, formatNumber, getSingleQueryValue } from "@/lib/format";
import { requireCurrentActor } from "@/lib/server/current-actor";
import { attachBeerthipOriginals, reviewBeerthipFile } from "../../actions";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function BeerthipBatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const actor = await requireCurrentActor();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [record, query] = await Promise.all([getBeerthipImportService().get(id), searchParams]);
  if (!record) notFound();
  const { batch, rows, files } = record;
  const allSourcesVerified = files.length === batch.file_count && files.every((file) => file.source_status === "VERIFIED");
  const physicianForOrganization = actor.canReviewBaseline && actor.organizationIds.includes(batch.organization_id);
  const fileFilter = getSingleQueryValue(query.file) ?? "";
  const employeeFilter = (getSingleQueryValue(query.employee) ?? "").trim();
  const typeFilter = getSingleQueryValue(query.type) ?? "";
  const statusFilter = getSingleQueryValue(query.status) ?? "";
  const filtered = rows.filter((row) =>
    (!fileFilter || row.source_filename === fileFilter)
    && (!employeeFilter || row.employee_number.includes(employeeFilter))
    && (!typeFilter || row.exam_type === typeFilter)
    && (!statusFilter || row.classification === statusFilter));
  const visibleRows = filtered.slice(0, 100);
  const typeCounts = {
    BASELINE: rows.filter((row) => row.exam_type === "BASELINE").length,
    ANNUAL: rows.filter((row) => row.exam_type === "ANNUAL").length,
    CONFIRMATION: rows.filter((row) => row.exam_type === "CONFIRMATION").length,
  };
  const lateCount = rows.filter((row) => row.messages_json.some((item) => item.code === "LATE_CONFIRMATION")).length;
  const noResponseCount = rows.filter((row) => row.messages_json.some((item) => item.code === "NO_RESPONSE")).length;
  const error = getSingleQueryValue(query.error);

  return (
    <>
      <Link href="/imports" className="mb-5 inline-block text-sm font-medium text-teal-700 hover:underline">← กลับไปหน้าข้อมูลนำเข้า</Link>
      <PageHeader
        eyebrow="Beerthip Audio · XLSX staging"
        title="ตรวจ mapping ชุดไฟล์ผลการได้ยิน"
        description={`${formatNumber(batch.file_count)} ไฟล์ · อัปโหลด ${formatDate(batch.uploaded_at)} · สถานะ ${batch.status}`}
      />
      {error ? <div role="alert" className="mb-5 border-l-2 border-rose-600 bg-rose-50 px-5 py-3 text-sm text-rose-800">{error}</div> : null}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Summary label="พนักงาน" value={new Set(rows.map((row) => row.employee_number)).size} />
        <Summary label="Baseline" value={typeCounts.BASELINE} />
        <Summary label="Monitoring" value={typeCounts.ANNUAL} />
        <Summary label="Confirmed" value={typeCounts.CONFIRMATION} />
        <Summary label="คำเตือน" value={batch.warning_count} />
        <Summary label="ข้อผิดพลาด" value={batch.error_count} />
      </div>
      <div className="mt-5 border-l-2 border-teal-700 bg-teal-50 px-5 py-4 text-sm leading-6 text-teal-950">
        {files.filter((file) => file.review_status === "IMPORTED").length} จาก {batch.file_count} ไฟล์อนุมัติและนำเข้าแล้ว · รายอื่นยังอยู่ใน staging · Confirmed เกิน 30 วัน {formatNumber(lateCount)} รายการ · ผลไม่ตอบสนอง {formatNumber(noResponseCount)} จุด
      </div>
      <section className="mt-7 border-y border-slate-200 py-5">
        <h2 className="font-semibold text-slate-950">แผนกที่พบและรหัสสำหรับนำเข้า</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {batch.department_proposals_json.map((department) => (
            <div key={department.code} className="flex justify-between gap-3 border-b border-slate-100 py-2 text-sm">
              <span className="text-slate-700">{department.name}</span>
              <span className="shrink-0 font-mono text-xs text-slate-500">{department.code}{department.existing ? " ✓" : ""}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="mt-6 border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
        <h2 className="font-semibold">หลักฐานพักเสียงก่อน Baseline: ไม่ปรากฏในไฟล์</h2>
        <p className="mt-1">การอนุมัติย้อนหลังเป็นคำตัดสินของแพทย์เพื่อใช้ Baseline ในระบบ ไม่ใช่หลักฐานว่าพักเสียง 14 ชั่วโมงจริง และไม่ลดข้อกำหนดของการตรวจใหม่แบบ paperless</p>
        <p className="mt-2">ต้นฉบับตรวจ SHA-256 แล้ว {files.filter((file) => file.source_status === "VERIFIED").length}/{batch.file_count} ไฟล์ {allSourcesVerified ? "· เปิดให้แพทย์พิจารณารายคน" : "· ยังอนุมัติไม่ได้จนกว่าจะครบ"}</p>
        {actor.canManage && !allSourcesVerified ? <form action={attachBeerthipOriginals} className="mt-4 space-y-2">
          <input type="hidden" name="batchId" value={batch.id} />
          <label htmlFor="originals" className="block font-semibold">แนบไฟล์ XLSX ต้นฉบับกับ batch เดิม</label>
          <input id="originals" name="audioFiles" type="file" accept=".xlsx" multiple required className="block w-full text-sm" />
          <button className="bg-amber-800 px-4 py-2 font-semibold text-white">ตรวจ hash และแนบต้นฉบับ</button>
        </form> : null}
      </section>
      <section className="mt-7">
        <h2 className="font-semibold text-slate-950">แพทย์ทบทวนรายพนักงาน</h2>
        <p className="mt-1 text-sm text-slate-600">องค์กรปลายทาง: บริษัท เบียร์ทิพย์ บริวเวอรี่ (1991) จำกัด · ไม่มีปุ่มอนุมัติทั้งชุด</p>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {files.map((file) => {
            const fileRows = rows.filter((row) => row.source_filename === file.source_filename);
            const baseline = fileRows.find((row) => row.exam_type === "BASELINE");
            const warnings = fileRows.flatMap((row) => row.messages_json.map((item) => ({ ...item, sourceRow: row.source_row })));
            const hasError = fileRows.some((row) => row.classification === "ERROR") || !baseline;
            const canDecide = physicianForOrganization && !["REJECTED", "IMPORTED"].includes(file.review_status);
            return <article key={file.id} className="border border-slate-200 bg-white p-4 text-sm">
              <div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold text-slate-950">{baseline?.staged_data_json.firstName} {baseline?.staged_data_json.lastName} · {baseline?.employee_number ?? file.source_filename}</h3><span className="font-semibold text-teal-800">{file.review_status === "IMPORTED" ? "อนุมัติและนำเข้าแล้ว" : file.review_status === "REJECTED" ? "ปฏิเสธ" : file.review_status === "DEFERRED" ? "เลื่อน" : "รอตรวจ"}</span></div>
              <p className="mt-1 text-xs text-slate-500">{file.source_filename} · {fileRows.length} ผลตรวจ · ไฟล์ต้นฉบับ {file.source_status === "VERIFIED" ? "ตรวจ hash ผ่าน" : file.source_status === "FAILED" ? "hash ไม่ตรง" : "ยังไม่แนบ"}</p>
              {file.source_status === "VERIFIED" ? <a href={`/imports/beerthip/${batch.id}/files/${file.id}/download`} className="mt-2 inline-block font-semibold text-teal-700 hover:underline">เปิด XLSX ต้นฉบับ</a> : null}
              <details className="mt-3"><summary className="cursor-pointer font-semibold text-slate-800">ดู mapping, ผล 14 จุด และคำเตือนทั้งหมด</summary>
                <p className="mt-2">รหัสพนักงาน {baseline?.employee_number} · แผนก {baseline?.staged_data_json.department} · ชนิดและวันตรวจในตารางด้านล่าง</p>
                {fileRows.map((row) => <div key={row.id} className="mt-2 border-t border-slate-100 py-2">
                  <p className="font-semibold">แถว {row.source_row} · {row.exam_date} · {row.exam_type} · {row.classification === "READY" ? "ผ่าน" : row.classification === "WARNING" ? "คำเตือน" : "ผิดพลาด"}</p>
                  <p className="text-xs">{row.staged_data_json.observations.map((point) => `${point.ear === "RIGHT" ? "R" : "L"}${point.frequencyHz}:${point.responseStatus === "MEASURED" ? point.thresholdDbHl : point.responseStatus === "NO_RESPONSE" ? `NR@${point.noResponseAtDbHl}` : "NT"}`).join(" · ")}</p>
                  <p className="text-xs text-amber-800">{row.messages_json.map((item) => item.message).join(" · ") || "ไม่มีคำเตือน"}</p>
                </div>)}
              </details>
              {warnings.length > 0 ? <p className="mt-2 text-xs text-amber-800">คำเตือน/ผิดพลาด {warnings.length} รายการ: {warnings.map((item) => `แถว ${item.sourceRow}: ${item.message}`).join(" · ")}</p> : null}
              {file.review_note ? <p className="mt-2 text-xs text-slate-600">เหตุผลล่าสุด: {file.review_note}</p> : null}
              {canDecide ? <form action={reviewBeerthipFile} className="mt-4 space-y-2 border-t border-slate-100 pt-3">
                <input type="hidden" name="batchId" value={batch.id} /><input type="hidden" name="fileId" value={file.id} />
                <label htmlFor={`note-${file.id}`} className="block font-semibold">เหตุผลประกอบคำตัดสินแพทย์ (ไม่บังคับ)</label>
                <textarea id={`note-${file.id}`} name="reviewNote" maxLength={2000} rows={2} className="w-full border border-slate-200 p-2" />
                <p className="text-xs text-slate-500">หากระบุเหตุผล ต้องมี 10–2,000 ตัวอักษร</p>
                <label className="flex gap-2 text-xs"><input type="checkbox" name="acknowledgeWarnings" />รับทราบคำเตือนทั้งหมด รวมทั้งหลักฐานพักเสียงที่ไม่ปรากฏในไฟล์</label>
                <div className="flex flex-wrap gap-2">
                  <button name="decision" value="APPROVE" disabled={!allSourcesVerified || hasError} className="bg-teal-700 px-3 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">อนุมัติและนำเข้ารายนี้</button>
                  <button name="decision" value="DEFER" className="border border-slate-300 px-3 py-2">เลื่อน</button>
                  <button name="decision" value="REJECT" className="border border-rose-300 px-3 py-2 text-rose-800">ปฏิเสธ</button>
                </div>
              </form> : null}
            </article>;
          })}
        </div>
      </section>
      <section className="mt-7">
        <h2 className="font-semibold text-slate-950">ตรวจผลรายแถว</h2>
        <form method="get" className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <select name="file" defaultValue={fileFilter} aria-label="กรองตามไฟล์" className="h-10 border border-slate-200 bg-white px-2 text-sm">
            <option value="">ทุกไฟล์</option>
            {batch.source_files_json.map((file) => <option key={file.name} value={file.name}>{file.name}</option>)}
          </select>
          <input name="employee" defaultValue={employeeFilter} placeholder="รหัสพนักงาน" aria-label="กรองตามรหัสพนักงาน" className="h-10 border border-slate-200 bg-white px-3 text-sm" />
          <select name="type" defaultValue={typeFilter} aria-label="กรองตามชนิดผลตรวจ" className="h-10 border border-slate-200 bg-white px-2 text-sm">
            <option value="">ทุกชนิด</option><option value="BASELINE">Baseline</option><option value="ANNUAL">Monitoring</option><option value="CONFIRMATION">Confirmed</option>
          </select>
          <select name="status" defaultValue={statusFilter} aria-label="กรองตามสถานะ" className="h-10 border border-slate-200 bg-white px-2 text-sm">
            <option value="">ทุกสถานะ</option><option value="READY">ตรวจโครงสร้างผ่าน</option><option value="WARNING">ต้องทบทวน</option><option value="ERROR">ข้อผิดพลาด</option>
          </select>
          <button className="h-10 bg-slate-900 px-4 text-sm font-semibold text-white">กรองรายการ</button>
        </form>
        <p className="mt-3 text-xs text-slate-500">แสดง {formatNumber(visibleRows.length)} จาก {formatNumber(filtered.length)} รายการที่ตรงตัวกรอง</p>
        <div className="mt-3 overflow-x-auto border-y border-slate-200">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-3 py-3">ไฟล์ / แถว</th><th className="px-3 py-3">พนักงาน</th><th className="px-3 py-3">วันที่ตรวจ</th><th className="px-3 py-3">ชนิด</th><th className="px-3 py-3">ผล</th><th className="px-3 py-3">รายละเอียด</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {visibleRows.map((row) => <tr key={row.id}>
                <td className="px-3 py-3 font-mono text-xs">{row.source_filename}:{row.source_row}</td>
                <td className="px-3 py-3">{row.employee_number}<span className="mt-0.5 block text-xs text-slate-500">{row.staged_data_json.firstName} {row.staged_data_json.lastName}</span></td>
                <td className="px-3 py-3">{row.exam_date}</td>
                <td className="px-3 py-3">{row.exam_type}</td>
                <td className="px-3 py-3 font-semibold">{row.classification === "READY" ? "ตรวจโครงสร้างผ่าน" : row.classification === "WARNING" ? "ต้องทบทวน" : "ข้อผิดพลาด"}</td>
                <td className="px-3 py-3 text-xs text-slate-600">
                  <p>{row.messages_json.map((item) => item.message).join(" · ") || "—"}</p>
                  <details className="mt-1"><summary className="cursor-pointer font-semibold text-teal-700">ดู 14 จุดและต้นทาง</summary>
                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 font-mono">
                      {row.staged_data_json.observations.map((point) => <span key={`${point.ear}-${point.frequencyHz}`}>
                        {point.ear === "RIGHT" ? "R" : "L"}{point.frequencyHz}: {point.responseStatus === "MEASURED" ? point.thresholdDbHl : point.responseStatus === "NO_RESPONSE" ? `NR@${point.noResponseAtDbHl}` : "NT"}
                      </span>)}
                    </div>
                    <p className="mt-2">รอบปี {row.staged_data_json.sourceSurveillanceYear}; OSHA/NIOSH ต้นทาง: {Object.entries(row.staged_data_json.sourceInterpretations).map(([key, value]) => `${key}=${value || "—"}`).join(" · ")}</p>
                  </details>
                </td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return <div className="border-y border-slate-200 bg-white px-4 py-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-semibold text-slate-950">{formatNumber(value)}</p></div>;
}
