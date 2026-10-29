import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { requireCurrentActor } from "@/lib/server/current-actor";

export const dynamic = "force-dynamic";

export default async function InternalAppLayout({ children }: { children: ReactNode }) {
  const actor = await requireCurrentActor();
  return <AppShell actor={actor}>{children}</AppShell>;
}
