import { z } from 'zod';
import { parseForecast, regionSchema, type WeatherRegion } from './model';

export function forecastUrl(region: WeatherRegion) {
  regionSchema.parse(region);
  const params = new URLSearchParams({
    latitude: String(region.latitude), longitude: String(region.longitude),
    current: 'temperature_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code',
    hourly: 'precipitation_probability', timezone: 'auto', timeformat: 'unixtime',
    wind_speed_unit: 'ms', temperature_unit: 'celsius', precipitation_unit: 'mm', forecast_days: '2',
  });
  return `https://api.open-meteo.com/v1/forecast?${params}`;
}

export async function requestJson(url: string, signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<unknown> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 12_000);
  try {
    const response = await fetcher(url, { signal: controller.signal, credentials: 'omit' });
    if (!response.ok) throw new Error('날씨 서비스에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.');
    return await response.json();
  } catch {
    if (signal?.aborted) throw new Error('조회가 취소되었습니다.');
    throw new Error('날씨를 불러오지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.');
  } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
}
export async function fetchForecast(region: WeatherRegion, signal: AbortSignal) {
  return parseForecast(await requestJson(forecastUrl(region), signal));
}
const searchSchema = z.object({ results: z.array(z.object({ id: z.number().int(), name: z.string().min(1).max(100), latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), admin1: z.string().optional(), population: z.number().nonnegative().optional() })).max(10).optional() });
export async function searchRegions(term: string, signal: AbortSignal): Promise<WeatherRegion[]> {
  const name = term.trim();
  if (name.length < 2 || name.length > 80) throw new Error('지역 이름을 2~80자로 입력해 주세요.');
  // Two-character searches are exact matches in GeoNames. Include administrative
  // suffixes so "성남" finds 성남시 rather than only small villages named 성남.
  const variants = /^[가-힣]{2,3}$/.test(name) && !(name.length >= 3 && /[시군구읍면동도]$/.test(name)) ? [name, `${name}시`, `${name}군`] : [name];
  const responses = await Promise.all(variants.map(async (variant) => {
    const params = new URLSearchParams({ name: variant, count: '5', language: 'ko', countryCode: 'KR' });
    return searchSchema.parse(await requestJson(`https://geocoding-api.open-meteo.com/v1/search?${params}`, signal));
  }));
  const unique = [...new Map(responses.flatMap((data) => data.results ?? []).map((region) => [region.id, region])).values()];
  return unique.sort((a, b) => (b.population ?? 0) - (a.population ?? 0)).slice(0, 5).map((region) => ({
    id: `geo-${region.id}`, name: region.admin1 && region.admin1 !== region.name ? `${region.name} · ${region.admin1}` : region.name,
    latitude: region.latitude, longitude: region.longitude,
  }));
}
