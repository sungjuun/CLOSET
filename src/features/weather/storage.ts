export const weatherStorage = {
  async get(key: string): Promise<string | null> { return typeof localStorage === 'undefined' ? null : localStorage.getItem(key); },
  async set(key: string, value: string): Promise<void> {
    if (typeof localStorage === 'undefined') throw new Error('기기 저장소를 사용할 수 없습니다.');
    localStorage.setItem(key, value);
  },
};
