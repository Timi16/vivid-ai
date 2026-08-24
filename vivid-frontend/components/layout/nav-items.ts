import {
  ArtifactsIcon,
  ComputerIcon,
  CustomizeIcon,
  HistoryIcon,
  PlusIcon,
  SpacesIcon,
} from "@/components/ui/icons";

export interface NavItem {
  label: string;
  href: string;
  icon: (props: { size?: number; className?: string }) => React.ReactNode;
}

// The sidebar rail. Declared once so the sidebar and any future command menu
// stay in step. Routes that do not exist yet still belong here: the design
// includes them, and a missing page is a clearer gap than a missing link.
export const sidebarNav: NavItem[] = [
  { label: "New", href: "/", icon: PlusIcon },
  { label: "Computer", href: "/computer", icon: ComputerIcon },
  { label: "Spaces", href: "/spaces", icon: SpacesIcon },
  { label: "Artifacts", href: "/artifacts", icon: ArtifactsIcon },
  { label: "Customize", href: "/customize", icon: CustomizeIcon },
  { label: "History", href: "/history", icon: HistoryIcon },
];

// The discovery categories across the top of the workspace. All five point at
// the one discover route with the topic in the query, rather than five routes
// rendering the same shell.
export const topicNav: { label: string; href: string }[] = [
  { label: "Discover", href: "/discover?topic=discover" },
  { label: "Finance", href: "/discover?topic=finance" },
  { label: "Health", href: "/discover?topic=health" },
  { label: "Academic", href: "/discover?topic=academic" },
  { label: "Patents", href: "/discover?topic=patents" },
];
