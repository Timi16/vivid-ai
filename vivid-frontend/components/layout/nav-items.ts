import {
  ArtifactsIcon,
  ComputerIcon,
  CustomizeIcon,
  HistoryIcon,
  SettingsIcon,
  SpacesIcon,
} from "@/components/ui/icons";

export interface NavItem {
  label: string;
  href: string;
  icon: (props: { size?: number; className?: string }) => React.ReactNode;
}

// Pages that exist in the design but have no service behind them yet stay
// hidden until they are real: a link into "isn't live yet" costs more trust
// than a missing link. Set NEXT_PUBLIC_PREVIEW_FEATURES=1 to see them.
export const previewFeatures = process.env.NEXT_PUBLIC_PREVIEW_FEATURES === "1";

const secondary: NavItem[] = [
  { label: "Artifacts", href: "/artifacts", icon: ArtifactsIcon },
  { label: "History", href: "/history", icon: HistoryIcon },
  { label: "Settings", href: "/settings", icon: SettingsIcon },
];

const preview: NavItem[] = [
  { label: "Computer", href: "/computer", icon: ComputerIcon },
  { label: "Spaces", href: "/spaces", icon: SpacesIcon },
  { label: "Customize", href: "/customize", icon: CustomizeIcon },
];

// The sidebar's lower rail: what is built, plus preview pages when enabled.
export const secondaryNav: NavItem[] = previewFeatures ? [...secondary, ...preview] : secondary;

// The discovery categories across the top of the workspace. All point at the
// one discover route with the topic in the query. Preview-only for now.
export const topicNav: { label: string; href: string }[] = previewFeatures
  ? [
      { label: "Discover", href: "/discover?topic=discover" },
      { label: "Finance", href: "/discover?topic=finance" },
      { label: "Health", href: "/discover?topic=health" },
      { label: "Academic", href: "/discover?topic=academic" },
      { label: "Patents", href: "/discover?topic=patents" },
    ]
  : [];
