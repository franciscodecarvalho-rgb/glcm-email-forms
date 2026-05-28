import { cn } from "@/lib/utils";

export type CasoFlag = "mesclado_auto" | "possivel_duplicata" | "cliente_recorrente";

const FLAG_LABEL: Record<CasoFlag, string> = {
  mesclado_auto: "Mesclado automaticamente",
  possivel_duplicata: "⚠️ Possível duplicata",
  cliente_recorrente: "🔵 Cliente recorrente",
};

const FLAG_CLASS: Record<CasoFlag, string> = {
  mesclado_auto: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200",
  possivel_duplicata: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200",
  cliente_recorrente: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
};

export function CasoFlagBadge({ flag, className }: { flag: CasoFlag; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        FLAG_CLASS[flag],
        className,
      )}
    >
      {FLAG_LABEL[flag]}
    </span>
  );
}
