import { cn } from "@/lib/utils";

interface AuthCardProps {
  title: string;
  subtitle?: string;
  // Sits above the title. Used for the step counter during onboarding.
  eyebrow?: React.ReactNode;
  footer?: React.ReactNode;
  width?: "sm" | "md" | "lg";
  className?: string;
  children: React.ReactNode;
}

const WIDTH = {
  sm: "max-w-[400px]",
  md: "max-w-[480px]",
  lg: "max-w-[760px]",
};

// The frame every auth and onboarding step renders inside, so the wordmark,
// heading rhythm and card weight stay identical across the flow.
export function AuthCard({
  title,
  subtitle,
  eyebrow,
  footer,
  width = "sm",
  className,
  children,
}: AuthCardProps) {
  return (
    <div className={cn("w-full", WIDTH[width], className)}>
      <div className="mb-7 text-center">
        <p className="ws-display text-fg text-[26px] leading-none">
          Vivid <span className="text-fg/45 font-medium">AI</span>
        </p>
      </div>

      <div className="vd-glass-card vd-sheen p-7">
        {eyebrow ? <div className="mb-3">{eyebrow}</div> : null}

        <h1 className="ws-display text-fg text-[21px] leading-tight">{title}</h1>
        {subtitle ? (
          <p className="text-fg/55 mt-2 text-[13.5px] leading-relaxed font-normal">{subtitle}</p>
        ) : null}

        <div className="mt-6">{children}</div>
      </div>

      {footer ? (
        <div className="text-fg/45 mt-5 text-center text-[12.5px] font-normal">{footer}</div>
      ) : null}
    </div>
  );
}
