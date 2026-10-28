import * as SecureStore from 'expo-secure-store';
import { decodeChunkedStorage } from './chunkedStorage';

export const sessionStorage = decodeChunkedStorage({
  getItem: SecureStore.getItemAsync,
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: SecureStore.deleteItemAsync,
});
