import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-full place-items-center px-5 py-24 text-center">
      <div className="max-w-[42ch]">
        <p className="text-accent text-[13px] font-semibold">404</p>
        <h1 className="ws-display text-fg mt-2 text-[26px]">Page not found</h1>
        <p className="text-fg/50 mt-2 text-[13.5px] font-normal">
          That page doesn&apos;t exist, or it has moved.
        </p>
        <Link
          href="/"
          className="bg-fg text-fg-invert mt-6 inline-flex h-10 cursor-pointer items-center rounded-full px-5 text-[13.5px] font-semibold transition-opacity hover:opacity-90"
        >
          Back to Vivid
        </Link>
      </div>
    </div>
  );
}
