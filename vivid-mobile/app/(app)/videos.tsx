import { Screen } from "@/components/layout/screen";
import { GeneratedFilesView } from "@/features/artifacts";

export default function VideosRoute() {
  return (
    <Screen>
      <GeneratedFilesView
        kind="video"
        title="Videos"
        description="Every clip Vivid has generated for you, across every chat."
      />
    </Screen>
  );
}
