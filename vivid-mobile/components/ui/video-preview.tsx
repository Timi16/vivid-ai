import { useVideoPlayer, VideoView } from "expo-video";
import type { StyleProp, ViewStyle } from "react-native";

interface VideoPreviewProps {
  url: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

// A clip with the platform's own controls. Playback starts on a tap, never on
// its own: a thread or a list of generated files must not start making noise
// because it scrolled into view.
export function VideoPreview({ url, style, accessibilityLabel }: VideoPreviewProps) {
  const player = useVideoPlayer(url, (instance) => {
    instance.loop = false;
  });
  return (
    <VideoView
      player={player}
      style={style}
      nativeControls
      contentFit="contain"
      accessibilityLabel={accessibilityLabel}
    />
  );
}
