import { cn } from "@/lib/utils";

type Weight = "card" | "sheet" | "well";

const WEIGHT: Record<Weight, string> = {
  card: "vd-glass-card vd-sheen",
  sheet: "vd-glass-sheet vd-sheen rounded-[22px]",
  well: "vd-glass-well rounded-[16px]",
};

export interface CardProps extends React.ComponentProps<"div"> {
  weight?: Weight;
  // Adds the hover lift. Use on a card that is itself a link or a button.
  interactive?: boolean;
}

export function Card({ className, weight = "card", interactive, ...props }: CardProps) {
  return (
    <div
      data-slot="card"
      data-weight={weight}
      className={cn(WEIGHT[weight], interactive && "vd-glass-hover cursor-pointer", className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1.5", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3 className={cn("text-fg text-[15px] leading-tight font-semibold", className)} {...props} />
  );
}

export function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-fg/50 text-[13px] font-normal", className)} {...props} />;
}
