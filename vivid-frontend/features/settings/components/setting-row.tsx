import { cn } from "@/lib/utils";

interface SettingRowProps {
  label: string;
  detail?: string;
  // The control on the right: a switch, a button, a value.
  control?: React.ReactNode;
  className?: string;
}

// One row of a settings group. Kept as a component so every row lines up and
// the label and its control stay associated.
export function SettingRow({ label, detail, control, className }: SettingRowProps) {
  return (
    <div className={cn("flex items-center gap-4 px-4 py-3.5", className)}>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-fg text-[13.5px] font-semibold">{label}</span>
        {detail ? (
          <span className="text-fg/50 text-[12px] leading-relaxed font-normal">{detail}</span>
        ) : null}
      </div>
      {control ? <div className="shrink-0">{control}</div> : null}
    </div>
  );
}

export function SettingGroup({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      {title ? (
        <h2 className="text-fg/40 text-[11.5px] font-semibold tracking-wide uppercase">{title}</h2>
      ) : null}
      <div className="vd-glass-card vd-sheen divide-fg/8 divide-y overflow-hidden">{children}</div>
    </section>
  );
}
