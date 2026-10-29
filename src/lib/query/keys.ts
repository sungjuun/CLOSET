type PrivateResource = 'wardrobe' | 'brands' | 'categories' | 'outfits' | 'wear' | 'insights' | 'profile';

export function privateQueryPrefix(userId: string, resource: PrivateResource) {
  if (!userId.trim()) throw new Error('인증된 사용자 ID가 필요합니다.');
  return ['private', userId, resource] as const;
}

export function privateQueryKey(
  userId: string,
  resource: PrivateResource,
  filters: Readonly<Record<string, unknown>> = {},
) {
  return [...privateQueryPrefix(userId, resource), filters] as const;
}
