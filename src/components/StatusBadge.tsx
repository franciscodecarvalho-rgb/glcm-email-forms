import { CasoStatus, STATUS_CLASS, STATUS_LABEL } from "@/lib/status";
import { cn } from "@/lib/utils";

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const s = (status as CasoStatus) in STATUS_LABEL ? (status as CasoStatus) : "novo";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        STATUS_CLASS[s],
        className,
      )}
    >
      {STATUS_LABEL[s]}
    </span>
  );
}
