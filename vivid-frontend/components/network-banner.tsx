"use client";

import { useEffect, useState } from "react";

// A persistent, unmissable strip while the device is offline. Individual
// requests already fail loudly; this covers the case where the user is about
// to type into a dead connection.
export function NetworkBanner() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  if (online) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-[70] bg-red-500/95 py-2 text-center text-[13px] font-medium text-white">
      No internet connection — reconnect to keep chatting.
    </div>
  );
}
