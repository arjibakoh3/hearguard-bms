"use client";

import { CircleAlert, RotateCcw } from "lucide-react";

export default function InternalAppError({ reset }: { reset: () => void }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="max-w-md rounded-xl border border-rose-200 bg-white p-7 text-center shadow-sm">
        <CircleAlert aria-hidden="true" className="mx-auto text-rose-600" size={36} />
        <h1 className="mt-4 text-xl font-semibold text-slate-950">ไม่สามารถโหลดข้อมูลได้</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          ระบบตอบกลับผิดพลาดหรือฐานข้อมูลยังไม่พร้อม โปรดลองอีกครั้ง
          หากใช้ระบบ local ให้ตรวจว่า Docker และ Supabase กำลังทำงาน
        </p>
        <button
          type="button"
          onClick={reset}
          className="hg-interactive hg-pressable mt-5 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
        >
          <RotateCcw aria-hidden="true" size={17} /> ลองอีกครั้ง
        </button>
      </div>
    </div>
  );
}
