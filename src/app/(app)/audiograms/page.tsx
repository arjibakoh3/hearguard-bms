import Link from "next/link";
import { AudioLines, CheckCircle2, Search, SlidersHorizontal, TriangleAlert } from "lucide-react";
import type { AudiogramListItem } from "@/application/view-models";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { formatDate, getSingleQueryValue } from "@/lib/format";
import { AUDIOGRAM_TYPE_OPTIONS, audiogramTypeLabel } from "@/lib/hearing-labels";
import { getHearGuardReadService } from "@/lib/server/hearguard-read-service";
import { requireCurrentActor } from "@/lib/server/current-actor";

type SearchParams = Record<string, string | string[] | undefined>;

function validExamType(value?: string): AudiogramListItem["examType"] | undefined {
  return AUDIOGRAM_TYPE_OPTIONS.some((option) => option.value === value)
    ? (value as AudiogramListItem["examType"])
    : undefined;
}

export default async function AudiogramsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const [raw, actor] = await Promise.all([searchParams, requireCurrentActor()]);
  const query = getSingleQueryValue(raw.q);
  const organizationId = getSingleQueryValue(raw.organization);
  const examType = validExamType(getSingleQueryValue(raw.type));
  const yearValue = Number(getSingleQueryValue(raw.year));
  const year = Number.isInteger(yearValue) && yearValue > 2000 ? yearValue : undefined;
  const page = Number(getSingleQueryValue(raw.page) ?? 1);
  const result = await getHearGuardReadService().searchAudiograms({
    query,
    organizationId,
    examType,
    year,
    page,
  });

  return (
    <>
      <PageHeader
        eyebrow="Audiogram records"
        title="รายการตรวจการได้ยิน"
        description="ประเภทการตรวจบอกวัตถุประสงค์และตำแหน่งในลำดับติดตาม ไม่ได้บอกเพียงว่าเป็นการตรวจครั้งที่เท่าไร"
        actions={actor.canManage ? <Link href="/paperless-audiometry/new" className="hg-interactive hg-pressable rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800">บันทึกผลตรวจใหม่</Link> : undefined}
      />

      <dl className="mb-6 grid border-y border-[var(--hg-rule-strong)] bg-[var(--hg-surface)] md:grid-cols-3">
        <div className="border-b border-[var(--hg-rule)] px-5 py-4 md:border-b-0 md:border-r">
          <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--hg-petrol)]">Annual monitoring</dt>
          <dd className="mt-1.5 text-sm leading-6 text-[var(--hg-ink-soft)]">ตรวจเฝ้าระวังตามรอบ และเป็น Monitoring ต้นเหตุเมื่อพบ shift</dd>
        </div>
        <div className="border-b border-[var(--hg-rule)] px-5 py-4 md:border-b-0 md:border-r">
          <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--hg-info)]">ตรวจซ้ำภายใน 30 วัน</dt>
          <dd className="mt-1.5 text-sm leading-6 text-[var(--hg-ink-soft)]">การติดตามตาม workflow ไทยจัดเก็บเป็น Confirmation และ Final ได้โดยไม่บังคับให้พักเสียงครบ 12 ชั่วโมง</dd>
        </div>
        <div className="px-5 py-4">
          <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--hg-review)]">NIOSH evidence</dt>
          <dd className="mt-1.5 text-sm leading-6 text-[var(--hg-ink-soft)]">วิเคราะห์แยกจาก workflow ไทย โดยต้องพักเสียง ≥12 ชั่วโมง ไม่มีเสียงดังจากงาน/นอกงาน และไม่ใช้ PPE แทนการพัก</dd>
        </div>
      </dl>

      <section className="hg-table-frame overflow-hidden">
        <form method="get" className="border-b border-slate-200 p-4 sm:p-5">
          <div className="grid gap-3 lg:grid-cols-[minmax(220px,1.4fr)_1fr_0.8fr_0.7fr_auto]">
            <label className="relative">
              <span className="sr-only">ค้นหา audiogram</span>
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="search"
                name="q"
                defaultValue={query}
                placeholder="รหัสหรือชื่อพนักงาน"
                className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              />
            </label>
            <select
              aria-label="สถานประกอบการ"
              name="organization"
              defaultValue={organizationId ?? ""}
              className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            >
              <option value="">ทุกสถานประกอบการ</option>
              {result.organizations.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
            <select
              aria-label="ชนิดการตรวจ"
              name="type"
              defaultValue={examType ?? ""}
              className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            >
              <option value="">ทุกชนิดการตรวจ</option>
              {AUDIOGRAM_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <select
              aria-label="ปีที่ตรวจ"
              name="year"
              defaultValue={year?.toString() ?? ""}
              className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            >
              <option value="">ทุกปี</option>
              {result.availableYears.map((availableYear) => (
                <option key={availableYear} value={availableYear}>{availableYear}</option>
              ))}
            </select>
            <button
              type="submit"
              className="hg-interactive hg-pressable inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
            >
              <SlidersHorizontal aria-hidden="true" size={17} /> กรอง
            </button>
          </div>
          {query || organizationId || examType || year ? (
            <div className="mt-3 text-right">
              <Link href="/audiograms" className="text-xs font-semibold text-teal-700 hover:text-teal-800">ล้างตัวกรองทั้งหมด</Link>
            </div>
          ) : null}
        </form>

        {result.items.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <AudioLines aria-hidden="true" className="mx-auto text-slate-300" size={36} />
            <h2 className="mt-4 font-semibold text-slate-900">ไม่พบ audiogram</h2>
            <p className="mt-1 text-sm text-slate-500">ลองเปลี่ยนคำค้นหาหรือตัวกรอง</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">วันที่ตรวจ</th>
                  <th className="px-5 py-3">พนักงาน</th>
                  <th className="px-5 py-3">สถานประกอบการ / แผนก</th>
                  <th className="px-5 py-3">ประเภท</th>
                  <th className="px-5 py-3">Thresholds</th>
                  <th className="px-5 py-3">ความถูกต้อง</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result.items.map((audiogram) => (
                  <tr key={audiogram.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-4 font-semibold text-slate-900">{formatDate(audiogram.examDate)}</td>
                    <td className="px-5 py-4">
                      <Link href={`/employees/${audiogram.employeeId}`} className="font-semibold text-slate-900 hover:text-teal-700">
                        {audiogram.employeeName}
                      </Link>
                      <p className="mt-1 text-xs text-slate-500">{audiogram.employeeNumber}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-slate-800">{audiogram.organizationName}</p>
                      <p className="mt-1 text-xs text-slate-500">{audiogram.departmentName ?? "ไม่ระบุแผนก"}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                        {audiogramTypeLabel(audiogram.examType)}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={audiogram.thresholdCount === 14 ? "font-semibold text-emerald-700" : "font-semibold text-amber-700"}>
                        {audiogram.thresholdCount}/14 จุด
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {audiogram.isValid ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                          <CheckCircle2 aria-hidden="true" size={16} /> Valid
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                          <TriangleAlert aria-hidden="true" size={16} /> Invalid
                        </span>
                      )}
                      {actor.role !== "COMPANY_USER" ? <Link href={`/paperless-audiometry/${audiogram.id}`} className="ml-3 text-xs font-semibold text-teal-700 hover:text-teal-900">เปิด record</Link> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          pathname="/audiograms"
          currentQuery={{
            q: query,
            organization: organizationId,
            type: examType,
            year: year?.toString(),
          }}
          page={result.page}
          pageSize={result.pageSize}
          total={result.total}
        />
      </section>
    </>
  );
}
