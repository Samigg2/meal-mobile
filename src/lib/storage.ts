import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

/**
 * Token storage. SecureStore (Keychain / Android Keystore) on device; the web
 * build falls back to AsyncStorage because SecureStore has no web backend.
 */
const useSecureStore = Platform.OS !== "web";

export const secureStorage = {
  async get(key: string): Promise<string | null> {
    try {
      return useSecureStore ? await SecureStore.getItemAsync(key) : await AsyncStorage.getItem(key);
    } catch {
      return null;
    }
  },
  async set(key: string, value: string): Promise<void> {
    try {
      if (useSecureStore) await SecureStore.setItemAsync(key, value);
      else await AsyncStorage.setItem(key, value);
    } catch {
      /* storage unavailable: the session stays in memory for this launch */
    }
  },
  async remove(key: string): Promise<void> {
    try {
      if (useSecureStore) await SecureStore.deleteItemAsync(key);
      else await AsyncStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};
