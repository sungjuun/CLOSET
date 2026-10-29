import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { Icon, type IconName } from '@/components/ui/Icon';
import { SelectField } from '@/components/ui/SelectField';
import { FormField } from '@/components/ui/FormField';
import { ActionButton } from '@/components/ui/ActionButton';
import { useTheme } from '@/theme/useTheme';
import { DEFAULT_PREFERENCES, formatTemperature, isFresh, outfitHints, REGIONS, weatherCondition, type ColdSensitivity, type WeatherPreferences } from './model';
import { fetchForecast, searchRegions } from './service';
import { weatherPreferenceStore } from './preferenceStore';

type Props = { owner: string | null; compact: boolean; renderHeader: (control: ReactNode) => ReactNode };
export function HeaderWeather(props: Props) {
  return props.owner ? <ScopedWeather key={props.owner} {...props} owner={props.owner} /> : <>{props.renderHeader(null)}</>;
}

function ScopedWeather({ owner, compact, renderHeader }: Props & { owner: string }) {
  const colors = useTheme();
  const { height, width } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);
  const [searchDraft, setSearchDraft] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchValidation, setSearchValidation] = useState<string | undefined>();
  const lifecycle = useRef({ active: true, revision: 0 });

  useEffect(() => {
    let active = true;
    const scope = lifecycle.current;
    scope.active = true;
    void weatherPreferenceStore.load(owner).then((saved) => {
      if (!active) return;
      if (saved) setPreferences(saved);
    }).catch(() => { if (active) setStorageError('기기에 저장된 날씨 설정을 읽지 못했어요. 지역을 다시 선택해 주세요.'); })
      .finally(() => { if (active) setReady(true); });
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => { active = false; scope.active = false; clearInterval(timer); };
  }, [owner]);

  function savePreferences(next: WeatherPreferences) {
    setPreferences(next); setStorageError(null);
    const scope = lifecycle.current;
    const revision = ++scope.revision;
    void weatherPreferenceStore.save(owner, next).catch(() => {
      if (scope.active && scope.revision === revision) setStorageError('이 기기에 설정을 저장하지 못했어요. 현재 화면에는 적용되며, 다음 방문에는 다시 선택해 주세요.');
    });
  }
  const { region, sensitivity } = preferences;
  const forecast = useQuery({
    queryKey: ['header-weather', region.latitude, region.longitude], enabled: ready,
    queryFn: ({ signal }) => fetchForecast(region, signal),
    staleTime: 10 * 60_000, refetchInterval: 15 * 60_000, retry: 1,
  });
  const search = useQuery({ queryKey: ['weather-region-search', searchTerm], enabled: open && searchTerm.length >= 2,
    queryFn: ({ signal }) => searchRegions(searchTerm, signal), staleTime: 10 * 60_000, retry: 0 });
  const weather = forecast.data && isFresh(forecast.data, now) ? forecast.data : null;
  const condition = weatherCondition(weather?.code ?? null, weather?.isDay);
  const hints = weather ? outfitHints(weather, sensitivity, now) : [];
  const failed = forecast.isError || (forecast.data && !weather);
  const weatherColor = condition.icon === 'sun' || condition.icon === 'cloudSun' ? '#D9A300' : colors.primary;
  const temperature = weather?.temperature == null ? '—' : `${formatTemperature(weather.temperature)}C`;
  const status = weather ? condition.label : failed ? '날씨 조회 실패' : '날씨 불러오는 중';
  const regionOptions = REGIONS.some((item) => item.id === region.id) ? REGIONS : [region, ...REGIONS];

  function submitSearch() {
    const term = searchDraft.trim();
    if (term.length < 2 || term.length > 80) { setSearchValidation('지역 이름을 2~80자로 입력해 주세요.'); return; }
    setSearchValidation(undefined);
    if (term === searchTerm) void search.refetch(); else setSearchTerm(term);
  }
  const control = <Pressable accessibilityRole="button" accessibilityLabel={`${region.name} 날씨, ${weather ? `${temperature}, ${condition.label}` : status}. 상세 날씨 ${open ? '접기' : '펼치기'}`}
    accessibilityState={{ expanded: open }} aria-controls="header-weather-panel" onPress={() => setOpen((value) => !value)}
    style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: compact ? 6 : 8, paddingVertical: 6, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: compact ? 7 : 10, backgroundColor: pressed ? colors.surface : 'transparent' })}>
    {!ready || (forecast.isPending && !forecast.isError) ? <ActivityIndicator size="small" color={colors.primary} accessibilityLabel="날씨 불러오는 중" /> : <Icon name={weather ? condition.icon : 'cloud'} size={compact ? 21 : 25} color={weatherColor} />}
    <View style={{ gap: 3, maxWidth: compact ? 62 : 155 }}>
      <Text numberOfLines={1} style={{ color: colors.text, fontSize: compact ? 14 : 13, fontWeight: '700' }}>{compact ? weather ? temperature : failed ? '재시도' : '날씨' : weather ? `${temperature} · ${condition.label}` : status}</Text>
      {!compact && <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 10 }}>{region.name}{weather?.apparent != null ? ` · 체감 ${formatTemperature(weather.apparent)}C` : ''}</Text>}
    </View>
    {!compact && <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}><Icon name="chevron" size={14} color={colors.muted} /></View>}
  </Pressable>;

  return <>{renderHeader(control)}{open && <ScrollView nativeID="header-weather-panel" keyboardShouldPersistTaps="handled" style={{ maxHeight: Math.min(height * 0.65, 580), borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.background }} contentContainerStyle={{ paddingHorizontal: width >= 768 ? 28 : 16, paddingVertical: 20 }}>
    <View style={{ width: '100%', maxWidth: 1100, alignSelf: 'center', gap: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1, gap: 4 }}><Text accessibilityRole="header" style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>{region.name}의 오늘 날씨</Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>{weather ? `${temperature} · ${condition.label}${weather.apparent != null ? ` · 체감 ${formatTemperature(weather.apparent)}C` : ''}` : status}</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="날씨 상세 닫기" onPress={() => setOpen(false)} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Icon name="close" color={colors.muted} size={18} /></Pressable>
      </View>
      {weather && <>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <WeatherStat icon="thermometer" label="최고 / 최저" value={`${formatTemperature(weather.high)} / ${formatTemperature(weather.low)}`} />
          <WeatherStat icon="umbrella" label="오늘 강수확률" value={weather.rainChance == null ? '—' : `${Math.round(weather.rainChance)}%`} />
          <WeatherStat icon="wind" label="현재 바람" value={weather.wind == null ? '—' : `${weather.wind.toFixed(1)} m/s`} />
        </View>
        <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 16, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}><Icon name="shirt" size={18} color={colors.primary} /><Text style={{ color: colors.text, fontWeight: '800', fontSize: 14 }}>오늘의 옷차림</Text></View>
          {hints.length ? hints.map((hint) => <Text key={hint} style={{ color: colors.text, fontSize: 13, lineHeight: 21 }}>{hint}</Text>) : <Text style={{ color: colors.muted, fontSize: 13 }}>기온 정보가 부족해 옷차림 힌트를 제공할 수 없어요.</Text>}
          <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 17 }}>체감온도와 추위 민감도를 반영한 참고 안내예요. 활동량과 외출 시간에 맞게 조절해 주세요.</Text>
        </View>
      </>}
      {failed && <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 13, lineHeight: 20 }}>{weather ? '갱신에 실패해 마지막으로 조회한 날씨를 표시하고 있어요.' : '최신 날씨를 불러오지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.'}</Text>}
      <View style={{ flexDirection: width >= 600 ? 'row' : 'column', gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0 }}><SelectField compact label="날씨 지역" value={region.id} options={regionOptions.map((item) => ({ label: item.name, value: item.id }))} disabled={!ready}
          onChange={(id) => { const selected = regionOptions.find((item) => item.id === id); if (selected) savePreferences({ ...preferences, region: selected }); }} /></View>
        <View style={{ flex: 1, minWidth: 0 }}><SelectField compact label="추위 민감도" value={sensitivity} disabled={!ready} options={[{ value: 'low', label: '추위를 덜 타요' }, { value: 'normal', label: '보통이에요' }, { value: 'high', label: '추위를 많이 타요' }]}
          onChange={(value) => savePreferences({ ...preferences, sensitivity: value as ColdSensitivity })} /></View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <View style={{ flex: 1, minWidth: 0 }}><FormField label="다른 지역 찾기" placeholder="예: 수원, 성남, 강릉" value={searchDraft} maxLength={80} onChangeText={setSearchDraft} onSubmitEditing={submitSearch} returnKeyType="search" error={searchValidation} editable={ready} /></View>
        <View style={{ paddingTop: 25 }}><ActionButton label="검색" onPress={submitSearch} loading={search.isFetching} disabled={!ready} variant="secondary" /></View>
      </View>
      {searchTerm && <View accessibilityLiveRegion="polite" style={{ gap: 4 }}>
        <Text style={{ color: colors.muted, fontSize: 12 }}>‘{searchTerm}’ 검색 결과</Text>
        {search.isFetching ? <Text style={{ color: colors.muted, fontSize: 13 }}>지역을 찾고 있어요.</Text> : search.isError ? <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 13 }}>지역을 찾지 못했어요. 잠시 후 다시 검색해 주세요.</Text> : search.data?.length ? search.data.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${item.name} 날씨 지역으로 선택`} onPress={() => { savePreferences({ ...preferences, region: item }); setSearchTerm(''); setSearchDraft(''); }} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderBottomWidth: 1, borderColor: colors.border }}><Text style={{ color: colors.primary, fontSize: 13 }}>{item.name}</Text></Pressable>) : <Text style={{ color: colors.muted, fontSize: 13 }}>검색 결과가 없어요. 가까운 시·군 이름으로 검색해 주세요.</Text>}
      </View>}
      {storageError && <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 12, lineHeight: 18 }}>{storageError}</Text>}
      <Text style={{ color: colors.muted, fontSize: 11 }}>지역과 추위 민감도는 계정별로 이 기기에 저장돼요. 처음에는 서울 날씨를 표시해요.</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 18 }}><Text accessibilityRole="link" onPress={() => { void Linking.openURL('https://open-meteo.com/').catch(() => {}); }} style={{ textDecorationLine: 'underline' }}>Open-Meteo</Text> 예보{weather ? ` · ${new Date((weather.time + weather.offset) * 1000).toISOString().slice(11, 16)} 기준 (현지 시각)` : ''} · 15분마다 갱신</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="날씨 새로고침" accessibilityState={{ disabled: forecast.isFetching || !ready, busy: forecast.isFetching }} disabled={forecast.isFetching || !ready} onPress={() => { setNow(Date.now()); void forecast.refetch(); }} style={{ minHeight: 44, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Icon name="refresh" size={14} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 12 }}>{forecast.isFetching ? '불러오는 중' : '새로고침'}</Text>
        </Pressable>
      </View>
    </View>
  </ScrollView>}</>;
}

function WeatherStat({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  const colors = useTheme();
  return <View style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 6, paddingVertical: 10 }}><Icon name={icon} size={19} color={colors.muted} /><Text style={{ color: colors.muted, fontSize: 11 }}>{label}</Text><Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>{value}</Text></View>;
}
