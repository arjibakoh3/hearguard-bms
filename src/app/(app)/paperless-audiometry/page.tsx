import Link from "next/link";
import { ClipboardPlus, FileText, Search, Settings } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { formatDateTime, getSingleQueryValue } from "@/lib/format";
import { audiogramTypeLabel } from "@/lib/hearing-labels";
import { requireHospitalClinicalActor } from "@/lib/server/current-actor";
import { getHearGuardPaperlessAudiometryService } from "@/lib/server/hearguard-paperless-audiometry-service";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function PaperlessAudiometryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await requireHospitalClinicalActor();
  const [raw, workspace] = await Promise.all([
    searchParams,
    getHearGuardPaperlessAudiometryService().getWorkspace(),
  ]);
  const q = getSingleQueryValue(raw.q)?.trim().toLocaleLowerCase("th-TH") ?? "";
  const status = getSingleQueryValue(raw.status) ?? "";
  const records = workspace.records.filter((record) => {
    const matchesQuery = !q || `${record.hospitalNumber} ${record.employeeNumber} ${record.employeeName}`
      .toLocaleLowerCase("th-TH").includes(q);
    return matchesQuery && (!status || record.recordStatus === status);
  });

  return <>
    <PageHeader
      eyebrow="Paperless audiometry · Hospital clinical team"
      title="บันทึกผลตรวจการได้ยิน"
      description="ค้นหา HN, บันทึกแบบซักประวัติและผล 7 ความถี่สองหู พร้อม Draft/Final/revision chain"
      actions={actor.canManage ? <div className="flex flex-wrap gap-2">{actor.role === "HOSPITAL_ADMIN" ? <Link href="/paperless-audiometry/equipment" className="hg-interactive hg-pressable inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Settings size={17} /> เครื่องตรวจ</Link> : null}<Link href="/paperless-audiometry/new" className="hg-interactive hg-pressable inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"><ClipboardPlus size={18} /> เริ่มบันทึกผลตรวจ</Link></div> : undefined}
    />

    <section className="hg-table-frame overflow-hidden">
      <form method="get" className="grid gap-3 border-b border-[#bcc4bf] bg-[#fafaf7]/75 p-4 sm:grid-cols-[1fr_220px_auto] sm:p-5">
        <label className="relative"><span className="sr-only">ค้นหารายการ</span><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input name="q" defaultValue={q} placeholder="HN / ชื่อ / รหัสพนักงาน" className="h-11 w-full rounded-lg border border-slate-200 pl-10 pr-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100" /></label>
        <select name="status" defaultValue={status} className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="">ทุกสถานะ</option><option value="DRAFT">Draft</option><option value="FINAL">Final</option><option value="SUPERSEDED">Superseded</option><option value="VOID">Void</option></select>
        <button className="hg-interactive hg-pressable h-11 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white">ค้นหา</button>
      </form>
      {records.length === 0 ? <div className="px-6 py-16 text-center"><FileText className="mx-auto text-slate-300" size={38} /><h2 className="mt-4 font-semibold text-slate-900">ไม่พบ electronic record</h2><p className="mt-1 text-sm text-slate-500">เริ่มบันทึกใหม่หรือเปลี่ยนตัวกรอง</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">HN / พนักงาน</th><th className="px-5 py-3">วันตรวจ</th><th className="px-5 py-3">ประเภท</th><th className="px-5 py-3">องค์กร</th><th className="px-5 py-3">สถานะ</th><th className="px-5 py-3">ผู้ตรวจ</th><th className="px-5 py-3"><span className="sr-only">เปิด</span></th></tr></thead><tbody className="divide-y divide-slate-100">{records.map((record) => <tr key={record.id} className="hover:bg-slate-50/70"><td className="px-5 py-4"><p className="font-mono text-xs font-semibold text-teal-700">HN {record.hospitalNumber}</p><p className="mt-1 font-semibold text-slate-900">{record.employeeName}</p><p className="mt-1 text-xs text-slate-500">{record.employeeNumber}</p></td><td className="px-5 py-4 text-slate-700">{formatDateTime(record.examinedAt)}</td><td className="px-5 py-4 font-semibold text-slate-700">{audiogramTypeLabel(record.examType)}</td><td className="px-5 py-4"><p>{record.organizationName}</p><p className="mt-1 text-xs text-slate-500">{record.departmentName ?? "ไม่ระบุแผนก"}</p></td><td className="px-5 py-4"><RecordStatus status={record.recordStatus} /><p className="mt-2 text-xs text-slate-500">{record.observationCount}/14 จุด</p></td><td className="px-5 py-4 text-slate-600">{record.examiner ?? "—"}</td><td className="px-5 py-4 text-right"><Link href={record.recordStatus === "DRAFT" && actor.canManage ? `/paperless-audiometry/${record.id}/edit` : `/paperless-audiometry/${record.id}`} className="font-semibold text-teal-700 hover:text-teal-900">{record.recordStatus === "DRAFT" && actor.canManage ? "บันทึกต่อ" : "เปิด record"}</Link></td></tr>)}</tbody></table></div>}
    </section>
  </>;
}

function RecordStatus({ status }: { status: "DRAFT" | "FINAL" | "SUPERSEDED" | "VOID" }) {
  const className = status === "FINAL" ? "text-[#1d6c67]" : status === "DRAFT" ? "text-[#a56817]" : status === "VOID" ? "text-[#a83232]" : "text-[#68716e]";
  const marker = status === "FINAL" ? "●" : status === "DRAFT" ? "◇" : status === "VOID" ? "×" : "—";
  return <span className={`inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold tracking-wide ${className}`}><span aria-hidden="true">{marker}</span>{status}</span>;
}
