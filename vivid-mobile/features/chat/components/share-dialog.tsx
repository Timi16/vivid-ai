import { useState } from "react";
import { Pressable, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Glass } from "@/components/ui/glass";
import { CopyIcon, LinkIcon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { Switch } from "@/components/ui/switch";
import { AppText } from "@/components/ui/text";
import { useTheme } from "@/hooks/use-theme";
import { copyText } from "@/lib/clipboard";
import { RADIUS } from "@/lib/theme";
import { toast } from "@/lib/toast";

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
}

// Sharing a thread. The link is a deep link into this app, so copying it
// gives something that resolves, but the thread is not actually published
// anywhere until there is a service to publish it to.
export function ShareDialog({ open, onOpenChange, sessionId }: ShareDialogProps) {
  const { theme } = useTheme();
  const [publicLink, setPublicLink] = useState(false);
  const url = `vivid://thread/${sessionId}`;

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Share thread" description="Anyone with the link can read this thread. Your account stays private.">
      <View style={{ gap: 16 }}>
        <Glass tier="well" radius={RADIUS.input} style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 12 }}>
          <LinkIcon size={16} color={theme.fg(0.4)} />
          <AppText size={12.5} tone={0.7} mono numberOfLines={1} style={{ flex: 1 }}>
            {url}
          </AppText>
          <Button
            size="sm"
            variant="secondary"
            label="Copy"
            icon={<CopyIcon size={14} color={theme.colors.fg} />}
            onPress={async () => {
              const ok = await copyText(url);
              toast(ok ? "Link copied" : "Couldn't copy the link", { description: ok ? undefined : "Copy it from the field instead." });
            }}
          />
        </Glass>

        <Pressable accessibilityRole="switch" onPress={() => setPublicLink((prev) => !prev)}>
          <Glass tier="control" sheen radius={RADIUS.input} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText size={13} weight="semibold">
                Make it public
              </AppText>
              <AppText size={12} weight="regular" tone={0.5}>
                Listed on your profile and discoverable.
              </AppText>
            </View>
            <Switch checked={publicLink} onCheckedChange={setPublicLink} />
          </Glass>
        </Pressable>
      </View>
    </Modal>
  );
}
