"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AudioLines,
  Building2,
  ClipboardList,
  ClipboardPenLine,
  FileUp,
  History,
  Landmark,
  LayoutGrid,
  LogOut,
  Menu,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { logout } from "@/app/login/actions";

const navigationGroups = [
  {
    label: "Surveillance",
    index: "01",
    items: [
      { href: "/workspace", label: "ภาพรวมระบบ", icon: LayoutGrid },
      { href: "/surveillance", label: "Work queue", icon: ClipboardList },
      { href: "/companies", label: "สถานประกอบการ", icon: Building2 },
    ],
  },
  {
    label: "Clinical records",
    index: "02",
    items: [
      { href: "/employees", label: "พนักงาน", icon: Users },
      { href: "/audiograms", label: "Audiograms", icon: AudioLines },
      { href: "/paperless-audiometry", label: "บันทึกผลตรวจ", icon: ClipboardPenLine },
    ],
  },
  {
    label: "Governance",
    index: "03",
    items: [
      { href: "/baseline-governance", label: "Baseline review", icon: Landmark },
      { href: "/imports", label: "นำเข้าข้อมูล", icon: FileUp },
      { href: "/audit", label: "Audit log", icon: History },
    ],
  },
] as const;

type AppShellActor = {
  email: string;
  fullName: string;
  role: "HOSPITAL_ADMIN" | "OCCUPATIONAL_HEALTH_STAFF" | "OCCUPATIONAL_PHYSICIAN" | "COMPANY_USER";
  canManage: boolean;
  canReviewBaseline: boolean;
};

const roleLabels: Record<AppShellActor["role"], string> = {
  HOSPITAL_ADMIN: "Hospital admin",
  OCCUPATIONAL_HEALTH_STAFF: "OH staff",
  OCCUPATIONAL_PHYSICIAN: "Occupational physician",
  COMPANY_USER: "Company viewer",
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "HG";
}

function HearGuardMark() {
  return (
    <span aria-hidden="true" className="relative grid h-10 w-11 shrink-0 grid-cols-7 items-center gap-[2px] border-y border-teal-300/45 px-1.5">
      {[8, 15, 22, 30, 19, 13, 7].map((height, index) => (
        <span key={index} className="block w-px bg-teal-200" style={{ height }} />
      ))}
      <span className="absolute -bottom-1 left-0 font-mono text-[7px] text-teal-300/70">0.5</span>
      <span className="absolute -bottom-1 right-0 font-mono text-[7px] text-teal-300/70">8k</span>
    </span>
  );
}

function Brand() {
  return (
    <Link href="/workspace" className="hg-interactive hg-pressable group flex items-center gap-3 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-300">
      <HearGuardMark />
      <span>
        <span className="block text-lg font-semibold tracking-tight text-white">HearGuard</span>
        <span className="block font-mono text-[9px] font-medium tracking-[0.15em] text-slate-400">SENA HOSPITAL</span>
      </span>
    </Link>
  );
}

function SidebarContent({ actor, onNavigate }: { actor: AppShellActor; onNavigate?: () => void }) {
  const pathname = usePathname();
  const canShow = (href: string) =>
    (href !== "/imports" || actor.canManage || actor.canReviewBaseline)
    && (href !== "/baseline-governance" || actor.role !== "COMPANY_USER")
    && (href !== "/paperless-audiometry" || actor.role !== "COMPANY_USER");

  return (
    <div className="flex h-full flex-col bg-[#202827] text-slate-300">
      <div className="hg-frequency-rule border-b border-white/10 px-6 pb-7 pt-6"><Brand /></div>
      <nav aria-label="เมนูหลัก" className="flex-1 overflow-y-auto px-4 py-6">
        <div className="space-y-7">
          {navigationGroups.map((group) => {
            const items = group.items.filter((item) => canShow(item.href));
            if (items.length === 0) return null;
            return (
              <section key={group.index} aria-label={group.label}>
                <div className="mb-2.5 flex items-center gap-2 px-2 font-mono text-[9px] font-medium uppercase tracking-[0.15em] text-slate-500">
                  <span className="text-teal-300/80">{group.index}</span><span>{group.label}</span><span className="h-px flex-1 bg-white/[0.08]" />
                </div>
                <ul className="space-y-px">
                  {items.map((item) => {
                    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                    const Icon = item.icon;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={onNavigate}
                          className={`hg-interactive hg-pressable relative flex items-center gap-3 border-l-2 px-3 py-2.5 text-[13px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300 ${active ? "border-teal-300 bg-white/[0.045] font-semibold text-white" : "border-transparent font-medium text-slate-400 hover:border-slate-600 hover:bg-white/[0.025] hover:text-slate-100"}`}
                        >
                          <Icon aria-hidden="true" className={`hg-interactive ${active ? "text-teal-300" : "text-slate-500"}`} size={17} strokeWidth={1.7} />
                          <span className="flex-1">{item.label}</span>
                          {active ? <span aria-hidden="true" className="font-mono text-[8px] text-teal-300">●</span> : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      </nav>
      <div className="border-t border-white/10 px-6 py-5">
        <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.12em] text-teal-300"><ShieldCheck aria-hidden="true" size={14} strokeWidth={1.7} />Clinical workspace</div>
        <p className="mt-2 text-[11px] leading-5 text-slate-500">ข้อมูลสังเคราะห์เท่านั้น · ไม่ใช่ระบบวินิจฉัยโรค</p>
        <div className="mt-3 flex items-center justify-between border-t border-white/[0.08] pt-3 font-mono text-[9px] uppercase tracking-[0.08em] text-slate-500">
          <span>{actor.role === "HOSPITAL_ADMIN" && actor.canReviewBaseline ? "แอดมิน · แพทย์อาชีวเวชศาสตร์" : roleLabels[actor.role]}</span><span className="flex items-center gap-1.5 text-teal-300"><span className="size-1.5 bg-teal-300" />RLS</span>
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children, actor }: { children: ReactNode; actor: AppShellActor }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileMenuCloseRef = useRef<HTMLButtonElement>(null);
  const restoreMobileMenuFocusRef = useRef(false);

  useEffect(() => {
    if (mobileOpen) {
      mobileMenuCloseRef.current?.focus();
      return;
    }

    if (restoreMobileMenuFocusRef.current) {
      restoreMobileMenuFocusRef.current = false;
      mobileMenuTriggerRef.current?.focus();
    }
  }, [mobileOpen]);

  function closeMobileMenu({ restoreFocus = false }: { restoreFocus?: boolean } = {}) {
    restoreMobileMenuFocusRef.current = restoreFocus;
    setMobileOpen(false);
  }

  return (
    <div className="hg-app-shell min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-black/25 lg:block"><SidebarContent actor={actor} /></aside>
      <div
        aria-hidden={!mobileOpen}
        className="hg-drawer-layer fixed inset-0 z-40 lg:hidden"
        data-state={mobileOpen ? "open" : "closed"}
        inert={!mobileOpen}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            closeMobileMenu({ restoreFocus: true });
          }
        }}
      >
        <button type="button" aria-label="ปิดเมนู" className="hg-drawer-backdrop absolute inset-0 bg-[#151b1a]/55" onClick={() => closeMobileMenu({ restoreFocus: true })} />
        <aside className="hg-drawer-panel relative h-full w-[min(19rem,86vw)] border-r border-black/25 shadow-2xl">
          <button ref={mobileMenuCloseRef} type="button" aria-label="ปิดเมนู" onClick={() => closeMobileMenu({ restoreFocus: true })} className="hg-interactive hg-pressable absolute right-3 top-3 z-10 p-2 text-slate-400 hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-teal-300"><X aria-hidden="true" size={20} /></button>
          <SidebarContent actor={actor} onNavigate={() => closeMobileMenu()} />
        </aside>
      </div>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-[#d5dad5] bg-[#f2f1ec]/95 px-4 backdrop-blur sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 lg:hidden">
            <button ref={mobileMenuTriggerRef} type="button" aria-label="เปิดเมนู" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)} className="hg-interactive hg-pressable p-2 text-[#68716e] hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-[#1d6c67]"><Menu aria-hidden="true" size={20} /></button>
            <Link href="/workspace" className="hg-interactive hg-pressable flex items-center gap-2.5"><span className="grid h-7 w-8 grid-cols-5 items-center gap-px border-y border-[#1d6c67]/35 px-1">{[8, 16, 22, 14, 7].map((height, index) => <span key={index} className="block w-px bg-[#1d6c67]" style={{ height }} />)}</span><span className="font-semibold tracking-tight text-[#18201e]">HearGuard</span></Link>
          </div>
          <div className="hidden items-center gap-3 lg:flex"><span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#68716e]">Occupational hearing surveillance</span><span className="h-px w-16 bg-[#bcc4bf]" /><span className="font-mono text-[9px] text-[#8c9692]">0.5—8 kHz</span></div>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-2 font-mono text-[9px] uppercase tracking-[0.08em] text-[#68716e] sm:inline-flex"><span className="size-1.5 bg-[#1d6c67]" />Connected</span>
            <span className="hidden h-5 w-px bg-[#d5dad5] md:block" />
            <div className="hidden text-right md:block"><p className="max-w-48 truncate text-xs font-semibold text-[#18201e]">{actor.fullName}</p><p className="font-mono text-[9px] uppercase tracking-wide text-[#68716e]">{actor.role === "HOSPITAL_ADMIN" && actor.canReviewBaseline ? "Admin · Physician" : roleLabels[actor.role]}</p></div>
            <span title={actor.email} className="flex size-8 items-center justify-center border border-[#202827] bg-[#202827] font-mono text-[10px] font-semibold text-white">{initials(actor.fullName)}</span>
            <form action={logout}><button type="submit" aria-label="ออกจากระบบ" title="ออกจากระบบ" className="hg-interactive hg-pressable p-2 text-[#68716e] hover:bg-black/5 hover:text-[#18201e] focus-visible:outline-2 focus-visible:outline-[#1d6c67]"><LogOut aria-hidden="true" size={17} /></button></form>
          </div>
        </header>
        <main className="hg-page-canvas mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-9">{children}</main>
      </div>
    </div>
  );
}
