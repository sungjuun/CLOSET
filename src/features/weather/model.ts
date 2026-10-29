import { z } from 'zod';

export const regionSchema = z.object({
  id: z.string().min(1).max(100), name: z.string().min(1).max(100),
  latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180),
});
export type WeatherRegion = z.infer<typeof regionSchema>;
export const REGIONS: WeatherRegion[] = [
  { id: 'seoul', name: '서울', latitude: 37.5665, longitude: 126.978 },
  { id: 'busan', name: '부산', latitude: 35.1796, longitude: 129.0756 },
  { id: 'incheon', name: '인천', latitude: 37.4563, longitude: 126.7052 },
  { id: 'daegu', name: '대구', latitude: 35.8714, longitude: 128.6014 },
  { id: 'daejeon', name: '대전', latitude: 36.3504, longitude: 127.3845 },
  { id: 'gwangju', name: '광주', latitude: 35.1595, longitude: 126.8526 },
  { id: 'ulsan', name: '울산', latitude: 35.5384, longitude: 129.3114 },
  { id: 'sejong', name: '세종', latitude: 36.4801, longitude: 127.289 },
  { id: 'jeju', name: '제주', latitude: 33.4996, longitude: 126.5312 },
];
export const sensitivitySchema = z.enum(['low', 'normal', 'high']);
export type ColdSensitivity = z.infer<typeof sensitivitySchema>;
export const preferencesSchema = z.object({ region: regionSchema, sensitivity: sensitivitySchema });
export type WeatherPreferences = z.infer<typeof preferencesSchema>;
export const DEFAULT_PREFERENCES: WeatherPreferences = { region: REGIONS[0]!, sensitivity: 'normal' };

const temperature = z.number().min(-100).max(70).nullable();
const probability = z.number().min(0).max(100).nullable();
const code = z.number().int().min(0).max(999).nullable();
const timestamp = z.number().int().positive();
const forecastSchema = z.object({
  utc_offset_seconds: z.number().int().min(-43200).max(50400),
  current_units: z.object({ time: z.literal('unixtime'), temperature_2m: z.literal('°C'), apparent_temperature: z.literal('°C'), wind_speed_10m: z.literal('m/s'), precipitation: z.literal('mm') }),
  current: z.object({ time: timestamp, temperature_2m: temperature, apparent_temperature: temperature, is_day: z.union([z.literal(0), z.literal(1)]).nullable(), weather_code: code, wind_speed_10m: z.number().min(0).max(150).nullable(), precipitation: z.number().min(0).max(1000).nullable() }),
  daily_units: z.object({ time: z.literal('unixtime'), temperature_2m_max: z.literal('°C'), temperature_2m_min: z.literal('°C'), precipitation_probability_max: z.literal('%') }),
  daily: z.object({ time: z.array(timestamp).min(1), temperature_2m_max: z.array(temperature), temperature_2m_min: z.array(temperature), precipitation_probability_max: z.array(probability), weather_code: z.array(code) }),
  hourly_units: z.object({ time: z.literal('unixtime'), precipitation_probability: z.literal('%') }),
  hourly: z.object({ time: z.array(timestamp), precipitation_probability: z.array(probability) }),
}).superRefine((data, ctx) => {
  if ([data.daily.temperature_2m_max, data.daily.temperature_2m_min, data.daily.precipitation_probability_max, data.daily.weather_code].some((values) => values.length !== data.daily.time.length) || data.hourly.time.length !== data.hourly.precipitation_probability.length) {
    ctx.addIssue({ code: 'custom', message: '날씨 데이터 길이가 일치하지 않습니다.' });
  }
});

export type WeatherSnapshot = {
  time: number; offset: number; temperature: number | null; apparent: number | null;
  isDay: boolean; code: number | null; wind: number | null; precipitation: number | null;
  high: number | null; low: number | null; rainChance: number | null; nextRainChance: number | null;
  dailyCode: number | null; day: string;
};
export function localDate(seconds: number, offset: number) {
  return new Date((seconds + offset) * 1000).toISOString().slice(0, 10);
}
export function parseForecast(raw: unknown, now = Date.now()): WeatherSnapshot {
  const data = forecastSchema.parse(raw);
  const day = localDate(now / 1000, data.utc_offset_seconds);
  const index = data.daily.time.findIndex((time) => localDate(time, data.utc_offset_seconds) === day);
  if (index < 0) throw new Error('오늘의 예보가 없습니다.');
  const upcoming = data.hourly.time.flatMap((time, i) => {
    const value = data.hourly.precipitation_probability[i];
    return time > now / 1000 - 3600 && time <= now / 1000 + 6 * 3600 && value != null ? [value] : [];
  });
  return {
    time: data.current.time, offset: data.utc_offset_seconds, day,
    temperature: data.current.temperature_2m, apparent: data.current.apparent_temperature,
    isDay: data.current.is_day !== 0, code: data.current.weather_code,
    wind: data.current.wind_speed_10m, precipitation: data.current.precipitation,
    high: data.daily.temperature_2m_max[index] ?? null, low: data.daily.temperature_2m_min[index] ?? null,
    rainChance: data.daily.precipitation_probability_max[index] ?? null,
    dailyCode: data.daily.weather_code[index] ?? null, nextRainChance: upcoming.length ? Math.max(...upcoming) : null,
  };
}
export function isFresh(weather: WeatherSnapshot, now = Date.now()) {
  const age = now / 1000 - weather.time;
  return age >= -900 && age <= 5400 && weather.day === localDate(now / 1000, weather.offset);
}
export const formatTemperature = (value: number | null) => value == null ? '—' : `${Math.round(value) === 0 ? 0 : Math.round(value)}°`;
export function weatherCondition(code: number | null, isDay = true) {
  if (code === 0 || code === 1) return { label: code === 0 ? '맑음' : '대체로 맑음', icon: isDay ? 'sun' : 'moon' } as const;
  if (code === 2) return { label: '구름 조금', icon: isDay ? 'cloudSun' : 'cloud' } as const;
  if (code === 3) return { label: '흐림', icon: 'cloud' } as const;
  if (code === 45 || code === 48) return { label: '안개', icon: 'fog' } as const;
  if ([71, 73, 75, 77, 85, 86].includes(code ?? -1)) return { label: '눈', icon: 'snow' } as const;
  if ([56, 57, 66, 67].includes(code ?? -1)) return { label: '어는 비', icon: 'rain' } as const;
  if ([51, 53, 55].includes(code ?? -1)) return { label: '이슬비', icon: 'rain' } as const;
  if ([61, 63, 65, 80, 81, 82].includes(code ?? -1)) return { label: '비', icon: 'rain' } as const;
  if ([95, 96, 97, 99].includes(code ?? -1)) return { label: '뇌우', icon: 'storm' } as const;
  return { label: '날씨 정보 없음', icon: 'cloud' } as const;
}

export function outfitHints(weather: WeatherSnapshot, sensitivity: ColdSensitivity, now = Date.now()): string[] {
  if (!isFresh(weather, now)) return [];
  const apparent = weather.apparent ?? weather.temperature;
  if (apparent == null) return [];
  // Apparent temperature already accounts for wind. Only personal preference adjusts it.
  const temperature = apparent + (sensitivity === 'high' ? -3 : sensitivity === 'low' ? 3 : 0);
  const hints = [temperature < 0 ? '두꺼운 패딩과 보온 이너를 챙겨요.'
    : temperature < 5 ? '두꺼운 코트·패딩에 니트를 겹쳐 입어요.'
    : temperature < 10 ? '코트나 도톰한 재킷에 니트를 더해요.'
    : temperature < 17 ? '가벼운 아우터를 챙겨요.'
    : temperature < 22 ? '긴팔이나 얇은 가디건이 좋아요.'
    : temperature < 27 ? '가벼운 반팔과 통기성 좋은 옷이 좋아요.'
    : '시원한 소재의 반팔과 가벼운 옷을 골라요.'];
  const conditions = [weatherCondition(weather.code), weatherCondition(weather.dailyCode)];
  if (conditions.some(({ icon, label }) => icon === 'snow' || label === '어는 비')) hints.push('눈·결빙 예보가 있어요. 방수와 미끄럼 방지 신발을 챙겨요.');
  else if ((weather.precipitation ?? 0) > 0 || conditions.some(({ icon }) => icon === 'rain' || icon === 'storm') || (weather.nextRainChance ?? 0) >= 50 || (weather.rainChance ?? 0) >= 60) hints.push('비에 대비해 우산을 챙기고 스웨이드 신발은 주의해요.');
  if ((weather.wind ?? 0) >= 5 && temperature < 22) hints.push('바람이 강해요. 바람을 막아주는 겉옷이 좋아요.');
  if (hints.length < 3 && weather.high != null && weather.low != null && weather.high - weather.low >= 10) hints.push('일교차가 커요. 쉽게 벗어둘 수 있는 겉옷을 챙겨요.');
  return hints.slice(0, 3);
}
