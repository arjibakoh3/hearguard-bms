import Link from "next/link";
import { ArrowRight, Clock3, Landmark, Search, ShieldCheck, Stethoscope } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import {
  baselineReviewLabel,
  baselineSuggestionLabel,
} from "@/lib/baseline-governance-labels";
import { formatDate, getSingleQueryValue } from "@/lib/format";
import { getHearGuardReadService } from "@/lib/server/hearguard-read-service";
import { requireCurrentActor } from "@/lib/server/current-actor";

type SearchParams = Record<string, string | string[] | undefined>;

const reviewStatuses = ["PENDING", "APPROVED", "REJECTED", "DEFERRED"] as const;

export default async function BaselineGovernancePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const [raw, actor] = await Promise.all([searchParams, requireCurrentActor()]);
  const query = getSingleQueryValue(raw.q);
  const organizationId = getSingleQueryValue(raw.organization);
  const frameworkRaw = getSingleQueryValue(raw.framework);
  const statusRaw = getSingleQueryValue(raw.status);
  const framework = frameworkRaw === "THAI" || frameworkRaw === "OSHA" || frameworkRaw === "NIOSH"
    ? frameworkRaw
    : undefined;
  const reviewStatus = reviewStatuses.find((value) => value === statusRaw);
  const page = Number(getSingleQueryValue(raw.page) ?? 1);
  const result = await getHearGuardReadService().searchBaselineGovernance({
    query,
    organizationId,
    framework,
    reviewStatus,
    page,
  });

  return (
    <>
      <PageHeader
        eyebrow="Post-core · Physician-governed baseline review"
        title="Baseline governance"
        description="ทบทวน initial Thai baseline และข้อเสนอ OSHA/NIOSH โดยทุกการตัดสินใจต้องตรวจสอบย้อนหลังได้"
      />

      {raw.denied === "review" ? (
        <div className="mb-5 border-l-2 border-[var(--hg-info)] bg-[var(--hg-info-soft)] px-5 py-4 text-sm leading-6 text-[#31566f]">
          บัญชีนี้เปิดดู evidence ได้ แต่การ Approve, Reject หรือ Defer สงวนไว้สำหรับ Occupational physician ที่ได้รับมอบหมาย
        </div>
      ) : null}
      {typeof raw.prepared === "string" ? (
        <div className="mb-5 border-l-2 border-[var(--hg-petrol)] bg-[var(--hg-petrol-soft)] px-5 py-4 text-sm leading-6 text-[var(--hg-petrol-deep)]">
          สร้างข้อเสนอใหม่ {Number(raw.prepared).toLocaleString("th-TH")} รายการ รายการที่มีอยู่แล้วจะไม่ถูกสร้างซ้ำ
        </div>
      ) : null}

      <section className="mb-5 border-y border-[var(--hg-rule-strong)] bg-[var(--hg-surface-muted)] px-5 py-4">
        <div className="flex items-start gap-3">
          <ShieldCheck aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--hg-petrol)]" size={20} />
          <div><p className="hg-technical-label">Safety boundary</p><p className="mt-1 text-sm leading-6 text-[var(--hg-ink-soft)]">Suggestion ไม่ใช่ baseline change ระบบไม่เปลี่ยน Thai operational baseline และไม่สร้างหรือปิด Thai follow-up case อัตโนมัติ</p></div>
        </div>
      </section>

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <InfoCard icon={Clock3} label="รอทบทวน" value={result.counts.PENDING} />
        <InfoCard icon={Stethoscope} label="อนุมัติแล้ว" value={result.counts.APPROVED} />
        <InfoCard icon={Landmark} label="เลื่อนการตัดสินใจ" value={result.counts.DEFERRED} />
        <InfoCard icon={ShieldCheck} label="สิทธิ์ตัดสินใจ" value={actor.canReviewBaseline ? "Physician" : "Read-only"} />
      </div>

      <section className="hg-table-frame overflow-hidden">
        <form method="get" className="border-b border-slate-200 p-4 sm:p-5">
          <div className="grid gap-3 lg:grid-cols-[minmax(230px,1.4fr)_1fr_0.8fr_1fr_auto]">
            <label className="relative"><span className="sr-only">ค้นหาข้อเสนอ</span><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input type="search" name="q" defaultValue={query} placeholder="รหัส ชื่อพนักงาน หรือ suggestion" className="h-11 w-full rounded-lg border border-slate-200 pl-10 pr-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100" /></label>
            <FilterSelect name="organization" value={organizationId} label="ทุกสถานประกอบการ" options={result.organizations.map((item) => ({ value: item.id, label: item.label }))} />
            <FilterSelect name="framework" value={framework} label="ทุก framework" options={[{ value: "THAI", label: "Thai" }, { value: "OSHA", label: "OSHA" }, { value: "NIOSH", label: "NIOSH" }]} />
            <FilterSelect name="status" value={reviewStatus} label="ทุกสถานะ" options={reviewStatuses.map((item) => ({ value: item, label: baselineReviewLabel(item) }))} />
            <button type="submit" className="hg-interactive hg-pressable h-11 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800">กรอง</button>
          </div>
        </form>

        {result.items.length === 0 ? (
          <div className="px-5 py-16 text-center"><Landmark aria-hidden="true" className="mx-auto text-slate-300" size={38} /><h2 className="mt-4 font-semibold text-slate-900">ไม่พบข้อเสนอที่ตรงตัวกรอง</h2></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">พนักงาน</th><th className="px-5 py-3">Framework</th><th className="px-5 py-3">Suggestion</th><th className="px-5 py-3">Sequence</th><th className="px-5 py-3">สถานะ</th><th className="px-5 py-3"><span className="sr-only">รายละเอียด</span></th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {result.items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-4"><Link href={`/employees/${item.employeeId}`} className="font-semibold text-slate-900 hover:text-teal-700">{item.employeeName}</Link><p className="mt-1 text-xs text-slate-500">{item.employeeNumber} · {item.organizationNameTh ?? item.organizationName}</p></td>
                    <td className="px-5 py-4"><span className="hg-mono inline-flex items-center gap-2 text-xs font-semibold text-[var(--hg-ink-soft)]"><span className={`size-1.5 ${item.framework === "THAI" ? "bg-[var(--hg-petrol)]" : item.framework === "OSHA" ? "bg-[var(--hg-info)]" : "bg-[var(--hg-review)]"}`} />{item.framework}</span><p className="mt-2 text-xs text-slate-500">{item.earScope}</p></td>
                    <td className="max-w-sm px-5 py-4"><p className="font-medium text-slate-800">{baselineSuggestionLabel(item.suggestionType)}</p><p className="mt-1 font-mono text-[10px] text-slate-400">{item.suggestionType}</p></td>
                    <td className="px-5 py-4 text-xs text-slate-600">{item.framework === "THAI" ? <p>Candidate {formatDate(item.candidateDate)}</p> : <><p>Monitoring {formatDate(item.monitoringDate)}</p><p className="mt-1">Confirmation {formatDate(item.confirmationDate)}</p></>}</td>
                    <td className="px-5 py-4"><span className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--hg-ink-soft)]"><span className={`size-1.5 ${item.reviewStatus === "APPROVED" ? "bg-[var(--hg-petrol)]" : item.reviewStatus === "REJECTED" ? "bg-[var(--hg-critical)]" : item.reviewStatus === "PENDING" ? "bg-[var(--hg-review)]" : "bg-[var(--hg-info)]"}`} />{baselineReviewLabel(item.reviewStatus)}</span></td>
                    <td className="px-5 py-4 text-right"><Link href={`/baseline-governance/${item.id}`} aria-label={`เปิด ${item.suggestionType}`} className="inline-flex rounded-lg p-2 text-teal-700 hover:bg-teal-50"><ArrowRight aria-hidden="true" size={18} /></Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination pathname="/baseline-governance" currentQuery={{ q: query, organization: organizationId, framework, status: reviewStatus }} page={result.page} pageSize={result.pageSize} total={result.total} />
      </section>
    </>
  );
}

function InfoCard({ icon: Icon, label, value }: { icon: typeof Clock3; label: string; value: number | string }) {
  return <div className="border-l border-[var(--hg-rule-strong)] pl-4"><div className="flex items-center gap-2"><Icon aria-hidden="true" className="text-[var(--hg-petrol)]" size={16} strokeWidth={1.6} /><p className="hg-technical-label">{label}</p></div><p className="hg-mono mt-2 text-sm font-semibold text-[var(--hg-ink)]">{typeof value === "number" ? value.toLocaleString("th-TH") : value}</p></div>;
}

function FilterSelect({ name, value, label, options }: { name: string; value?: string; label: string; options: Array<{ value: string; label: string }> }) {
  return <label><span className="sr-only">{label}</span><select name={name} defaultValue={value ?? ""} className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"><option value="">{label}</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}
