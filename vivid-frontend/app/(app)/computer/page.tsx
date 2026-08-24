import type { Metadata } from "next";

import { ComputerView, SAMPLE_TASK } from "@/features/computer";
import { ComputerComposer } from "./computer-composer";

export const metadata: Metadata = { title: "Computer" };

// The route composes the two slices: computer owns the run, chat owns the
// prompt box, and neither imports the other.
export default function ComputerPage() {
  return <ComputerView task={SAMPLE_TASK} composerSlot={<ComputerComposer />} />;
}
