import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";
import { getSingleQueryValue } from "@/lib/format";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function LoginPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const query = await searchParams;
  const requestedNext = getSingleQueryValue(query.next);
  const error = getSingleQueryValue(query.error);
  const nextPath = requestedNext?.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/workspace";
  const errorMessage = error === "invalid" ? "กรุณากรอกอีเมลและรหัสผ่านให้ถูกต้อง" : error === "credentials" ? "อีเมลหรือรหัสผ่านไม่ถูกต้อง" : undefined;

  return (
    <main className="hg-route-enter min-h-screen bg-[var(--hg-graphite)] text-[var(--hg-ink)]">
      <div className="mx-auto grid min-h-screen w-full max-w-[1380px] bg-[var(--hg-canvas)] lg:grid-cols-[minmax(25rem,0.8fr)_1.2fr]">
        <section className="flex flex-col justify-center border-b border-[var(--hg-rule-strong)] px-7 py-12 sm:px-12 lg:border-b-0 lg:border-r lg:px-16">
          <Link href="/" className="w-fit"><span className="block text-xl font-semibold tracking-[-0.02em]">HearGuard</span><span className="hg-technical-label mt-1 block">Sena Hospital</span></Link>
          <p className="hg-technical-label mt-16 text-[var(--hg-petrol)]">Authorized clinical access</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">เข้าสู่พื้นที่เฝ้าระวัง</h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-[var(--hg-muted)]">ข้อมูลทุกหน้าถูกกรองด้วยสิทธิ์ระดับองค์กรและบันทึก audit trail ตามบทบาทผู้ใช้งาน</p>
          <LoginForm nextPath={nextPath} errorMessage={errorMessage} />
        </section>
        <aside className="flex flex-col justify-center px-7 py-12 sm:px-12 lg:px-16">
          <ShieldCheck aria-hidden="true" className="text-[var(--hg-petrol)]" size={30} />
          <h2 className="mt-5 text-2xl font-semibold">ข้อมูลสุขภาพสำหรับผู้มีสิทธิ์เท่านั้น</h2>
          <p className="mt-3 max-w-lg text-sm leading-7 text-[var(--hg-muted)]">กรุณาใช้บัญชีที่ผู้ดูแลระบบจัดให้ หากยังไม่มีสิทธิ์เข้าถึงองค์กรหรือจำรหัสผ่านไม่ได้ ให้ติดต่อผู้ดูแลระบบของ HearGuard</p>
        </aside>
      </div>
    </main>
  );
}
