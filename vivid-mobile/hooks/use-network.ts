import { useEffect, useState } from "react";
import { addEventListener } from "@react-native-community/netinfo";

// True until the OS says otherwise. `isInternetReachable` is null while the
// probe is still running, and a null must not read as offline.
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(
    () =>
      addEventListener((state) => {
        setOnline(state.isConnected !== false && state.isInternetReachable !== false);
      }),
    []
  );
  return online;
}
