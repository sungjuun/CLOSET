import * as Crypto from 'expo-crypto';

export async function sha256(bytes: Uint8Array): Promise<string> {
  const result = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, new Uint8Array(bytes));
  return Array.from(new Uint8Array(result), byte => byte.toString(16).padStart(2, '0')).join('');
}
