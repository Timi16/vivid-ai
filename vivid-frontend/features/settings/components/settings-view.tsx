"use client";

import { Tabs, TabsIndicator, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { PageHeader } from "@/components/layout/page-header";
import { AccountPanel } from "@/features/settings/components/account-panel";
import { AppearancePanel } from "@/features/settings/components/appearance-panel";
import { LanguagePanel } from "@/features/settings/components/language-panel";
import { NotificationsPanel } from "@/features/settings/components/notifications-panel";
import { ShortcutsPanel } from "@/features/settings/components/shortcuts-panel";
import { displayEmail, displayName, useMe } from "@/features/auth/hooks/use-me";

const TABS = [
  { value: "account", label: "Account" },
  { value: "appearance", label: "Appearance" },
  { value: "notifications", label: "Notifications" },
  { value: "language", label: "Language" },
  { value: "shortcuts", label: "Shortcuts" },
];

interface SettingsViewProps {
  plan: string;
  planActionSlot?: React.ReactNode;
}

export function SettingsView({ plan, planActionSlot }: SettingsViewProps) {
  const { data: me } = useMe();
  const name = displayName(me);
  const email = displayEmail(me);
  return (
    <div className="mx-auto w-full max-w-[760px] px-5 py-8">
      <PageHeader title="Settings" />

      <Tabs defaultValue="account" className="mt-6">
        <TabsList className="max-w-full overflow-x-auto">
          {TABS.map((tab) => (
            <TabsTab key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTab>
          ))}
          <TabsIndicator />
        </TabsList>

        <TabsPanel value="account" className="mt-6">
          <AccountPanel
            name={name}
            email={email}
            avatarUrl={me?.avatar_url}
            plan={plan}
            planActionSlot={planActionSlot}
          />
        </TabsPanel>
        <TabsPanel value="appearance" className="mt-6">
          <AppearancePanel />
        </TabsPanel>
        <TabsPanel value="notifications" className="mt-6">
          <NotificationsPanel />
        </TabsPanel>
        <TabsPanel value="language" className="mt-6">
          <LanguagePanel />
        </TabsPanel>
        <TabsPanel value="shortcuts" className="mt-6">
          <ShortcutsPanel />
        </TabsPanel>
      </Tabs>
    </div>
  );
}
