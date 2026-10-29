import Link from "next/link";
import { ArrowLeft, SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5 text-center">
      <div>
        <SearchX aria-hidden="true" className="mx-auto text-slate-300" size={48} />
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">404 · Not found</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">ไม่พบข้อมูลที่ต้องการ</h1>
        <p className="mt-2 text-sm text-slate-500">รายการนี้อาจไม่มีอยู่หรือไม่ได้อยู่ในขอบเขตองค์กรที่เข้าถึงได้</p>
        <Link
          href="/workspace"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
        >
          <ArrowLeft aria-hidden="true" size={17} /> กลับพื้นที่ทำงาน
        </Link>
      </div>
    </main>
  );
}
