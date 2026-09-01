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
        {/* The chat screen is the product, so its header carries the product
            name rather than a verb. Only the header reads this: the drawer
            renders its own "New chat" button. */}
        <Drawer.Screen name="index" options={{ title: "Vivid AI" }} />
        <Drawer.Screen name="artifacts" options={{ title: "Artifacts" }} />
        <Drawer.Screen name="history" options={{ title: "History" }} />
        <Drawer.Screen name="settings" options={{ title: "Settings" }} />
        <Drawer.Screen name="notifications" options={{ title: "Notifications" }} />
        <Drawer.Screen name="computer" options={{ title: "Computer" }} />
        <Drawer.Screen name="spaces" options={{ title: "Spaces" }} />
        <Drawer.Screen name="customize" options={{ title: "Customize" }} />
        <Drawer.Screen name="discover" options={{ title: "Discover" }} />
        <Drawer.Screen name="upgrade" options={{ title: "Upgrade" }} />
        {/* A thread is not somewhere else you went, it is this screen with a
            conversation in it -- sending the first message swaps the route
            underneath you. Titling it "Thread" made that swap look like
            navigation, so it carries the same name as the chat screen. */}
        <Drawer.Screen name="thread/[id]" options={{ title: "Vivid AI" }} />
      </Drawer>
      <CommandPalette />
      <ActivityBanner />
    </>
  );
}
