import { ScrollView } from "react-native";

import { Chip } from "@/components/ui/chip";

interface TabsProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  items: { value: T; label: string }[];
}

// A horizontal row of pills. Scrolls when the labels outgrow the screen.
export function Tabs<T extends string>({ value, onChange, items }: TabsProps<T>) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
    >
      {items.map((item) => (
        <Chip
          key={item.value}
          label={item.label}
          selected={item.value === value}
          onPress={() => onChange(item.value)}
          accessibilityRole="tab"
        />
      ))}
    </ScrollView>
  );
}
