import { Drawer } from "expo-router/drawer";

import { DrawerContent } from "@/components/layout/drawer-content";
import { Topbar } from "@/components/layout/topbar";

// The app shell. Every signed-in screen renders inside it: the drawer is the
// web's sidebar, the header is its topbar.
export default function AppLayout() {
  return (
    <Drawer
      drawerContent={(props) => <DrawerContent {...props} />}
      screenOptions={{
        header: (props) => <Topbar {...props} />,
        drawerType: "front",
        drawerStyle: { width: 272, backgroundColor: "transparent" },
        sceneStyle: { backgroundColor: "transparent" },
        overlayColor: "rgba(0,0,0,0.55)",
        swipeEdgeWidth: 40,
      }}
    >
      <Drawer.Screen name="index" options={{ title: "New" }} />
      <Drawer.Screen name="computer" options={{ title: "Computer" }} />
      <Drawer.Screen name="spaces" options={{ title: "Spaces" }} />
      <Drawer.Screen name="artifacts" options={{ title: "Artifacts" }} />
      <Drawer.Screen name="customize" options={{ title: "Customize" }} />
      <Drawer.Screen name="history" options={{ title: "History" }} />
      <Drawer.Screen name="discover" options={{ title: "Discover", drawerItemStyle: { display: "none" } }} />
      <Drawer.Screen name="settings" options={{ title: "Settings", drawerItemStyle: { display: "none" } }} />
      <Drawer.Screen name="upgrade" options={{ title: "Upgrade", drawerItemStyle: { display: "none" } }} />
      <Drawer.Screen name="thread/[id]" options={{ title: "Thread", drawerItemStyle: { display: "none" }, swipeEnabled: false }} />
    </Drawer>
  );
}
