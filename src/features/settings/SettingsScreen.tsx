import { useState, type PropsWithChildren } from 'react';
import { usePreventRemove } from 'expo-router';
import { Modal, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { GuardedLink as Link, useAppNavigationBlocker } from '@/providers/NavigationGuard';
import { useAuth } from '@/providers/AppProviders';
import { WardrobeHeader } from '@/features/wardrobe/components';
import { useSettingsStore } from './store';
import { useThemePreferences } from './ThemePreferencesProvider';
import { useAccountPreferences } from './AccountPreferencesProvider';
import type { AccountPreferences } from './preferences';
import { themeNames, themes } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { Icon, type IconName } from '@/components/ui/Icon';
import { ActionButton } from '@/components/ui/ActionButton';
import { SelectField } from '@/components/ui/SelectField';
import { FormField } from '@/components/ui/FormField';
import { AuthFeedback } from '@/features/auth/AuthFrame';
import { createAuthService } from '@/features/auth/service';
import { useAuthAction } from '@/features/auth/useAuthAction';
import { supabase } from '@/lib/supabase/client';
import { sortOptions } from '@/features/wardrobe/filters';

const sections = [
  { key: 'general', label: '일반', icon: 'settings' },
  { key: 'wardrobe', label: '옷장 관리', icon: 'shirt' },
  { key: 'records', label: '기록·통계', icon: 'calendar' },
  { key: 'account', label: '계정·보안', icon: 'user' },
] as const;
type Section = typeof sections[number]['key'];
const themeLabels = { white: '화이트', beige: '베이지', dark: '다크 모드' };
const densities = [{ value: 'compact', label: '촘촘하게', count: 6 }, { value: 'standard', label: '기본', count: 4 }, { value: 'roomy', label: '여유롭게', count: 2 }] as const;

function SettingsSection({ title, children }: PropsWithChildren<{ title: string }>) {
  const colors = useTheme();
  return <View style={{ padding: 20, gap: 18, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.background }}><Text accessibilityRole="header" aria-level={3} style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>{title}</Text>{children}</View>;
}
function SettingsLink({ href, title, description, icon }: { href: '/settings/brands' | '/settings/categories' | '/wardrobe/trash' | '/calendar' | '/insights' | '/forgot-password'; title: string; description: string; icon: IconName }) {
  const colors = useTheme();
  return <Link href={href} asChild><Pressable accessibilityRole="link" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 70, paddingVertical: 10, opacity: pressed ? 0.65 : 1 })}>
    <View style={{ width: 40, height: 40, borderRadius: 9, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} color={colors.primary} size={20} /></View>
    <View style={{ flex: 1, minWidth: 0, gap: 4 }}><Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{title}</Text><Text style={{ color: colors.muted, fontSize: 12, lineHeight: 20 }}>{description}</Text></View><Icon name="arrow" size={15} color={colors.muted} />
  </Pressable></Link>;
}

export function SettingsScreen() {
  const colors = useTheme();
  const { width } = useWindowDimensions();
  const desktop = width >= 900;
  const { email } = useAuth();
  const preferences = useAccountPreferences();
  const { profile } = preferences;
  const { theme, status, error: themeError } = useSettingsStore();
  const themeActions = useThemePreferences();
  const authAction = useAuthAction();
  const [section, setSection] = useState<Section>('general');
  const [draft, setDraft] = useState<{ value: string; base: AccountPreferences } | null>(null);
  const [nameError, setNameError] = useState<string | undefined>();
  const [message, setMessage] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<{ proceed: () => void } | null>(null);
  const dirty = Boolean(draft && draft.value !== (draft.base.display_name ?? ''));
  const disablePrevention = usePreventRemove(dirty, ({ repeat }) => setLeaving({ proceed: repeat }));
  useAppNavigationBlocker(dirty, (proceed) => setLeaving({ proceed: () => { disablePrevention(); proceed(); } }));
  const disabled = preferences.loading || preferences.saving || !profile;
  function select(next: Section) {
    if (preferences.saving || next === section) return;
    const proceed = () => { setSection(next); setDraft(null); setNameError(undefined); setMessage(null); };
    if (dirty) setLeaving({ proceed }); else proceed();
  }
  async function saveName() {
    if (!draft || disabled) return;
    if (draft.value.trim().length > 80) { setNameError('이름은 80자 이하로 입력해 주세요.'); return; }
    setNameError(undefined); setMessage(null);
    const saved = await preferences.save({ display_name: draft.value.trim() || null }, draft.base);
    if (saved) { setDraft(null); setMessage('프로필 이름을 저장했어요.'); }
  }
  function signOut() {
    const proceed = () => { setDraft(null); void authAction.run(() => createAuthService(supabase).signOut()); };
    if (dirty) setLeaving({ proceed }); else proceed();
  }
  const title = section === 'general' ? '일반 설정' : sections.find((entry) => entry.key === section)!.label;
  const description = { general: '화면과 목록의 기본 동작을 설정하세요.', wardrobe: '자주 사용하는 분류와 브랜드를 정리하세요.', records: '내 옷을 어떻게 활용했는지 확인하세요.', account: '프로필과 로그인 정보를 관리하세요.' }[section];
  return <View style={{ width: '100%', maxWidth: 1200, alignSelf: 'center', gap: 28 }}>
    <WardrobeHeader title="설정" description="옷장 관리와 나만의 사용 방식을 한곳에서." />
    <View style={{ flexDirection: desktop ? 'row' : 'column', gap: desktop ? 32 : 22, alignItems: desktop ? 'flex-start' : 'stretch' }}>
      <View accessibilityRole="tablist" style={{ width: desktop ? 205 : '100%', flexShrink: 0, padding: 10, gap: 4, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, flexDirection: desktop ? 'column' : 'row', flexWrap: desktop ? 'nowrap' : 'wrap' }}>
        {sections.map((entry) => <Pressable key={entry.key} accessibilityRole="tab" accessibilityLabel={entry.label} accessibilityState={{ selected: section === entry.key, disabled: preferences.saving }} aria-selected={section === entry.key} disabled={preferences.saving} onPress={() => select(entry.key)}
          style={{ flexBasis: desktop ? undefined : '47%', flexGrow: desktop ? 0 : 1, minHeight: 48, padding: 12, borderRadius: 7, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: section === entry.key ? colors.background : 'transparent', opacity: preferences.saving ? 0.5 : 1 }}>
          <Icon name={entry.icon} size={18} color={section === entry.key ? colors.primary : colors.muted} /><Text style={{ color: section === entry.key ? colors.primary : colors.muted, fontSize: 13, fontWeight: section === entry.key ? '700' : '500' }}>{entry.label}</Text>
        </Pressable>)}
        {desktop && <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 18, paddingHorizontal: 12, paddingBottom: 8, marginTop: 18, gap: 5 }}><Text style={{ color: colors.muted, fontSize: 11, letterSpacing: 1 }}>MY CLOSET</Text><Text numberOfLines={2} style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>{profile?.display_name || 'CLOSET 회원'}</Text></View>}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 20, width: desktop ? undefined : '100%' }}>
        <View style={{ gap: 6 }}><Text accessibilityRole="header" aria-level={2} style={{ color: colors.text, fontSize: 22, fontWeight: '700' }}>{title}</Text><Text style={{ color: colors.muted, fontSize: 13, lineHeight: 21 }}>{description}</Text></View>
        {preferences.error && <View style={{ gap: 10 }}><Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 13, lineHeight: 22 }}>{preferences.error}</Text><ActionButton variant="secondary" label="설정 다시 불러오기" disabled={preferences.saving} onPress={preferences.reload} /></View>}
        {section === 'general' && <>
          <SettingsSection title="화면 테마">
            <View accessibilityRole="radiogroup" accessibilityLabel="화면 테마" style={{ flexDirection: 'row', gap: 10 }}>
              {themeNames.map((name) => <Pressable key={name} accessibilityRole="radio" accessibilityLabel={`${themeLabels[name]} 테마`} accessibilityState={{ checked: theme === name, disabled: status !== 'ready' }} aria-checked={theme === name} disabled={status !== 'ready'} onPress={() => themeActions.select(name)}
                style={{ flex: 1, minWidth: 0, borderWidth: 2, borderColor: theme === name ? colors.primary : colors.border, borderRadius: 8, padding: 5, opacity: status !== 'ready' ? 0.6 : 1, gap: 7 }}>
                <View style={{ height: 54, borderRadius: 4, backgroundColor: themes[name].background, padding: 7, flexDirection: 'row', gap: 6 }}><View style={{ width: 17, borderRadius: 3, backgroundColor: themes[name].surface }} /><View style={{ flex: 1, marginVertical: 6, borderRadius: 3, backgroundColor: themes[name].surface }} /></View>
                <Text style={{ color: colors.text, fontSize: 12, paddingHorizontal: 3, paddingBottom: 3 }}>{themeLabels[name]}{theme === name ? ' ✓' : ''}</Text>
              </Pressable>)}
            </View>
            <Text accessibilityLiveRegion="polite" style={{ color: colors.muted, fontSize: 12, lineHeight: 21 }}>{themeError ?? (status === 'saving' ? '테마를 저장하는 중이에요…' : status === 'loading' ? '저장된 테마를 불러오는 중이에요…' : '선택한 테마를 다음 로그인에도 사용합니다.')}</Text>
            {themeError && <ActionButton variant="secondary" label="테마 다시 불러오기" onPress={themeActions.reload} />}
          </SettingsSection>
          <SettingsSection title="목록 보기">
            <View style={{ flexDirection: width >= 760 ? 'row' : 'column', gap: 16 }}>
              <View style={{ flex: 1, minWidth: 0 }}><SelectField label="옷장 기본 정렬" value={profile?.wardrobe_sort ?? 'recent'} options={sortOptions} disabled={disabled} onChange={(value) => { void preferences.save({ wardrobe_sort: value as AccountPreferences['wardrobe_sort'] }); }} /></View>
              <View style={{ flex: 1, minWidth: 0 }}><SelectField label="코디 기본 정렬" value={profile?.outfit_sort ?? 'recent'} options={[{ value: 'recent', label: '최근 추가순' }, { value: 'updated', label: '최근 수정순' }, { value: 'oldest', label: '오래된 추가순' }, { value: 'name', label: '이름순' }]} disabled={disabled} onChange={(value) => { void preferences.save({ outfit_sort: value as AccountPreferences['outfit_sort'] }); }} /></View>
            </View>
            <View style={{ gap: 9 }}><Text style={{ color: colors.muted, fontSize: 13 }}>카드 밀도</Text><View accessibilityRole="radiogroup" accessibilityLabel="카드 밀도" style={{ flexDirection: 'row', gap: 8 }}>
              {densities.map((density) => <Pressable key={density.value} accessibilityRole="radio" accessibilityLabel={`${density.label} 카드 밀도`} accessibilityState={{ checked: (profile?.card_density ?? 'standard') === density.value, disabled }} aria-checked={(profile?.card_density ?? 'standard') === density.value} disabled={disabled} onPress={() => { void preferences.save({ card_density: density.value }); }}
                style={{ flex: 1, minWidth: 0, padding: 8, gap: 10, borderRadius: 8, borderWidth: 1, borderColor: profile?.card_density === density.value ? colors.primary : colors.border, backgroundColor: profile?.card_density === density.value ? colors.surface : colors.background, opacity: disabled ? 0.5 : 1 }}>
                <View accessible={false} style={{ height: 42, flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'center' }}>{Array.from({ length: density.count }, (_, index) => <View key={index} style={{ height: 18, width: density.value === 'compact' ? '28%' : density.value === 'standard' ? '42%' : '88%', borderRadius: 3, backgroundColor: colors.border }} />)}</View>
                <Text style={{ color: profile?.card_density === density.value ? colors.primary : colors.muted, fontSize: 12, textAlign: 'center' }}>{density.label}</Text>
              </Pressable>)}
            </View></View>
            <Text accessibilityLiveRegion="polite" style={{ color: colors.muted, fontSize: 12, lineHeight: 21 }}>{preferences.saving ? '설정을 저장하는 중이에요…' : preferences.loading ? '저장된 설정을 불러오는 중이에요…' : '계정에 자동 저장합니다. 카드 밀도는 옷장과 코디 목록에 함께 적용되며, 화면 너비에 따라 열 수가 조정됩니다.'}</Text>
          </SettingsSection>
          <Text style={{ color: colors.muted, fontSize: 12 }}>기본 언어 한국어 · 가격 단위 원(₩)</Text>
        </>}
        {section === 'wardrobe' && <SettingsSection title="옷장 정리"><View><SettingsLink href="/settings/categories" title="카테고리 관리" description="옷 종류·세부 분류의 이름과 순서를 정리하세요." icon="shirt" /><SettingsLink href="/settings/brands" title="브랜드 관리" description="브랜드 이름·로고 이미지를 등록하고 수정하세요." icon="bookmark" /><SettingsLink href="/wardrobe/trash" title="휴지통" description="삭제한 옷을 확인하고 복원하세요." icon="trash" /></View></SettingsSection>}
        {section === 'records' && <SettingsSection title="나의 기록"><View><SettingsLink href="/calendar" title="착용 기록" description="날짜별로 입은 옷과 코디를 확인하세요." icon="calendar" /><SettingsLink href="/insights" title="옷장 통계" description="의류 분포·착용 횟수·착용당 비용을 확인하세요." icon="chart" /></View></SettingsSection>}
        {section === 'account' && <>
          <SettingsSection title="프로필">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}><View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}><Icon name="user" size={24} color={colors.primary} /></View><View style={{ flex: 1, minWidth: 0, gap: 4 }}><Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>{profile?.display_name || 'CLOSET 회원'}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{email ?? ''}</Text></View></View>
            <FormField label="프로필 이름" value={draft?.value ?? profile?.display_name ?? ''} placeholder="내 옷장에서 사용할 이름" maxLength={80} editable={!disabled} error={nameError} onChangeText={(value) => { if (profile) setDraft((previous) => ({ value, base: previous?.base ?? profile })); setNameError(undefined); setMessage(null); }} onSubmitEditing={() => { void saveName(); }} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><ActionButton label="이름 저장" disabled={disabled || !dirty} loading={preferences.saving} onPress={() => { void saveName(); }} />{draft && <ActionButton variant="secondary" label="이름 수정 취소" disabled={preferences.saving} onPress={() => { setDraft(null); setNameError(undefined); setMessage(null); }} />}</View>
            {message && <Text accessibilityLiveRegion="polite" style={{ color: colors.primary, fontSize: 13 }}>{message}</Text>}
          </SettingsSection>
          <SettingsSection title="로그인 관리"><SettingsLink href="/forgot-password" title="비밀번호 재설정" description="가입한 이메일로 비밀번호 재설정 링크를 받으세요." icon="user" /><AuthFeedback error={authAction.error} message={authAction.message} /><View style={{ alignSelf: 'flex-start' }}><ActionButton variant="secondary" label="로그아웃" loading={authAction.pending} onPress={signOut} /></View></SettingsSection>
        </>}
      </View>
    </View>
    <Modal visible={leaving !== null} transparent animationType="fade" onRequestClose={() => setLeaving(null)}><View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', padding: 24, justifyContent: 'center' }}><View accessibilityViewIsModal style={{ width: '100%', maxWidth: 440, alignSelf: 'center', backgroundColor: colors.background, padding: 24, borderRadius: 16, gap: 16 }}><Text accessibilityRole="header" style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>저장하지 않은 이름이 있어요</Text><Text style={{ color: colors.muted, lineHeight: 22 }}>입력을 버리고 이동할까요?</Text><ActionButton variant="secondary" label="계속 편집" onPress={() => setLeaving(null)} /><ActionButton label="변경 버리고 이동" onPress={() => { const action = leaving; setLeaving(null); action?.proceed(); }} /></View></View></Modal>
  </View>;
}
