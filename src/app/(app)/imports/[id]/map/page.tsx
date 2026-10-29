import Link from "next/link";
import { ArrowLeft, ArrowRight, Columns3 } from "lucide-react";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ImportBatchBadge, ImportWorkflow } from "@/components/imports/import-workflow";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  autoMapCsvHeaders,
  CSV_IMPORT_FIELDS,
  type CsvColumnMapping,
} from "@/domain/imports/csv-audiometry-import";
import { getSingleQueryValue } from "@/lib/format";
import { getHearGuardImportService } from "@/lib/server/hearguard-import-service";
import { requireManagingActor } from "@/lib/server/current-actor";
import { validateCsvBatch } from "../../actions";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function ImportMappingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  await requireManagingActor();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [query, batch, rows] = await Promise.all([
    searchParams,
    getHearGuardImportService().getBatch(id),
    getHearGuardImportService().listBatchRows(id),
  ]);
  if (!batch) notFound();
  const error = getSingleQueryValue(query.error);
  const autoMapping = autoMapCsvHeaders(batch.headers);
  const mapping: CsvColumnMapping = { ...autoMapping, ...batch.columnMapping };
  const identityFields = CSV_IMPORT_FIELDS.slice(0, 5);
  const thresholdFields = CSV_IMPORT_FIELDS.slice(5);

  return (
    <>
      <Link href="/imports" className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-teal-700"><ArrowLeft aria-hidden="true" size={16} /> กลับไปหน้า import</Link>
      <PageHeader
        eyebrow="Structured data intake · Column mapping"
        title="จับคู่คอลัมน์ CSV"
        description={`${batch.filename} · ${batch.organizationNameTh ?? batch.organizationName} · ${batch.rowsTotal.toLocaleString("th-TH")} แถว`}
        actions={<ImportBatchBadge status={batch.status} />}
      />
      <ImportWorkflow currentStep={2} />

      {error ? <div role="alert" className="mb-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div> : null}

      <section className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4"><h2 className="font-semibold text-slate-950">ตัวอย่างข้อมูลต้นทาง</h2><p className="mt-1 text-sm text-slate-500">5 แถวแรกก่อนแปลงข้อมูล</p></div>
        <div className="overflow-x-auto">
          <table className="min-w-max text-left text-xs">
            <thead className="bg-slate-50 font-semibold text-slate-600"><tr><th className="sticky left-0 bg-slate-50 px-3 py-2.5">แถว</th>{batch.headers.map((header) => <th key={header} className="whitespace-nowrap px-3 py-2.5">{header}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">{rows.slice(0, 5).map((row) => <tr key={row.id}><td className="sticky left-0 bg-white px-3 py-2.5 font-semibold text-slate-500">{row.rowNumber}</td>{batch.headers.map((header) => <td key={header} className="max-w-48 truncate whitespace-nowrap px-3 py-2.5 text-slate-700">{row.source[header] || <span className="text-slate-300">—</span>}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </section>

      <form action={validateCsvBatch} className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <input type="hidden" name="batchId" value={batch.id} />
        <div className="flex items-start gap-3 border-b border-slate-200 px-5 py-4">
          <Columns3 aria-hidden="true" className="mt-0.5 text-teal-700" size={20} />
          <div><h2 className="font-semibold text-slate-950">Column mapping</h2><p className="mt-1 text-sm leading-6 text-slate-500">ระบบเดาชื่อคอลัมน์ที่พบบ่อยให้แล้ว โปรดตรวจทุกช่องก่อน validation</p></div>
        </div>
        <div className="p-5 sm:p-6">
          <h3 className="text-sm font-semibold text-slate-900">ข้อมูลพนักงานและวันที่ตรวจ</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {identityFields.map((field) => (
              <MappingSelect key={field.key} field={field} headers={batch.headers} value={mapping[field.key]} />
            ))}
          </div>
          <h3 className="mt-7 text-sm font-semibold text-slate-900">Hearing thresholds — ต้องครบ 14 จุด</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {thresholdFields.map((field) => (
              <MappingSelect key={field.key} field={field} headers={batch.headers} value={mapping[field.key]} />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-slate-500"><span className="font-semibold text-rose-600">*</span> ช่องบังคับ · ชื่อ นามสกุล และแผนกจำเป็นเมื่อสร้างพนักงานใหม่</p>
          <SubmitButton pendingLabel="กำลังตรวจสอบทุกแถว…" className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-teal-700 px-5 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-wait disabled:opacity-60">ตรวจสอบข้อมูล <ArrowRight aria-hidden="true" size={17} /></SubmitButton>
        </div>
      </form>
    </>
  );
}

function MappingSelect({
  field,
  headers,
  value,
}: {
  field: (typeof CSV_IMPORT_FIELDS)[number];
  headers: string[];
  value?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-700">{field.label} {field.required ? <span className="text-rose-600">*</span> : null}</span>
      <select name={`mapping.${field.key}`} defaultValue={value ?? ""} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100">
        <option value="">— ไม่จับคู่ —</option>
        {headers.map((header) => <option key={header} value={header}>{header}</option>)}
      </select>
    </label>
  );
}
