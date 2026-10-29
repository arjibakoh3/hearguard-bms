import type { ReactNode } from "react";

export default function InternalAppTemplate({ children }: { children: ReactNode }) {
  return <div className="hg-route-enter">{children}</div>;
}
