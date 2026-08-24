import { AmbientBackdrop } from "@/components/layout/ambient-backdrop";

// Auth renders full-bleed, without the sidebar or topic nav, but keeps the same
// ambient light so the glass reads the same as it does inside the app.
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="relative isolate grid min-h-dvh place-items-center px-5 py-12">
      <AmbientBackdrop />
      {children}
    </div>
  );
}
