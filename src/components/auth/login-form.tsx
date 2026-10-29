import { ArrowRight } from "lucide-react";
import { login } from "@/app/login/actions";

export function LoginForm({ nextPath, errorMessage }: { nextPath: string; errorMessage?: string }) {
  return (
    <form action={login} className="mt-7 space-y-4">
      <input type="hidden" name="next" value={nextPath} />
      <label className="block">
        <span className="hg-technical-label mb-2 block">ID หรืออีเมล</span>
        <input
          name="identifier"
          type="text"
          autoComplete="username"
          required
          placeholder="รหัสผู้ใช้ หรือ name@hearguard.local"
          className="h-12 w-full border border-[var(--hg-rule-strong)] bg-[var(--hg-surface)] px-3.5 text-sm outline-none placeholder:text-[var(--hg-muted)] focus:border-[var(--hg-petrol)] focus:ring-1 focus:ring-[var(--hg-petrol)]"
        />
      </label>
      <label className="block">
        <span className="hg-technical-label mb-2 block">รหัสผ่าน</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={12}
          className="h-12 w-full border border-[var(--hg-rule-strong)] bg-[var(--hg-surface)] px-3.5 text-sm outline-none focus:border-[var(--hg-petrol)] focus:ring-1 focus:ring-[var(--hg-petrol)]"
        />
      </label>
      {errorMessage ? (
        <p role="alert" className="border-l-2 border-[var(--hg-critical)] bg-[var(--hg-critical-soft)] px-3 py-2.5 text-sm text-[var(--hg-critical)]">
          {errorMessage}
        </p>
      ) : null}
      <button
        type="submit"
        className="hg-interactive hg-pressable inline-flex h-12 w-full items-center justify-center gap-2 bg-[var(--hg-petrol)] px-5 text-sm font-semibold text-white hover:bg-[var(--hg-petrol-deep)]"
      >
        เข้าสู่ระบบ
        <ArrowRight aria-hidden="true" size={18} />
      </button>
    </form>
  );
}
