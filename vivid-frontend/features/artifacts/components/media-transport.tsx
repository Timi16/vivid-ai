"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { PauseIcon, PlayIcon, SpeakerIcon, SpeakerOffIcon } from "@/components/ui/icons";
import { formatDuration } from "@/features/artifacts/lib/data";

interface MediaTransportProps {
  duration: number;
  // Rendered above the controls, e.g. a waveform or a video frame.
  visual?: React.ReactNode;
}

// Play, pause, scrub and mute.
//
// There is no media service, so nothing is decoded: the position is driven by a
// timer while playing, and scrubbing sets it directly. Every control is real
// and reflects real state, which is what the screen is for. When a source
// arrives this becomes a thin wrapper over a media element's timeupdate.
export function MediaTransport({ duration, visual }: MediaTransportProps) {
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [position, setPosition] = useState(0);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      setPosition((prev) => {
        if (prev + 1 >= duration) {
          setPlaying(false);
          return duration;
        }
        return prev + 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [playing, duration]);

  const pct = duration === 0 ? 0 : (position / duration) * 100;

  return (
    <div className="flex flex-col gap-3">
      {visual}

      <div className="flex items-center gap-3">
        <Button
          size="icon"
          aria-label={playing ? "Pause" : "Play"}
          onClick={() => {
            // Restart rather than sitting at the end.
            if (position >= duration) setPosition(0);
            setPlaying((p) => !p);
          }}
        >
          {playing ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
        </Button>

        <span className="tnum text-fg/60 shrink-0 text-[12px] font-medium">
          {formatDuration(position)}
        </span>

        <label className="relative flex-1">
          <span className="sr-only">Seek</span>
          <input
            type="range"
            min={0}
            max={duration}
            step={1}
            value={position}
            onChange={(event) => setPosition(Number(event.target.value))}
            className="peer absolute inset-0 z-10 w-full cursor-pointer opacity-0"
          />
          <span
            aria-hidden="true"
            className="vd-glass-well peer-focus-visible:outline-ring block h-1.5 overflow-hidden rounded-full peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2"
          >
            <span
              className="bg-fg/75 block h-full rounded-full transition-[width] duration-200"
              style={{ width: `${pct}%` }}
            />
          </span>
        </label>

        <span className="tnum text-fg/35 shrink-0 text-[12px] font-medium">
          {formatDuration(duration)}
        </span>

        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={muted ? "Unmute" : "Mute"}
          aria-pressed={muted}
          onClick={() => setMuted((m) => !m)}
        >
          {muted ? <SpeakerOffIcon size={16} /> : <SpeakerIcon size={16} />}
        </Button>
      </div>
    </div>
  );
}
