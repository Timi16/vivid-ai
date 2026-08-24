import { ImageIcon, PlayIcon, WaveformIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { formatDuration, type Artifact } from "@/features/artifacts/lib/data";

const KIND_ICON = {
  image: ImageIcon,
  video: PlayIcon,
  audio: WaveformIcon,
};

// The placeholder visual for a generated piece. A gradient rather than a stock
// photo, so nothing on screen pretends to be output the model produced.
export function ArtifactSurface({
  artifact,
  className,
}: {
  artifact: Artifact;
  className?: string;
}) {
  const Icon = KIND_ICON[artifact.kind];
  return (
    <div
      className={cn(
        "border-fg/10 relative grid place-items-center overflow-hidden rounded-[16px] border",
        className
      )}
      style={{
        backgroundImage: `linear-gradient(155deg, ${artifact.tint[0]} 0%, ${artifact.tint[1]} 100%)`,
      }}
    >
      <span className="vd-glass-control text-fg/80 grid size-11 place-items-center rounded-full">
        <Icon size={18} />
      </span>
      {artifact.duration ? (
        <span className="vd-glass-control text-fg/85 absolute right-2.5 bottom-2.5 rounded-full px-2 py-0.5 text-[11px] font-semibold">
          {formatDuration(artifact.duration)}
        </span>
      ) : null}
    </div>
  );
}

export function ArtifactTile({ artifact, onOpen }: { artifact: Artifact; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="vd-glass-card vd-sheen vd-glass-hover flex cursor-pointer flex-col gap-3 p-3 text-left"
    >
      <ArtifactSurface artifact={artifact} className="aspect-[4/3] w-full" />
      <div className="flex flex-col gap-0.5 px-1 pb-1">
        <span className="text-fg truncate text-[13px] font-semibold">{artifact.title}</span>
        <span className="text-fg/45 truncate text-[11.5px] font-normal">{artifact.meta}</span>
      </div>
    </button>
  );
}
