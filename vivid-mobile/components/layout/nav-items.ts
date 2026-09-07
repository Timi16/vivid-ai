import {
  ArtifactsIcon,
  ComputerIcon,
  CustomizeIcon,
  HistoryIcon,
  ImagesIcon,
  SettingsIcon,
  SpacesIcon,
  VideosIcon,
  type IconComponent,
} from "@/components/ui/icons";
import { PREVIEW_FEATURES } from "@/config/env";

export type AppHref =
  | "/"
  | "/computer"
  | "/spaces"
  | "/artifacts"
  | "/images"
  | "/videos"
  | "/customize"
  | "/history"
  | "/settings"
  | "/upgrade"
  | "/discover";

export interface NavItem {
  label: string;
  // The route name inside the (app) drawer group.
  name: string;
  href: AppHref;
  icon: IconComponent;
}

// Pages that exist in the design but have no service behind them yet stay
// hidden until they are real: a link into "isn't live yet" costs more trust
// than a missing link. Set EXPO_PUBLIC_PREVIEW_FEATURES=1 to see them.
export const previewFeatures = PREVIEW_FEATURES;

// What Vivid makes, kept next to New chat and Search at the top of the
// drawer: these are places to go, not settings. Mirrors the web sidebar.
export const primaryNav: NavItem[] = [
  { label: "Images", name: "images", href: "/images", icon: ImagesIcon },
  { label: "Videos", name: "videos", href: "/videos", icon: VideosIcon },
];

const secondary: NavItem[] = [
  { label: "Artifacts", name: "artifacts", href: "/artifacts", icon: ArtifactsIcon },
  { label: "History", name: "history", href: "/history", icon: HistoryIcon },
  { label: "Settings", name: "settings", href: "/settings", icon: SettingsIcon },
];

const preview: NavItem[] = [
  { label: "Computer", name: "computer", href: "/computer", icon: ComputerIcon },
  { label: "Spaces", name: "spaces", href: "/spaces", icon: SpacesIcon },
  { label: "Customize", name: "customize", href: "/customize", icon: CustomizeIcon },
];

// The drawer's lower rail: what is built, plus preview pages when enabled.
export const secondaryNav: NavItem[] = previewFeatures ? [...secondary, ...preview] : secondary;

// The discovery categories across the top of the workspace. All point at the
// one discover route with the topic in the query. Preview-only for now.
export const topicNav: { label: string; topic: string }[] = previewFeatures
  ? [
      { label: "Discover", topic: "discover" },
      { label: "Finance", topic: "finance" },
      { label: "Health", topic: "health" },
      { label: "Academic", topic: "academic" },
      { label: "Patents", topic: "patents" },
    ]
  : [];
