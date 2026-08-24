import { useState } from "react";
import { View } from "react-native";

import { PageHeader } from "@/components/layout/page-header";
import { Tabs } from "@/components/ui/tabs";
import { AccountPanel } from "@/features/settings/components/account-panel";
import { AppearancePanel } from "@/features/settings/components/appearance-panel";
import { LanguagePanel } from "@/features/settings/components/language-panel";
import { NotificationsPanel } from "@/features/settings/components/notifications-panel";
import { ShortcutsPanel } from "@/features/settings/components/shortcuts-panel";
import { displayEmail, displayName, useMe } from "@/hooks/use-me";

type SettingsTab = "account" | "appearance" | "notifications" | "language" | "shortcuts";

const TABS: { value: SettingsTab; label: string }[] = [
  { value: "account", label: "Account" },
  { value: "appearance", label: "Appearance" },
  { value: "notifications", label: "Notifications" },
  { value: "language", label: "Language" },
  { value: "shortcuts", label: "Shortcuts" },
];

interface SettingsViewProps {
  plan: string;
  planActionSlot?: React.ReactNode;
  // Rendered under the account panel. The route passes the backend status
  // indicator, so settings never imports the system slice.
  systemSlot?: React.ReactNode;
}

export function SettingsView({ plan, planActionSlot, systemSlot }: SettingsViewProps) {
  const [tab, setTab] = useState<SettingsTab>("account");
  const { data: me } = useMe();
  const name = displayName(me);
  const email = displayEmail(me);

  return (
    <View>
      <PageHeader title="Settings" />

      <View style={{ marginTop: 24 }}>
        <Tabs value={tab} onChange={setTab} items={TABS} />
      </View>

      <View style={{ marginTop: 24 }}>
        {tab === "account" ? (
          <>
            <AccountPanel
              name={name}
              email={email}
              avatarUrl={me?.avatar_url}
              plan={plan}
              planActionSlot={planActionSlot}
            />
            {systemSlot ? <View style={{ marginTop: 24 }}>{systemSlot}</View> : null}
          </>
        ) : null}
        {tab === "appearance" ? <AppearancePanel /> : null}
        {tab === "notifications" ? <NotificationsPanel /> : null}
        {tab === "language" ? <LanguagePanel /> : null}
        {tab === "shortcuts" ? <ShortcutsPanel /> : null}
      </View>
    </View>
  );
}
