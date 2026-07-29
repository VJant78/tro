import type { ReactNode } from "react";

type StatusTone = "neutral" | "success" | "warning" | "danger";

export interface StatusBadgeProps {
  children: ReactNode;
  tone?: StatusTone;
}

export function StatusBadge({ children, tone = "neutral" }: StatusBadgeProps) {
  return <span className={`ui-status ui-status-${tone}`}>{children}</span>;
}
