import { useState } from "react";
import { Image, View } from "react-native";

import { AppText } from "@/components/ui/text";
import { useTheme } from "@/hooks/use-theme";
import { initials } from "@/lib/format";

type Size = "sm" | "md" | "lg";

const SIZE: Record<Size, { box: number; text: number }> = {
  sm: { box: 28, text: 10 },
  md: { box: 36, text: 12 },
  lg: { box: 48, text: 15 },
};

interface AvatarProps {
  name: string;
  src?: string | null;
  size?: Size;
}

// Photo when there is one (Google sign-in supplies it), initials otherwise,
// and initials again if the photo fails to load, since a broken image is a
// worse fallback than a letter.
export function Avatar({ name, src, size = "md" }: AvatarProps) {
  const { theme } = useTheme();
  const [broken, setBroken] = useState(false);
  const dims = SIZE[size];
  const showImage = Boolean(src) && !broken;
  return (
    <View
      accessibilityLabel={name}
      style={{
        width: dims.box,
        height: dims.box,
        borderRadius: dims.box / 2,
        overflow: "hidden",
        backgroundColor: theme.fg(0.1),
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {showImage ? (
        <Image
          source={{ uri: src ?? "" }}
          onError={() => setBroken(true)}
          style={{ width: dims.box, height: dims.box }}
        />
      ) : (
        <AppText size={dims.text} weight="semibold" tone={0.8}>
          {initials(name)}
        </AppText>
      )}
    </View>
  );
}
