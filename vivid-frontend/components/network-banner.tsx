"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

// A persistent, unmissable strip while the device is offline. Individual
// requests already fail loudly; this covers the case where the user is about
// to type into a dead connection.
export function NetworkBanner() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);

  if (online) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-[70] bg-red-500/95 py-2 text-center text-[13px] font-medium text-white">
      No internet connection. Reconnect to keep chatting.
    </div>
  );
}
