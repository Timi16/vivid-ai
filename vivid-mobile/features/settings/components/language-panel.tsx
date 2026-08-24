import { useState } from "react";
import { View } from "react-native";

import { AppText } from "@/components/ui/text";
import { SelectRow } from "@/components/ui/select-row";
import { toast } from "@/lib/toast";
import { LANGUAGES } from "@/features/settings/lib/data";
import { SettingGroup } from "@/features/settings/components/setting-row";

export function LanguagePanel() {
  const [code, setCode] = useState("en");

  return (
    <View style={{ gap: 24 }}>
      <SettingGroup title="Interface language">
        <View style={{ gap: 8, padding: 8 }}>
          {LANGUAGES.map((language) => (
            <SelectRow
              key={language.code}
              radio
              title={language.native}
              detail={language.name}
              selected={code === language.code}
              onPress={() => {
                setCode(language.code);
                if (language.code !== "en") {
                  toast(`${language.name} isn't translated yet`, {
                    description: "The interface stays in English until translations ship.",
                  });
                }
              }}
            />
          ))}
        </View>
      </SettingGroup>

      <AppText size={12} weight="regular" tone={0.4} lineHeight={18}>
        Answers are written in the language you ask in, whatever the interface is set to.
      </AppText>
    </View>
  );
}
