import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PREFERENCES, formatTemperature, isFresh, localDate, outfitHints, parseForecast, weatherCondition, type WeatherSnapshot } from '../src/features/weather/model';
import { createWeatherPreferenceStore, readWeatherPreferences, weatherPreferenceKey } from '../src/features/weather/preferences';
import { forecastUrl, requestJson, searchRegions } from '../src/features/weather/service';

const now = Date.parse('2026-10-29T00:15:00+09:00');
const seconds = now / 1000;
function response() {
  return {
    utc_offset_seconds: 32400,
    current_units: { time: 'unixtime', temperature_2m: '°C', apparent_temperature: '°C', wind_speed_10m: 'm/s', precipitation: 'mm' },
    current: { time: seconds, temperature_2m: 18, apparent_temperature: 12, is_day: 0, weather_code: 1, wind_speed_10m: 3, precipitation: 0 },
    daily_units: { time: 'unixtime', temperature_2m_max: '°C', temperature_2m_min: '°C', precipitation_probability_max: '%' },
    // A cached response spanning midnight must select the new local date.
    daily: { time: [Date.parse('2026-10-28T00:00:00+09:00') / 1000, Date.parse('2026-10-29T00:00:00+09:00') / 1000], temperature_2m_max: [25, 21], temperature_2m_min: [17, 11], precipitation_probability_max: [90, 20], weather_code: [61, 1] },
    hourly_units: { time: 'unixtime', precipitation_probability: '%' },
    hourly: { time: [seconds - 7200, seconds + 1800, seconds + 3600, seconds + 8 * 3600], precipitation_probability: [100, 20, 50, 95] },
  };
}
function snapshot(patch: Partial<WeatherSnapshot> = {}): WeatherSnapshot {
  return { ...parseForecast(response(), now), nextRainChance: 20, high: 20, low: 15, ...patch };
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('weather data boundaries', () => {
  it('uses the chosen city’s local date across midnight and the next six hours', () => {
    const data = parseForecast(response(), now);
    expect(data).toMatchObject({ high: 21, low: 11, rainChance: 20, nextRainChance: 50, dailyCode: 1, day: '2026-10-29' });
    expect(localDate(seconds, -18000)).toBe('2026-10-28');
  });
  it('preserves zero values while leaving missing readings unknown', () => {
    const raw = response();
    raw.current.temperature_2m = 0; raw.current.wind_speed_10m = 0;
    const data = parseForecast(raw, now);
    expect(data.temperature).toBe(0); expect(data.wind).toBe(0);
    const nullable = { ...raw, current: { ...raw.current, temperature_2m: null, apparent_temperature: null, wind_speed_10m: null }, daily: { ...raw.daily, precipitation_probability_max: [null, null] } };
    expect(parseForecast(nullable, now)).toMatchObject({ temperature: null, apparent: null, wind: null, rainChance: null });
    expect(formatTemperature(null)).toBe('—'); expect(formatTemperature(-0.1)).toBe('0°');
  });
  it('rejects wrong units rather than displaying km/h as m/s', () => {
    const raw = response(); raw.current_units.wind_speed_10m = 'km/h';
    expect(() => parseForecast(raw, now)).toThrow();
  });
  it('rejects malformed arrays, out of range probabilities and missing today', () => {
    const raw = response(); raw.daily.temperature_2m_max = [25];
    expect(() => parseForecast(raw, now)).toThrow();
    raw.daily.temperature_2m_max = [25, 21]; raw.hourly.precipitation_probability[0] = 101;
    expect(() => parseForecast(raw, now)).toThrow();
    expect(() => parseForecast(response(), now + 2 * 86400_000)).toThrow('오늘의 예보가 없습니다.');
  });
  it('suppresses stale, future or yesterday data and outfit hints', () => {
    expect(isFresh(snapshot(), now)).toBe(true);
    for (const data of [snapshot({ time: seconds - 5401 }), snapshot({ time: seconds + 901 }), snapshot({ day: '2026-10-28' })]) {
      expect(isFresh(data, now)).toBe(false); expect(outfitHints(data, 'normal', now)).toEqual([]);
    }
  });
  it.each([[0, '맑음', 'sun'], [2, '구름 조금', 'cloudSun'], [3, '흐림', 'cloud'], [48, '안개', 'fog'], [53, '이슬비', 'rain'], [67, '어는 비', 'rain'], [82, '비', 'rain'], [86, '눈', 'snow'], [99, '뇌우', 'storm'], [999, '날씨 정보 없음', 'cloud']] as const)('maps WMO code %s', (code, label, icon) => {
    expect(weatherCondition(code)).toEqual({ label, icon });
  });
  it('uses a moon at night and handles missing conditions', () => {
    expect(weatherCondition(1, false).icon).toBe('moon'); expect(weatherCondition(null).label).toBe('날씨 정보 없음');
  });
});

describe('outfit suggestions', () => {
  it('uses apparent temperature rather than actual temperature', () => {
    expect(outfitHints(snapshot({ temperature: 23, apparent: 12 }), 'normal', now)[0]).toContain('가벼운 아우터');
  });
  it('adjusts layers for personal cold sensitivity', () => {
    const data = snapshot({ apparent: 18 });
    expect(outfitHints(data, 'high', now)[0]).toContain('아우터');
    expect(outfitHints(data, 'normal', now)[0]).toContain('긴팔');
    expect(outfitHints(snapshot({ apparent: 20 }), 'low', now)[0]).toContain('반팔');
  });
  it('falls back to actual temperature and withholds advice with no temperature', () => {
    expect(outfitHints(snapshot({ apparent: null, temperature: -2 }), 'normal', now)[0]).toContain('패딩');
    expect(outfitHints(snapshot({ apparent: null, temperature: null }), 'normal', now)).toEqual([]);
  });
  it('adds wind protection without subtracting wind chill twice', () => {
    const calm = outfitHints(snapshot({ wind: 0 }), 'normal', now);
    const windy = outfitHints(snapshot({ wind: 7 }), 'normal', now);
    expect(calm[0]).toBe(windy[0]); expect(windy.join(' ')).toContain('바람을 막아주는');
    expect(outfitHints(snapshot({ apparent: 28, wind: 7 }), 'normal', now).join(' ')).not.toContain('겉옷');
  });
  it.each([{ precipitation: 0.1 }, { rainChance: 70 }, { nextRainChance: 60 }, { code: 61 }, { dailyCode: 95 }])('warns about suede for rain input %j', (patch) => {
    expect(outfitHints(snapshot(patch), 'normal', now).join(' ')).toContain('스웨이드');
  });
  it.each([71, 85, 66])('prioritizes waterproof shoes for snow or freezing rain %s', (code) => {
    const hints = outfitHints(snapshot({ code, dailyCode: 61 }), 'normal', now).join(' ');
    expect(hints).toContain('미끄럼 방지'); expect(hints).not.toContain('스웨이드');
  });
  it('adds large day/night range advice and caps advice at three items', () => {
    expect(outfitHints(snapshot({ high: 24, low: 10 }), 'normal', now).join(' ')).toContain('일교차');
    expect(outfitHints(snapshot({ high: 24, low: 10, code: 61, wind: 8 }), 'normal', now)).toHaveLength(3);
  });
});

describe('weather requests and preferences', () => {
  it('requests Celsius, m/s, correct fields and no API key', () => {
    const url = new URL(forecastUrl(DEFAULT_PREFERENCES.region));
    expect(url.origin).toBe('https://api.open-meteo.com');
    expect(url.searchParams.get('wind_speed_unit')).toBe('ms');
    expect(url.searchParams.get('temperature_unit')).toBe('celsius');
    expect(url.searchParams.get('current')).toContain('apparent_temperature');
    expect(url.searchParams.has('apikey')).toBe(false);
    expect(() => forecastUrl({ ...DEFAULT_PREFERENCES.region, latitude: NaN })).toThrow();
  });
  it('omits cookies and does not expose service errors', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"private":"details"}', { status: 500 }));
    await expect(requestJson('https://api.open-meteo.com', undefined, fetcher)).rejects.toThrow('날씨를 불러오지 못했습니다.');
    expect(fetcher.mock.calls[0]?.[1]?.credentials).toBe('omit');
  });
  it('times out and releases the timer', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new Error('abort')));
    }));
    const promise = requestJson('https://api.open-meteo.com', undefined, fetcher);
    const assertion = expect(promise).rejects.toThrow('날씨를 불러오지 못했습니다.');
    await vi.advanceTimersByTimeAsync(12_000); await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });
  it('propagates query cancellation', async () => {
    const parent = new AbortController();
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new Error('abort')));
    }));
    const promise = requestJson('https://api.open-meteo.com', parent.signal, fetcher);
    parent.abort(); await expect(promise).rejects.toThrow('취소');
  });
  it('encodes Korean search terms, limits results and handles no results', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify({ results: [{ id: 1, name: '성남', latitude: 37.4, longitude: 127.1, admin1: '경기도' }] })));
    vi.stubGlobal('fetch', fetcher);
    const results = await searchRegions('  성남  ', new AbortController().signal);
    expect(results[0]).toMatchObject({ id: 'geo-1', name: '성남 · 경기도' });
    const url = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(url.searchParams.get('name')).toBe('성남'); expect(url.searchParams.get('count')).toBe('5'); expect(url.searchParams.get('countryCode')).toBe('KR');
    expect(fetcher.mock.calls.map(([url]) => new URL(String(url)).searchParams.get('name'))).toEqual(['성남', '성남시', '성남군']);
    expect(results).toHaveLength(1);
    fetcher.mockImplementation(async () => new Response('{}'));
    expect(await searchRegions('없는도시', new AbortController().signal)).toEqual([]);
    await expect(searchRegions('a', new AbortController().signal)).rejects.toThrow('2~80자');
  });
  it('ranks the populated city above same-name villages and preserves disambiguation', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(async (url) => {
      const name = new URL(String(url)).searchParams.get('name');
      return new Response(JSON.stringify({ results: name === '성남시' ? [{ id: 2, name: '성남시', admin1: '경기도', latitude: 37.4, longitude: 127.1, population: 914832 }] : name === '성남' ? [{ id: 1, name: '성남', admin1: '전라남도', latitude: 34.7, longitude: 126.8 }] : [] }));
    }));
    const results = await searchRegions('성남', new AbortController().signal);
    expect(results.map((item) => item.name)).toEqual(['성남시 · 경기도', '성남 · 전라남도']);
  });
  it('isolates preference keys and validates stored preferences', () => {
    expect(weatherPreferenceKey('owner-a')).not.toBe(weatherPreferenceKey('owner-b'));
    expect(readWeatherPreferences(JSON.stringify(DEFAULT_PREFERENCES))).toEqual(DEFAULT_PREFERENCES);
    for (const raw of [null, '{broken', '{}', JSON.stringify({ ...DEFAULT_PREFERENCES, sensitivity: 'invalid' }), JSON.stringify({ ...DEFAULT_PREFERENCES, region: { ...DEFAULT_PREFERENCES.region, longitude: 181 } })]) {
      expect(readWeatherPreferences(raw)).toBeNull();
    }
  });
  it('restores the latest choice after navigating while a previous write is pending', async () => {
    const data = new Map<string, string>();
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    const store = createWeatherPreferenceStore({
      get: async (key) => data.get(key) ?? null,
      set: async (key, value) => { await barrier; data.set(key, value); },
    });
    const first = store.save('a', DEFAULT_PREFERENCES);
    const latest = { ...DEFAULT_PREFERENCES, sensitivity: 'high' as const };
    const second = store.save('a', latest);
    const restore = store.load('a');
    expect(await store.load('b')).toBeNull();
    release(); await Promise.all([first, second]);
    expect(await restore).toEqual(latest);
  });
  it('allows subsequent saves after a device storage failure', async () => {
    let value: string | null = null;
    const set = vi.fn<(key: string, raw: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('storage full')).mockImplementation(async (_key, raw) => { value = raw; });
    const store = createWeatherPreferenceStore({ get: async () => value, set });
    const failed = store.save('a', DEFAULT_PREFERENCES);
    const next = store.save('a', { ...DEFAULT_PREFERENCES, sensitivity: 'low' });
    await expect(failed).rejects.toThrow('storage full'); await next;
    expect((await store.load('a'))?.sensitivity).toBe('low');
  });
});
