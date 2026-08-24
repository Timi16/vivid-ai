// Hand-drawn icon set, ported path-for-path from the web app so both apps
// share one stroke weight. Icons take a `color`; when omitted they read the
// foreground from the theme, which is the equivalent of currentColor.

import Svg, { Circle, Path, Rect } from "react-native-svg";

import { useTheme } from "@/hooks/use-theme";

export interface IconProps {
  size?: number;
  color?: string;
}

const strokeWidth = 1.7;

function useStroke(color?: string) {
  const { theme } = useTheme();
  return color ?? theme.colors.fg;
}

function Frame({ size = 20, children }: { size?: number; children: React.ReactNode }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {children}
    </Svg>
  );
}

export function PlusIcon({ size, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Frame size={size}>
      <Path d="M12 5v14M5 12h14" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Frame>
  );
}

export function ComputerIcon({ size, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Frame size={size}>
      <Rect x="3" y="4" width="18" height="12" rx="2" stroke={stroke} strokeWidth={strokeWidth} />
      <Path d="M8 20h8" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Frame>
  );
}

export function SpacesIcon({ size, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Frame size={size}>
      <Path d="M4 8.5 12 4.5l8 4-8 4-8-4Z" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <Path d="m4 13 8 4 8-4" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Frame>
  );
}

export function ArtifactsIcon({ size, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Frame size={size}>
      <Rect x="4" y="4" width="16" height="16" rx="2.5" stroke={stroke} strokeWidth={strokeWidth} />
      <Path d="M9 4v16" stroke={stroke} strokeWidth={strokeWidth} />
    </Frame>
  );
}

export function CustomizeIcon({ size, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Frame size={size}>
      <Circle cx="12" cy="12" r="8" stroke={stroke} strokeWidth={strokeWidth} />
      <Circle cx="12" cy="12" r="3" stroke={stroke} strokeWidth={strokeWidth} />
    </Frame>
  );
}

export function HistoryIcon({ size, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Frame size={size}>
      <Path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path d="M3.5 4.5v4h4" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 7.5V12l3 2" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Frame>
  );
}

export function SearchIcon({ size, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Frame size={size}>
      <Circle cx="11" cy="11" r="6.5" stroke={stroke} strokeWidth={strokeWidth} />
      <Path d="m16 16 4 4" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Frame>
  );
}

export function MicIcon({ size, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Frame size={size}>
      <Rect x="9" y="3" width="6" height="11" rx="3" stroke={stroke} strokeWidth={strokeWidth} />
      <Path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Frame>
  );
}

export function WaveformIcon({ size, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Frame size={size}>
      <Path d="M4 11v2M8 8v8M12 5v14M16 8v8M20 11v2" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Frame>
  );
}

export function BellIcon({ size, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Frame size={size}>
      <Path d="M6 9.5a6 6 0 1 1 12 0c0 3.5 1.2 5 1.2 5H4.8s1.2-1.5 1.2-5Z" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <Path d="M10 18a2 2 0 0 0 4 0" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Frame>
  );
}

export function SidebarIcon({ size, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Frame size={size}>
      <Rect x="3.5" y="4.5" width="17" height="15" rx="2.5" stroke={stroke} strokeWidth={strokeWidth} />
      <Path d="M10 4.5v15" stroke={stroke} strokeWidth={strokeWidth} />
    </Frame>
  );
}

export function MenuIcon({ size, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Frame size={size}>
      <Path d="M4 7h16M4 12h16M4 17h16" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Frame>
  );
}

export function ChevronDownIcon({ size, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Frame size={size}>
      <Path d="m6 9.5 6 6 6-6" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Frame>
  );
}

export function ChevronRightIcon({ size, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Frame size={size}>
      <Path d="m9.5 6 6 6-6 6" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Frame>
  );
}

export function AttachIcon({ size, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Frame size={size}>
      <Path
        d="M20 12.5 12.5 20a5 5 0 0 1-7-7l8-8a3.5 3.5 0 0 1 5 5l-8 8a2 2 0 0 1-3-3l7.5-7.5"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Frame>
  );
}

export function MailIcon({ size, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Frame size={size}>
      <Rect x="3" y="5" width="18" height="14" rx="2.5" stroke={stroke} strokeWidth={strokeWidth} />
      <Path d="m3.8 7 7.3 5.2a1.5 1.5 0 0 0 1.8 0L20.2 7" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Frame>
  );
}

export function CheckIcon({ size, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Frame size={size}>
      <Path d="m5 12.5 4.5 4.5L19 7" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Frame>
  );
}

export function ArrowLeftIcon({ size, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Frame size={size}>
      <Path d="M19 12H5m0 0 6-6m-6 6 6 6" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Frame>
  );
}

export function ArrowUpIcon({ size, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Frame size={size}>
      <Path d="M12 19V5m0 0-6 6m6-6 6 6" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Frame>
  );
}

export function ShuffleIcon({ size, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Frame size={size}>
      <Path d="M4 7h4l8 10h4M4 17h4l2-2.5M14 9.5 16 7h4" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="m18 4 2.5 3L18 10M18 14l2.5 3L18 20" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Frame>
  );
}

export function MoreIcon({ size, color }: IconProps) {
  const fill = useStroke(color);
  return (
    <Frame size={size}>
      <Circle cx="5.5" cy="12" r="1.5" fill={fill} />
      <Circle cx="12" cy="12" r="1.5" fill={fill} />
      <Circle cx="18.5" cy="12" r="1.5" fill={fill} />
    </Frame>
  );
}

export function TrashIcon({ size, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Frame size={size}>
      <Path d="M4 7h16" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" stroke={stroke} strokeWidth={strokeWidth} />
      <Path
        d="M6 7.5 6.8 19a1.5 1.5 0 0 0 1.5 1.4h7.4a1.5 1.5 0 0 0 1.5-1.4L18 7.5"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
    </Frame>
  );
}

export function PencilIcon({ size, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Frame size={size}>
      <Path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Z" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <Path d="m14.5 7 2.5 2.5" stroke={stroke} strokeWidth={strokeWidth} />
    </Frame>
  );
}

export function ShareIcon({ size, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Frame size={size}>
      <Path d="M12 15V4m0 0L8 8m4-4 4 4" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M5 14v4.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V14" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Frame>
  );
}

export function CopyIcon({ size, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Frame size={size}>
      <Rect x="9" y="9" width="11" height="11" rx="2.2" stroke={stroke} strokeWidth={strokeWidth} />
      <Path d="M15 6.5A2.5 2.5 0 0 0 12.5 4h-6A2.5 2.5 0 0 0 4 6.5v6A2.5 2.5 0 0 0 6.5 15" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Frame>
  );
}

export function DownloadIcon({ size, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Frame size={size}>
      <Path d="M12 4v11m0 0 4-4m-4 4-4-4" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M5 16v2.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V16" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Frame>
  );
}

export function ThumbUpIcon({ size, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Frame size={size}>
      <Path
        d="M7 20V10l4.2-6a2 2 0 0 1 2.9 2.4L13 10h5.2a2 2 0 0 1 1.95 2.45l-1.4 6A2 2 0 0 1 16.8 20H7Z"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <Path d="M7 10H4v10h3" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
    </Frame>
  );
}

export function ThumbDownIcon({ size, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Frame size={size}>
      <Path
        d="M17 4v10l-4.2 6a2 2 0 0 1-2.9-2.4L11 14H5.8a2 2 0 0 1-1.95-2.45l1.4-6A2 2 0 0 1 7.2 4H17Z"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <Path d="M17 14h3V4h-3" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
    </Frame>
  );
}

export function FlagIcon({ size, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Frame size={size}>
      <Path d="M5.5 21V4" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path d="M5.5 5h9.2l-1.4 3.4L14.7 12H5.5V5Z" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
    </Frame>
  );
}

export function FolderPlusIcon({ size, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Frame size={size}>
      <Path
        d="M3.5 7.5A2 2 0 0 1 5.5 5.5h3.2a2 2 0 0 1 1.5.7l1 1.3h7.3a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-9.5Z"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <Path d="M12 11.5v5M9.5 14h5" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Frame>
  );
}

export function FilterIcon({ size, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Frame size={size}>
      <Path d="M4 6h16M7 12h10M10 18h4" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Frame>
  );
}

export function GlobeIcon({ size, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Frame size={size}>
      <Circle cx="12" cy="12" r="8" stroke={stroke} strokeWidth={strokeWidth} />
      <Path d="M4 12h16" stroke={stroke} strokeWidth={strokeWidth} />
      <Path d="M12 4c2.2 2.3 3.3 5 3.3 8s-1.1 5.7-3.3 8c-2.2-2.3-3.3-5-3.3-8s1.1-5.7 3.3-8Z" stroke={stroke} strokeWidth={strokeWidth} />
    </Frame>
  );
}

export function KeyboardIcon({ size, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Frame size={size}>
      <Rect x="2.5" y="6" width="19" height="12" rx="2.2" stroke={stroke} strokeWidth={strokeWidth} />
      <Path d="M6 9.5h.01M9.5 9.5h.01M13 9.5h.01M16.5 9.5h.01M8 14.5h8" stroke={stroke} strokeWidth={2} strokeLinecap="round" />
    </Frame>
  );
}

export function LogOutIcon({ size, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Frame size={size}>
      <Path
        d="M15 5.5V5a1.5 1.5 0 0 0-1.5-1.5h-7A1.5 1.5 0 0 0 5 5v14a1.5 1.5 0 0 0 1.5 1.5h7A1.5 1.5 0 0 0 15 19v-.5"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <Path d="M20 12H10m10 0-3.5-3.5M20 12l-3.5 3.5" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Frame>
  );
}

export function SunIcon({ size, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Frame size={size}>
      <Circle cx="12" cy="12" r="4" stroke={stroke} strokeWidth={strokeWidth} />
      <Path
        d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </Frame>
  );
}

export function MoonIcon({ size, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Frame size={size}>
      <Path d="M20 13.5A8 8 0 1 1 10.5 4a6.5 6.5 0 0 0 9.5 9.5Z" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
    </Frame>
  );
}

export function ImageIcon({ size, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Frame size={size}>
      <Rect x="3.5" y="4.5" width="17" height="15" rx="2.5" stroke={stroke} strokeWidth={strokeWidth} />
      <Circle cx="9" cy="10" r="1.6" stroke={stroke} strokeWidth={strokeWidth} />
      <Path
        d="m4.5 17 4.2-4.2a1.6 1.6 0 0 1 2.3 0l3.2 3.2m0 0 1.8-1.8a1.6 1.6 0 0 1 2.3 0l1.4 1.4m-5.5.4 1.6 1.6"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Frame>
  );
}

export function VideoIcon({ size, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Frame size={size}>
      <Rect x="3" y="6" width="12.5" height="12" rx="2.2" stroke={stroke} strokeWidth={strokeWidth} />
      <Path d="m15.5 13 4 2.6a.8.8 0 0 0 1.2-.7V9.1a.8.8 0 0 0-1.2-.7l-4 2.6v2Z" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
    </Frame>
  );
}

export function PlayIcon({ size, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Frame size={size}>
      <Path d="M8 5.5v13l10.5-6.5L8 5.5Z" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
    </Frame>
  );
}

export function PauseIcon({ size, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Frame size={size}>
      <Path d="M9 5v14M15 5v14" stroke={stroke} strokeWidth={2.2} strokeLinecap="round" />
    </Frame>
  );
}

export function SpeakerIcon({ size, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Frame size={size}>
      <Path d="M4 9.5h3L11.5 6v12L7 14.5H4v-5Z" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <Path d="M15 9.5a3.5 3.5 0 0 1 0 5M17.5 7a7 7 0 0 1 0 10" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Frame>
  );
}

export function SpeakerOffIcon({ size, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Frame size={size}>
      <Path d="M4 9.5h3L11.5 6v12L7 14.5H4v-5Z" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <Path d="m15.5 9.5 5 5m0-5-5 5" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Frame>
  );
}

export function LinkIcon({ size, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Frame size={size}>
      <Path d="M10.5 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1.4 1.4" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path d="M13.5 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1.4-1.4" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Frame>
  );
}

export function CloseIcon({ size, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Frame size={size}>
      <Path d="m6 6 12 12M18 6 6 18" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Frame>
  );
}

export function SettingsIcon({ size, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Frame size={size}>
      <Circle cx="12" cy="12" r="3" stroke={stroke} strokeWidth={strokeWidth} />
      <Path
        d="M19.4 14.5a1.5 1.5 0 0 0 .3 1.65l.06.06a1.8 1.8 0 1 1-2.55 2.55l-.06-.06a1.5 1.5 0 0 0-1.65-.3 1.5 1.5 0 0 0-.9 1.37V20a1.8 1.8 0 1 1-3.6 0v-.1a1.5 1.5 0 0 0-.98-1.37 1.5 1.5 0 0 0-1.65.3l-.06.06A1.8 1.8 0 1 1 5.75 16.3l.06-.06a1.5 1.5 0 0 0 .3-1.65 1.5 1.5 0 0 0-1.37-.9H4a1.8 1.8 0 1 1 0-3.6h.1a1.5 1.5 0 0 0 1.37-.98 1.5 1.5 0 0 0-.3-1.65l-.06-.06A1.8 1.8 0 1 1 7.66 4.85l.06.06a1.5 1.5 0 0 0 1.65.3H9.5a1.5 1.5 0 0 0 .9-1.37V4a1.8 1.8 0 1 1 3.6 0v.1a1.5 1.5 0 0 0 .9 1.37 1.5 1.5 0 0 0 1.65-.3l.06-.06a1.8 1.8 0 1 1 2.55 2.55l-.06.06a1.5 1.5 0 0 0-.3 1.65v.06a1.5 1.5 0 0 0 1.37.9H20a1.8 1.8 0 1 1 0 3.6h-.1a1.5 1.5 0 0 0-1.37.9Z"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </Frame>
  );
}

export function SparkIcon({ size, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Frame size={size}>
      <Path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9 12 3.5Z" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <Path d="M18.5 16.5 19.2 19l2.3.8-2.3.8-.7 2.4" stroke={stroke} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
    </Frame>
  );
}

export function GoogleMark({ size = 17, color }: IconProps) {
  const fill = useStroke(color);
  return (
    <Frame size={size}>
      <Path d="M21.6 12.23c0-.7-.06-1.37-.18-2.02H12v3.82h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.23c1.89-1.74 2.98-4.3 2.98-7.32Z" fill={fill} />
      <Path d="M12 22c2.7 0 4.96-.9 6.61-2.43l-3.22-2.5c-.9.6-2.05.95-3.39.95-2.6 0-4.81-1.76-5.6-4.13H3.07v2.6A10 10 0 0 0 12 22Z" fill={fill} opacity={0.75} />
      <Path d="M6.4 13.89a6 6 0 0 1 0-3.78v-2.6H3.07a10 10 0 0 0 0 8.98l3.33-2.6Z" fill={fill} opacity={0.55} />
      <Path d="M12 5.98c1.47 0 2.79.5 3.83 1.5l2.85-2.85C16.95 2.99 14.7 2 12 2A10 10 0 0 0 3.07 7.51l3.33 2.6C7.19 7.74 9.4 5.98 12 5.98Z" fill={fill} opacity={0.9} />
    </Frame>
  );
}

export type IconComponent = (props: IconProps) => React.ReactNode;
