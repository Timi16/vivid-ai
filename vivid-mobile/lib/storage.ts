// The three kinds of client-side storage the app needs, each with one job.
//
// - Secrets (the auth token bundle) go in the device keystore via SecureStore.
// - Preferences and drafts go in AsyncStorage: survivable, not sensitive.
// - Cross-screen handoffs (the launcher stashing the first prompt for the
//   thread it just created) are in-memory, mirroring the web's sessionStorage:
//   they only need to outlive one navigation.

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

export const secureStorage = {
  async get(key: string): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  async set(key: string, value: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      // Keystore unavailable (rare, usually a locked device). The in-memory
      // copy still serves this session; the next launch signs in again.
    }
  },
  async remove(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // nothing to remove
    }
  },
};

export const preferences = {
  async get(key: string): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(key);
    } catch {
      return null;
    }
  },
  async set(key: string, value: string): Promise<void> {
    try {
      await AsyncStorage.setItem(key, value);
    } catch {
      // Not persisting a preference is survivable.
    }
  },
  async remove(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key);
    } catch {
      // nothing to remove
    }
  },
};

const handoffs = new Map<string, string>();

export const handoff = {
  set(key: string, value: string) {
    handoffs.set(key, value);
  },
  // Read-once: the launcher's stash must act exactly one time.
  take(key: string): string | null {
    const value = handoffs.get(key) ?? null;
    handoffs.delete(key);
    return value;
  },
};
