import { Suspense } from "react";
import type { Metadata } from "next";

import { VerifyForm } from "@/features/auth";

export const metadata: Metadata = { title: "Check your email" };

export default function VerifyPage() {
  // useSearchParams needs a Suspense boundary so the rest of the page can be
  // prerendered rather than the whole route opting into client rendering.
  return (
    <Suspense fallback={null}>
      <VerifyForm />
    </Suspense>
  );
}
