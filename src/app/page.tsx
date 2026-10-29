import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";

const FREQUENCIES = ["500", "1K", "2K", "3K", "4K", "6K", "8K"];

export default function Home() {
  return (
    <main className="hg-route-enter min-h-screen bg-[var(--hg-canvas)] text-[var(--hg-ink)]">
      <div className="mx-auto grid min-h-screen w-full max-w-[1440px] lg:grid-cols-[minmax(0,1fr)_25rem]">
        <section className="relative flex min-h-[70vh] flex-col justify-between px-6 py-8 sm:px-10 lg:min-h-screen lg:px-16 lg:py-12">
          <div className="flex items-center justify-between border-b border-[var(--hg-rule-strong)] pb-5">
            <div>
              <p className="text-xl font-semibold tracking-[-0.02em]">HearGuard</p>
              <p className="hg-technical-label mt-1">Sena Hospital · Occupational Medicine</p>
            </div>
            <div aria-hidden="true" className="hidden items-end gap-3 sm:flex">
              {FREQUENCIES.map((frequency, index) => (
                <span key={frequency} className="flex flex-col items-center gap-1">
                  <span className="w-px bg-[var(--hg-rule-strong)]" style={{ height: `${8 + index * 2}px` }} />
                  <span className="hg-mono text-[8px] text-[var(--hg-muted)]">{frequency}</span>
                </span>
              ))}
            </div>
          </div>

          <div className="max-w-4xl py-16 lg:py-24">
            <p className="hg-technical-label text-[var(--hg-petrol)]">Clinical frequency workstation</p>
            <h1 className="mt-5 text-[clamp(2.75rem,6vw,5.8rem)] font-semibold leading-[0.98] tracking-[-0.055em]">
              เห็นการเปลี่ยนแปลง
              <span className="block text-[var(--hg-muted)]">ก่อนเสียงจะกลายเป็นความเงียบ</span>
            </h1>
            <p className="mt-7 max-w-2xl text-base leading-8 text-[var(--hg-muted)] sm:text-lg">
              พื้นที่ทำงานสำหรับติดตาม audiogram, operational baseline และขั้นตอน follow-up ของพนักงานอย่างต่อเนื่อง โดยคงบริบททางคลินิกไว้ครบถ้วน
            </p>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <Link href="/login" className="hg-interactive hg-pressable inline-flex h-12 items-center justify-center gap-3 bg-[var(--hg-petrol)] px-5 text-sm font-semibold text-white hover:bg-[var(--hg-petrol-deep)]">
                เข้าใช้งาน HearGuard <ArrowRight aria-hidden="true" size={17} />
              </Link>
              <Link href="/login?next=%2Femployees" className="hg-interactive hg-pressable inline-flex h-12 items-center justify-center border border-[var(--hg-rule-strong)] px-5 text-sm font-semibold hover:bg-white/60">
                ค้นหาเวชระเบียนพนักงาน
              </Link>
            </div>
          </div>

          <div className="grid gap-4 border-t border-[var(--hg-rule-strong)] pt-5 text-sm text-[var(--hg-muted)] sm:grid-cols-3">
            <p><span className="hg-mono mr-2 text-[10px] text-[var(--hg-petrol)]">01</span>Longitudinal audiograms</p>
            <p><span className="hg-mono mr-2 text-[10px] text-[var(--hg-petrol)]">02</span>Thai · OSHA · NIOSH</p>
            <p><span className="hg-mono mr-2 text-[10px] text-[var(--hg-petrol)]">03</span>Baseline governance</p>
          </div>
        </section>

        <aside className="flex flex-col justify-between bg-[var(--hg-graphite)] px-7 py-10 text-white sm:px-10 lg:py-12">
          <div>
            <p className="hg-technical-label text-[#8fc9c3]">System scope</p>
            <h2 className="mt-4 text-2xl font-semibold tracking-[-0.025em]">Occupational hearing surveillance</h2>
            <div className="mt-9 border-y border-white/15">
              {[["TH", "Thai operational rule"], ["OS", "OSHA analytical comparator"], ["NI", "NIOSH confirmation layer"], ["BL", "Physician baseline review"]].map(([code, label]) => (
                <div key={code} className="grid grid-cols-[2.5rem_1fr] border-b border-white/10 py-4 last:border-b-0">
                  <span className="hg-mono text-[10px] text-[#8fc9c3]">{code}</span><span className="text-sm text-white/75">{label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-12 border-t border-white/15 pt-6">
            <div className="flex items-start gap-3 text-xs leading-5 text-white/55"><ShieldCheck aria-hidden="true" className="mt-0.5 shrink-0 text-[#8fc9c3]" size={16} /><p>Authorized clinical workspace<br />Organization scoped access</p></div>
          </div>
        </aside>
      </div>
    </main>
  );
}
