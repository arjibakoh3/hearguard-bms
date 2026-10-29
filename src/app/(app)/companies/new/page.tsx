import Link from "next/link";
import { ArrowLeft, Building2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { getSingleQueryValue } from "@/lib/format";
import { requireHospitalAdmin } from "@/lib/server/current-actor";
import { createHospitalOrganization } from "../actions";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function NewCompanyPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireHospitalAdmin();
  const raw = await searchParams;
  const returnTo = getSingleQueryValue(raw.returnTo) === "/paperless-audiometry/new"
    ? "/paperless-audiometry/new"
    : "/companies";
  const error = getSingleQueryValue(raw.error);

  return <>
    <Link href={returnTo} className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-teal-700">
      <ArrowLeft aria-hidden="true" size={16} /> กลับ
    </Link>
    <PageHeader
      eyebrow="Hospital master data"
      title="เพิ่มบริษัท / สถานประกอบการ"
      description="สร้างข้อมูลกลางครั้งเดียวเพื่อให้ผู้ตรวจทุกคนเลือกชื่อบริษัทเดียวกัน ระบบจะสร้างรหัส ORG ให้อัตโนมัติ"
    />
    <section className="max-w-2xl rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      {error ? <div role="alert" className="mb-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div> : null}
      <div className="mb-5 flex size-11 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><Building2 aria-hidden="true" size={22} /></div>
      <form action={createHospitalOrganization} className="space-y-5">
        <input type="hidden" name="returnTo" value={returnTo} />
        <label className="block text-sm font-semibold text-slate-800">
          ชื่อบริษัทภาษาไทย <span className="text-rose-600">*</span>
          <input required name="nameTh" maxLength={300} autoFocus className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 font-normal outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100" />
        </label>
        <label className="block text-sm font-semibold text-slate-800">
          ชื่อบริษัทภาษาอังกฤษ <span className="font-normal text-slate-400">(ไม่บังคับ)</span>
          <input name="name" maxLength={300} className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 font-normal outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100" />
        </label>
        <p className="rounded-lg bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">ระบบตรวจชื่อภาษาไทยซ้ำโดยไม่สนตัวพิมพ์และช่องว่าง พร้อมบันทึก audit event ORGANIZATION_CREATED</p>
        <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-5">
          <Link href={returnTo} className="hg-interactive hg-pressable inline-flex h-10 items-center rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">ยกเลิก</Link>
          <button type="submit" className="hg-interactive hg-pressable inline-flex h-10 items-center rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800">เพิ่มบริษัท</button>
        </div>
      </form>
    </section>
  </>;
}
