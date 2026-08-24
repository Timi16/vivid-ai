export type ArtifactKind = "image" | "video" | "audio";

export interface Artifact {
  id: string;
  kind: ArtifactKind;
  title: string;
  prompt: string;
  createdAt: string;
  // Seconds. Only meaningful for video and audio.
  duration?: number;
  meta: string;
  // Two stops describing the placeholder tile. There is no media service yet,
  // so a generated piece is represented by a gradient rather than a broken
  // image element or a stock photo standing in for someone's output.
  tint: [string, string];
}

export const ARTIFACTS: Artifact[] = [
  {
    id: "prism-1",
    kind: "image",
    title: "Prism splitting white light",
    prompt: "A glass prism on a dark surface splitting a beam into a spectrum, studio lighting",
    createdAt: "2026-08-22T18:20:00.000Z",
    meta: "1024 × 1024 · PNG",
    tint: ["#2a2f3a", "#0d0f14"],
  },
  {
    id: "lens-1",
    kind: "image",
    title: "Cutaway of a compound lens",
    prompt: "Technical cutaway illustration of a multi-element camera lens, monochrome",
    createdAt: "2026-08-22T17:02:00.000Z",
    meta: "1024 × 1024 · PNG",
    tint: ["#33302b", "#111014"],
  },
  {
    id: "tir-video",
    kind: "video",
    title: "Total internal reflection",
    prompt: "24-second explainer showing light bouncing inside a fibre optic strand",
    createdAt: "2026-08-21T15:35:00.000Z",
    duration: 24,
    meta: "1080p · MP4",
    tint: ["#243036", "#0b0e11"],
  },
  {
    id: "narration-1",
    kind: "audio",
    title: "Narration: how lenses focus light",
    prompt: "Calm explanatory voice, roughly ninety seconds",
    createdAt: "2026-08-20T12:10:00.000Z",
    duration: 92,
    meta: "Voice · MP3",
    tint: ["#2c2733", "#0e0d12"],
  },
];

// mm:ss for a transport readout.
export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}
