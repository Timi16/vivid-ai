import {
  ArtifactsIcon,
  ComputerIcon,
  CustomizeIcon,
  HistoryIcon,
  PlusIcon,
  SpacesIcon,
  type IconComponent,
} from "@/components/ui/icons";

export interface NavItem {
  label: string;
  // The route name inside the (app) drawer group.
  name: string;
  href: "/" | "/computer" | "/spaces" | "/artifacts" | "/customize" | "/history";
  icon: IconComponent;
}

// The drawer rail. Declared once so the drawer and any future command menu
// stay in step.
export const drawerNav: NavItem[] = [
  { label: "New", name: "index", href: "/", icon: PlusIcon },
  { label: "Computer", name: "computer", href: "/computer", icon: ComputerIcon },
  { label: "Spaces", name: "spaces", href: "/spaces", icon: SpacesIcon },
  { label: "Artifacts", name: "artifacts", href: "/artifacts", icon: ArtifactsIcon },
  { label: "Customize", name: "customize", href: "/customize", icon: CustomizeIcon },
  { label: "History", name: "history", href: "/history", icon: HistoryIcon },
];

// The discovery categories across the top of the workspace. All five point at
// the one discover route with the topic in the query.
export const topicNav: { label: string; topic: string }[] = [
  { label: "Discover", topic: "discover" },
  { label: "Finance", topic: "finance" },
  { label: "Health", topic: "health" },
  { label: "Academic", topic: "academic" },
  { label: "Patents", topic: "patents" },
];
