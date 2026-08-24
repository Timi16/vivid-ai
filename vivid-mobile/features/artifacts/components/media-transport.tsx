import { useEffect, useRef, useState } from "react";
import { View, type GestureResponderEvent } from "react-native";

import { Button } from "@/components/ui/button";
import { Glass } from "@/components/ui/glass";
import { PauseIcon, PlayIcon, SpeakerIcon, SpeakerOffIcon } from "@/components/ui/icons";
import { AppText } from "@/components/ui/text";
import { useTheme } from "@/hooks/use-theme";
import { formatDuration } from "@/features/artifacts/lib/data";

interface MediaTransportProps {
  duration: number;
  // Rendered above the controls, e.g. a waveform or a video frame.
  visual?: React.ReactNode;
}

// The scrub track is 6px tall; the touch target around it is taller so a
// thumb can land on it without precision.
const TRACK_HEIGHT = 6;
const TRACK_HIT_HEIGHT = 28;

// Play, pause, scrub and mute.
//
// There is no media service, so nothing is decoded: the position is driven by a
// timer while playing, and scrubbing sets it directly. Every control is real
// and reflects real state, which is what the screen is for. When a source
// arrives this becomes a thin wrapper over a media element's timeupdate.
export function MediaTransport({ duration, visual }: MediaTransportProps) {
  const { theme } = useTheme();
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

  // The track's measured width, read inside the gesture handlers. A ref rather
  // than state so the responder does not need rebuilding on every layout.
  const trackWidth = useRef(0);
  const durationRef = useRef(duration);
  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  // Stands in for the web's range input: a tap seeks, a drag scrubs. Wired
  // through the view's own responder props, so the refs are only read at
  // gesture time.
  const seekTo = (event: GestureResponderEvent) => {
    const width = trackWidth.current;
    if (width <= 0) return;
    const ratio = Math.min(1, Math.max(0, event.nativeEvent.locationX / width));
    setPosition(Math.round(ratio * durationRef.current));
  };

  const pct = duration === 0 ? 0 : (position / duration) * 100;

  return (
    <View style={{ gap: 12 }}>
      {visual}

      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Button
          size="icon"
          accessibilityLabel={playing ? "Pause" : "Play"}
          icon={
            playing ? (
              <PauseIcon size={16} color={theme.colors.ink} />
            ) : (
              <PlayIcon size={16} color={theme.colors.ink} />
            )
          }
          onPress={() => {
            // Restart rather than sitting at the end.
            if (position >= duration) setPosition(0);
            setPlaying((p) => !p);
          }}
        />

        <AppText size={12} tone={0.6} style={{ fontVariant: ["tabular-nums"] }}>
          {formatDuration(position)}
        </AppText>

        <View
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={seekTo}
          onResponderMove={seekTo}
          accessibilityRole="adjustable"
          accessibilityLabel="Seek"
          accessibilityValue={{
            min: 0,
            max: duration,
            now: position,
            text: formatDuration(position),
          }}
          accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
          onAccessibilityAction={(event) => {
            const step = event.nativeEvent.actionName === "increment" ? 1 : -1;
            setPosition((prev) => Math.min(duration, Math.max(0, prev + step)));
          }}
          onLayout={(event) => {
            trackWidth.current = event.nativeEvent.layout.width;
          }}
          style={{ flex: 1, height: TRACK_HIT_HEIGHT, justifyContent: "center" }}
        >
          <Glass tier="well" radius={999} style={{ height: TRACK_HEIGHT, overflow: "hidden" }}>
            <View
              style={{
                height: "100%",
                width: `${pct}%`,
                borderRadius: 999,
                backgroundColor: theme.fg(0.75),
              }}
            />
          </Glass>
        </View>

        <AppText size={12} tone={0.35} style={{ fontVariant: ["tabular-nums"] }}>
          {formatDuration(duration)}
        </AppText>

        <Button
          variant="ghost"
          size="icon-sm"
          accessibilityLabel={muted ? "Unmute" : "Mute"}
          icon={
            muted ? (
              <SpeakerOffIcon size={16} color={theme.fg(0.65)} />
            ) : (
              <SpeakerIcon size={16} color={theme.fg(0.65)} />
            )
          }
          onPress={() => setMuted((m) => !m)}
        />
      </View>
    </View>
  );
}
