export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="grid min-h-[50vh] place-items-center">
      <span className="sr-only">Loading</span>
      <span
        aria-hidden="true"
        className="border-fg/25 size-5 animate-spin rounded-full border-2 border-t-white"
      />
    </div>
  );
}
