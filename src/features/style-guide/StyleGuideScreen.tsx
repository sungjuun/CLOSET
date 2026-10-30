import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Linking, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { SearchField } from '@/components/ui/SearchField';
import { GuardedLink as Link } from '@/providers/NavigationGuard';
import { useTheme } from '@/theme/useTheme';
import { filterGuides, getGuide, guideCategories, guides, relatedGuides, type Guide, type GuideCategory } from './guides';

function GuideCard({ guide, compact = false }: { guide: Guide; compact?: boolean }) {
  const colors = useTheme();
  const category = guideCategories.find(item => item.id === guide.category)!;
  return <Link href={{ pathname: '/style-guide/[slug]', params: { slug: guide.slug } }} asChild>
    <Pressable accessibilityRole="link" accessibilityLabel={guide.title} style={{ padding: 22, minHeight: compact ? 100 : 215, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, gap: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>{category.label}</Text><Icon name={category.icon} size={20} color={colors.primary} /></View>
      <Text style={{ color: colors.text, fontSize: compact ? 15 : 18, fontWeight: '800', lineHeight: 26 }}>{guide.title}</Text>
      {!compact && <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 21 }}>{guide.summary}</Text>}
      {!compact && <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 'auto' }}><Text style={{ color: colors.muted, fontSize: 11 }}>1분 읽기</Text><View style={{ flex: 1 }} /><Text style={{ color: colors.primary, fontSize: 12 }}>가이드 읽기</Text><Icon name="arrow" size={15} color={colors.primary} /></View>}
    </Pressable>
  </Link>;
}

export function StyleGuideScreen() {
  const colors = useTheme();
  const { width } = useWindowDimensions();
  const desktop = width >= 1000;
  const columns = width >= 1350 ? 3 : width >= 700 ? 2 : 1;
  const [category, setCategory] = useState<GuideCategory | 'all'>('all');
  const [query, setQuery] = useState('');
  const [contentWidth, setContentWidth] = useState(0);
  const results = filterGuides(query, category);
  const selected = guideCategories.find(item => item.id === category);
  return <View>
    <View style={{ gap: 10, marginBottom: 30 }}><Text style={{ color: colors.muted, fontSize: 11, letterSpacing: 1.5, fontWeight: '700' }}>THE CLOSET HANDBOOK</Text><Text accessibilityRole="header" style={{ color: colors.text, fontSize: 30, fontWeight: '900' }}>스타일 가이드</Text><Text style={{ color: colors.muted, fontSize: 14, lineHeight: 22 }}>잘 입는 방법부터 오래 입는 습관까지.{desktop ? ' ' : '\n'}내 옷장을 더 잘 활용하는 작은 팁을 모았어요.</Text></View>
    <View style={{ flexDirection: desktop ? 'row' : 'column', gap: desktop ? 32 : 22, alignItems: 'flex-start' }}>
      <View style={{ width: desktop ? 225 : '100%', padding: 14, borderRadius: 14, backgroundColor: colors.surface, gap: 8 }}>
        {desktop && <Text style={{ fontSize: 11, fontWeight: '700', color: colors.muted, padding: 10, letterSpacing: 1 }}>분야별로 둘러보기</Text>}
        <View style={{ flexDirection: desktop ? 'column' : 'row', flexWrap: 'wrap', gap: 6 }}>
          {[{ id: 'all' as const, label: '전체 가이드', description: `${guides.length}개의 작은 팁`, icon: 'book' as const }, ...guideCategories].map(item => {
            const active = category === item.id;
            return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={item.label} accessibilityState={{ selected: active }} onPress={() => setCategory(item.id)} style={{ minHeight: 44, padding: desktop ? 12 : 10, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 9, borderWidth: 1, borderColor: active ? colors.primary : 'transparent', backgroundColor: active ? colors.background : 'transparent' }}>
              <Icon name={item.icon} size={18} color={active ? colors.primary : colors.muted} /><View style={{ gap: 5 }}><Text style={{ color: active ? colors.primary : colors.text, fontSize: 13, fontWeight: active ? '800' : '600' }}>{item.label}</Text>{desktop && <Text style={{ color: colors.muted, fontSize: 10, lineHeight: 16 }}>{item.description}</Text>}</View>
            </Pressable>;
          })}
        </View>
      </View>
      <View onLayout={event => setContentWidth(event.nativeEvent.layout.width)} style={{ flex: desktop ? 1 : undefined, width: desktop ? undefined : '100%', minWidth: 0, gap: 20 }}>
        <SearchField label="스타일 가이드 검색" placeholder="레이어드, 스웨이드, 세탁… 궁금한 내용을 검색하세요" value={query} onChange={setQuery} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}><Text accessibilityRole="header" style={{ color: colors.text, fontSize: 19, fontWeight: '800' }}>{selected?.label ?? '전체 가이드'}</Text><Text accessibilityLiveRegion="polite" style={{ color: colors.muted, fontSize: 12 }}>{results.length}개</Text>{(query || category !== 'all') && <Pressable accessibilityRole="button" onPress={() => { setQuery(''); setCategory('all'); }} style={{ minHeight: 44, justifyContent: 'center', marginLeft: 'auto', paddingHorizontal: 10 }}><Text style={{ color: colors.primary, fontSize: 12 }}>검색·분류 초기화</Text></Pressable>}</View>
        {results.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>{results.map(guide => <View key={guide.slug} style={{ width: contentWidth > 0 ? Math.max(0, (contentWidth - 16 * (columns - 1)) / columns) : '100%' }}><GuideCard guide={guide} /></View>)}</View> : <View style={{ alignItems: 'center', padding: 36, gap: 12, borderRadius: 14, backgroundColor: colors.surface }}><Icon name="search" size={28} color={colors.muted} /><Text style={{ color: colors.text, fontWeight: '700' }}>일치하는 가이드가 없어요</Text><Text style={{ color: colors.muted, textAlign: 'center', fontSize: 13, lineHeight: 21 }}>검색어를 줄이거나 다른 분야를 선택해 보세요.</Text></View>}
        <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 19 }}>코디 예시는 취향을 찾기 위한 제안이에요. 세탁·관리 방법은 각 제품의 취급 표시와 제조사 안내를 우선 확인하세요.</Text>
      </View>
    </View>
  </View>;
}

export function StyleGuideDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const guide = getGuide(typeof slug === 'string' ? slug : undefined);
  const colors = useTheme();
  const [linkError, setLinkError] = useState(false);
  const category = guideCategories.find(item => item.id === guide?.category);
  return <View style={{ maxWidth: 820, width: '100%', alignSelf: 'center', gap: 24 }}>
    <Link href="/style-guide" style={{ color: colors.primary, fontSize: 13, paddingVertical: 12 }}>← 스타일 가이드 전체 보기</Link>
    {!guide ? <View style={{ gap: 12 }}><Text accessibilityRole="header" style={{ color: colors.text, fontSize: 24, fontWeight: '800' }}>가이드를 찾을 수 없어요</Text><Text style={{ color: colors.muted }}>위 링크에서 다른 가이드를 찾아보세요.</Text></View> : <>
      <View style={{ gap: 14 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Icon name={category!.icon} size={18} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>{category!.label} · 1분 읽기</Text></View><Text accessibilityRole="header" style={{ color: colors.text, fontSize: 28, lineHeight: 40, fontWeight: '900' }}>{guide.title}</Text><Text style={{ color: colors.muted, fontSize: 16, lineHeight: 26 }}>{guide.summary}</Text></View>
      {guide.swatches && <View accessibilityLabel="색상 조합 예시" style={{ flexDirection: 'row', height: 80, borderRadius: 12, overflow: 'hidden' }}>{guide.swatches.map(color => <View key={color} style={{ flex: 1, backgroundColor: color }} />)}</View>}
      <View style={{ borderTopWidth: 1, borderColor: colors.border, paddingTop: 24, gap: 24 }}><Text accessibilityRole="header" style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>이렇게 해보세요</Text>{guide.steps.map((step, index) => <View key={step} style={{ flexDirection: 'row', gap: 14 }}><View style={{ width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }}><Text style={{ color: colors.primary, fontWeight: '800', fontSize: 12 }}>{index + 1}</Text></View><Text style={{ flex: 1, color: colors.text, fontSize: 15, lineHeight: 26 }}>{step}</Text></View>)}</View>
      <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 22, gap: 10, borderLeftWidth: 3, borderLeftColor: colors.primary }}><Text style={{ color: colors.primary, fontWeight: '800', fontSize: 12 }}>내 옷장에 적용하기</Text><Text style={{ color: colors.text, fontSize: 14, lineHeight: 25 }}>{guide.example}</Text></View>
      {guide.source && <View style={{ gap: 6 }}><Text style={{ color: colors.muted, fontSize: 11 }}>참고 자료 · 외부 사이트</Text><Pressable accessibilityRole="link" accessibilityLabel={`${guide.source.label} 열기`} onPress={() => { setLinkError(false); void Linking.openURL(guide.source!.url).catch(() => setLinkError(true)); }} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.primary, fontSize: 13, lineHeight: 22 }}>{guide.source.label} ↗</Text></Pressable>{linkError && <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 12 }}>링크를 열지 못했어요. 잠시 후 다시 시도해 주세요.</Text>}</View>}
      <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 19 }}>{guide.category === 'basics' || guide.category === 'fit' || guide.category === 'colors' ? '스타일 예시는 CLOSET의 제안이에요. 정해진 체형 규칙보다 취향과 편안함을 기준으로 선택하세요.' : '관리 방법은 제품의 소재·가공에 따라 달라요. 각 제품의 취급 표시와 제조사 안내가 우선이에요.'}</Text>
      <Link href={guide.category === 'colors' ? '/color-combinations' : guide.category === 'basics' || guide.category === 'fit' ? '/outfits/new' : '/wardrobe'} asChild><Pressable accessibilityRole="link" style={{ backgroundColor: colors.primary, padding: 16, borderRadius: 10, minHeight: 48, alignItems: 'center' }}><Text style={{ color: colors.onPrimary, fontSize: 14, fontWeight: '800' }}>{guide.category === 'colors' ? '색상 조합에서 직접 비교하기' : guide.category === 'basics' || guide.category === 'fit' ? '내 옷으로 코디 만들어 보기' : '내 옷장 살펴보기'}</Text></Pressable></Link>
      <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 19, fontWeight: '800', marginTop: 8 }}>함께 읽으면 좋아요</Text><View style={{ gap: 12 }}>{relatedGuides(guide).map(item => <GuideCard key={item.slug} guide={item} compact />)}</View>
    </>}
  </View>;
}
