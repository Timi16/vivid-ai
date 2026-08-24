import { useState } from "react";
import { View } from "react-native";

import { PageHeader } from "@/components/layout/page-header";
import { Tabs } from "@/components/ui/tabs";
import { AccountPanel } from "@/features/settings/components/account-panel";
import { AppearancePanel } from "@/features/settings/components/appearance-panel";
import { LanguagePanel } from "@/features/settings/components/language-panel";
import { NotificationsPanel } from "@/features/settings/components/notifications-panel";

type SettingsTab = "account" | "appearance" | "notifications" | "language";

// Keyboard shortcuts are desktop-only, so the web's Shortcuts tab is not here.
const TABS: { value: SettingsTab; label: string }[] = [
  { value: "account", label: "Account" },
  { value: "appearance", label: "Appearance" },
  { value: "notifications", label: "Notifications" },
  { value: "language", label: "Language" },
];

interface SettingsViewProps {
  name: string;
  email: string;
  plan: string;
  planActionSlot?: React.ReactNode;
}

export function SettingsView({ name, email, plan, planActionSlot }: SettingsViewProps) {
  const [tab, setTab] = useState<SettingsTab>("account");

  return (
    <View>
      <PageHeader title="Settings" />

      <View style={{ marginTop: 24 }}>
        <Tabs value={tab} onChange={setTab} items={TABS} />
      </View>

      <View style={{ marginTop: 24 }}>
        {tab === "account" ? (
          <AccountPanel name={name} email={email} plan={plan} planActionSlot={planActionSlot} />
        ) : null}
        {tab === "appearance" ? <AppearancePanel /> : null}
        {tab === "notifications" ? <NotificationsPanel /> : null}
        {tab === "language" ? <LanguagePanel /> : null}
      </View>
    </View>
  );
}
