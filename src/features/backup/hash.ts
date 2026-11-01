export async function sha256(bytes: Uint8Array): Promise<string> {
  const owned = new Uint8Array(bytes);
  const result = await crypto.subtle.digest('SHA-256', owned.buffer);
  return Array.from(new Uint8Array(result), byte => byte.toString(16).padStart(2, '0')).join('');
}
