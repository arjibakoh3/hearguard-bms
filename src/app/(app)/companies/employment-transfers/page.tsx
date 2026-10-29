import Link from "next/link";
import { ArrowLeft, ArrowRightLeft, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { formatDate, getSingleQueryValue } from "@/lib/format";
import { requireHospitalAdmin } from "@/lib/server/current-actor";
import { getHearGuardPaperlessAudiometryService } from "@/lib/server/hearguard-paperless-audiometry-service";
import { completeHospitalEmploymentTransfer } from "../actions";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function EmploymentTransfersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireHospitalAdmin();
  const [raw, transitions] = await Promise.all([
    searchParams,
    getHearGuardPaperlessAudiometryService().listPendingEmploymentTransitions(),
  ]);
  const error = getSingleQueryValue(raw.error);
  const completed = getSingleQueryValue(raw.completed) === "1";

  return <>
    <Link href="/companies" className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-teal-700"><ArrowLeft aria-hidden="true" size={16} /> กลับไปสถานประกอบการ</Link>
    <PageHeader eyebrow="Hospital administration" title="รายการย้ายบริษัทที่รออนุมัติ" description="เกิดเมื่อเจ้าหน้าที่สร้าง employment ใหม่ได้ แต่ไม่มีสิทธิ์ปิด employment ของบริษัทเดิม" />
    {completed ? <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">อนุมัติการย้ายบริษัทแล้ว</div> : null}
    {error ? <div role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800">{error}</div> : null}
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {transitions.length === 0 ? <div className="px-6 py-16 text-center"><CheckCircle2 className="mx-auto text-emerald-500" size={40} /><h2 className="mt-4 font-semibold text-slate-900">ไม่มีรายการค้างอนุมัติ</h2><p className="mt-1 text-sm text-slate-500">Employment transfer ทุกคำขอได้รับการจัดการแล้ว</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">HN / บุคคล</th><th className="px-5 py-3">จากบริษัท</th><th className="px-5 py-3">ไปบริษัท</th><th className="px-5 py-3">วันที่มีผล</th><th className="px-5 py-3"><span className="sr-only">อนุมัติ</span></th></tr></thead><tbody className="divide-y divide-slate-100">{transitions.map((transition) => <tr key={transition.id}><td className="px-5 py-4"><p className="font-mono text-xs font-semibold text-teal-700">HN {transition.hospitalNumber}</p><p className="mt-1 font-semibold text-slate-900">{transition.employeeName}</p></td><td className="px-5 py-4 text-slate-700">{transition.fromOrganizationName}</td><td className="px-5 py-4 text-slate-700">{transition.toOrganizationName}</td><td className="px-5 py-4 text-slate-700">{formatDate(transition.effectiveDate)}</td><td className="px-5 py-4 text-right"><form action={completeHospitalEmploymentTransfer}><input type="hidden" name="transitionId" value={transition.id} /><button className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-3.5 py-2 text-sm font-semibold text-white hover:bg-teal-800"><ArrowRightLeft aria-hidden="true" size={16} /> อนุมัติและปิดบริษัทเดิม</button></form></td></tr>)}</tbody></table></div>}
    </section>
  </>;
}
