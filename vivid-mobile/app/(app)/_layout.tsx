import { Drawer } from "expo-router/drawer";

import { ActivityBanner } from "@/components/layout/activity-banner";
import { CommandPalette } from "@/components/layout/command-palette";
import { DrawerContent } from "@/components/layout/drawer-content";
import { Topbar } from "@/components/layout/topbar";

// The app shell. Every signed-in screen renders inside it: the drawer is the
// web's sidebar, the header is its topbar, and the search palette is mounted
// once here so any surface can open it.
export default function AppLayout() {
  return (
    <>
      <Drawer
        drawerContent={(props) => <DrawerContent {...props} />}
        screenOptions={{
          header: (props) => <Topbar {...props} />,
          drawerType: "front",
          drawerStyle: { width: 288, backgroundColor: "transparent" },
          sceneStyle: { backgroundColor: "transparent" },
          overlayColor: "rgba(0,0,0,0.55)",
          swipeEdgeWidth: 40,
        }}
      >
        <Drawer.Screen name="index" options={{ title: "New chat" }} />
        <Drawer.Screen name="artifacts" options={{ title: "Artifacts" }} />
        <Drawer.Screen name="history" options={{ title: "History" }} />
        <Drawer.Screen name="settings" options={{ title: "Settings" }} />
        <Drawer.Screen name="notifications" options={{ title: "Notifications" }} />
        <Drawer.Screen name="computer" options={{ title: "Computer" }} />
        <Drawer.Screen name="spaces" options={{ title: "Spaces" }} />
        <Drawer.Screen name="customize" options={{ title: "Customize" }} />
        <Drawer.Screen name="discover" options={{ title: "Discover" }} />
        <Drawer.Screen name="upgrade" options={{ title: "Upgrade" }} />
        <Drawer.Screen name="thread/[id]" options={{ title: "Thread" }} />
      </Drawer>
      <CommandPalette />
      <ActivityBanner />
    </>
  );
}
