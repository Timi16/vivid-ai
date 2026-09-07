import { Screen } from "@/components/layout/screen";
import { GeneratedFilesView } from "@/features/artifacts";

export default function ImagesRoute() {
  return (
    <Screen>
      <GeneratedFilesView
        kind="image"
        title="Images"
        description="Every picture Vivid has generated for you, across every chat."
      />
    </Screen>
  );
}
