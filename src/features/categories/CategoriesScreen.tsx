import { randomUUID } from 'expo-crypto';
import { useRef, useState, type ReactNode } from 'react';
import { usePreventRemove } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Modal, Pressable, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { GuardedLink as Link, useAppNavigationBlocker } from '@/providers/NavigationGuard';
import { useUserId } from '@/providers/AppProviders';
import { useTheme } from '@/theme/useTheme';
import { FormField } from '@/components/ui/FormField';
import { SelectField } from '@/components/ui/SelectField';
import { ActionButton } from '@/components/ui/ActionButton';
import { Icon } from '@/components/ui/Icon';
import { WardrobeHeader, WardrobeState } from '../wardrobe/components';
import { useCategories } from '../wardrobe/queries';
import { useCategoryActions } from './hooks';
import type { createCategoryService } from './service';
import { categoryErrorMessage, categoryListKey, categoryNameSchema, completeCategoryOrder, customCategorySlug, duplicateCategory, isRetiredCategory, type MemberCategory } from './model';
import { categoryIcons, CategoryIconButton, CategoryToggle } from './components';
import { SortableCategoryList } from './SortableCategoryList';

type Operation<T> = (backend: ReturnType<typeof createCategoryService>, signal: AbortSignal) => Promise<T>;
type Editor = { base: MemberCategory; name: string; error?: string | undefined };
type Deletion = { base: MemberCategory; target: MemberCategory; merge: boolean; error?: string | undefined };

export function CategoriesScreen() {
  const colors = useTheme();
  const { width } = useWindowDimensions();
  const desktop = width >= 900;
  const owner = useUserId()!;
  const cache = useQueryClient();
  const query = useCategories();
  const actions = useCategoryActions();
  const [selectedSlug, setSelectedSlug] = useState('tops');
  const [slug, setSlug] = useState(() => customCategorySlug(randomUUID()));
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | undefined>();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [deletion, setDeletion] = useState<Deletion | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [orderMode, setOrderMode] = useState<'roots' | 'children' | null>(null);
  const lock = useRef(false);
  const [leaving, setLeaving] = useState<{ proceed: () => void } | null>(null);
  const editorDirty = Boolean(editor && editor.name !== editor.base.label_ko);
  const draftDirty = editorDirty || name.length > 0;
  const dirty = draftDirty || dragging;
  const disablePrevention = usePreventRemove(dirty, ({ repeat }) => setLeaving({ proceed: repeat }));
  useAppNavigationBlocker(dirty, (proceed) => setLeaving({ proceed: () => { disablePrevention(); proceed(); } }));
  const all = query.data ?? [];
  const allRoots = all.filter((row) => row.parent_slug === null);
  const roots = allRoots.filter((row) => !isRetiredCategory(row));
  const selected = roots.find((row) => row.slug === selectedSlug) ?? roots[0];
  const children = all.filter((row) => row.parent_slug === selected?.slug);
  const sorting = orderMode !== null;

  async function run<T>(operation: Operation<T>): Promise<{ value: T } | null> {
    if (lock.current) return null;
    lock.current = true; setBusy(true);
    try { return await actions.perform(operation); }
    finally { lock.current = false; if (actions.isActive()) setBusy(false); }
  }
  function remember(row: MemberCategory) {
    cache.setQueryData<MemberCategory[]>(categoryListKey(owner), (previous) => {
      const rows = [...(previous ?? []).filter((entry) => entry.slug !== row.slug), row];
      return rows.sort((a, b) => a.position - b.position || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
    });
  }
  function selectRoot(next: string) {
    if (busy || dragging || next === selected?.slug) return;
    const proceed = () => {
      setSelectedSlug(next); setEditor(null); setName(''); setNameError(undefined);
      setSlug(customCategorySlug(randomUUID())); setMessage(null); setOrderMode(null);
    };
    if (dirty) setLeaving({ proceed }); else proceed();
  }
  function edit(row: MemberCategory) {
    if (busy || sorting || editor?.base.slug === row.slug) return;
    const proceed = () => { setEditor({ base: row, name: row.label_ko }); setMessage(null); };
    if (editorDirty && editor?.base.slug !== row.slug) setLeaving({ proceed }); else proceed();
  }
  async function saveName() {
    if (!editor) return;
    const parsed = categoryNameSchema.safeParse(editor.name);
    if (!parsed.success) { setEditor({ ...editor, error: parsed.error.issues[0]?.message }); return; }
    const duplicate = duplicateCategory(all, editor.base, parsed.data);
    if (duplicate) { setEditor({ ...editor, error: `이미 ‘${duplicate.label_ko}’ 분류가 있어요. ${editor.base.is_custom ? '기존 분류로 합치거나 ' : ''}다른 이름을 입력해 주세요.` }); return; }
    setMessage(null);
    try {
      const { base } = editor;
      const result = await run((service, signal) => service.save({ slug: base.slug, parent: base.parent_slug, name: parsed.data, active: base.is_active, expected: base.updated_at }, signal));
      if (result) { remember(result.value); setEditor(null); setMessage('이름을 저장했어요.'); }
    } catch (cause) { if (actions.isActive()) setEditor((current) => current?.base.slug === editor.base.slug ? { ...current, error: categoryErrorMessage(cause) } : current); }
  }
  function askDelete(row: MemberCategory, target?: MemberCategory) {
    if (busy || dragging || sorting || !row.parent_slug) return;
    const destination = target ?? all.find((entry) => entry.slug === row.parent_slug);
    if (destination) setDeletion({ base: row, target: destination, merge: Boolean(target) });
  }
  async function confirmDelete() {
    if (!deletion || busy) return;
    const request = deletion;
    try {
      const result = await run((service, signal) => service.remove(request.base, request.target.slug, signal));
      if (!result) return;
      cache.setQueryData<MemberCategory[]>(categoryListKey(owner), (previous) => (previous ?? []).filter((row) => row.slug !== result.value.category_slug));
      setEditor((current) => current?.base.slug === request.base.slug ? null : current);
      setDeletion(null);
      setMessage(`${request.merge ? '분류를 합쳤어요.' : '세부 분류를 삭제했어요.'} 연결된 옷 ${result.value.moved_items}개는 ‘${request.target.label_ko}’로 옮겼어요.`);
    } catch (cause) { if (actions.isActive()) setDeletion((current) => current ? { ...current, error: categoryErrorMessage(cause) } : current); }
  }
  async function toggle(row: MemberCategory, active: boolean) {
    setMessage(null);
    try {
      const result = await run((service, signal) => service.save({ slug: row.slug, parent: row.parent_slug, name: row.label_ko, active, expected: row.updated_at }, signal));
      if (result) { remember(result.value); setMessage(active ? '사용하도록 저장했어요.' : '새 옷 등록에서 숨겼어요. 기존 옷과 코디는 유지됩니다.'); }
    } catch (cause) { if (actions.isActive()) setMessage(categoryErrorMessage(cause)); }
  }
  async function add() {
    if (!selected || sorting) return;
    const parsed = categoryNameSchema.safeParse(name);
    if (!parsed.success) { setNameError(parsed.error.issues[0]?.message); return; }
    setNameError(undefined); setMessage(null);
    try {
      const result = await run((service, signal) => service.save({ slug, name: parsed.data, parent: selected.slug, active: true }, signal));
      if (result) { remember(result.value); setName(''); setSlug(customCategorySlug(randomUUID())); setMessage('세부 분류를 추가했어요.'); }
    } catch (cause) { if (actions.isActive()) setMessage(categoryErrorMessage(cause)); }
  }
  async function reorderRoots(expected: string[], order: string[]) {
    const complete = completeCategoryOrder(allRoots, expected, order);
    if (!complete) { setMessage('목록이 바뀌었어요. 다시 시도해 주세요.'); return false; }
    setMessage(null);
    try {
      const result = await run((service, signal) => service.reorder(null, allRoots.map((row) => row.slug), complete, signal));
      if (!result) return false;
      cache.setQueryData(categoryListKey(owner), result.value);
      setMessage('변경한 순서를 저장했어요.');
      return true;
    } catch (cause) { if (actions.isActive()) setMessage(categoryErrorMessage(cause)); return false; }
  }
  async function reorderChildren(expected: string[], order: string[]) {
    if (!selected) return false;
    setMessage(null);
    try {
      const result = await run((service, signal) => service.reorder(selected.slug, expected, order, signal));
      if (!result) return false;
      cache.setQueryData(categoryListKey(owner), result.value);
      setMessage('변경한 순서를 저장했어요.');
      return true;
    } catch (cause) { if (actions.isActive()) setMessage(categoryErrorMessage(cause)); return false; }
  }
  function orderButton(mode: 'roots' | 'children') {
    const active = orderMode === mode;
    return <Pressable accessibilityRole="button" accessibilityLabel={`${mode === 'roots' ? '옷 종류' : '세부 분류'} 순서 ${active ? '변경 완료' : '변경'}`} accessibilityState={{ disabled: busy || dirty, expanded: active }} disabled={busy || dirty} onPress={() => { setOrderMode(active ? null : mode); setEditor(null); setMessage(null); }}
      style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, opacity: busy || dirty ? 0.4 : 1 }}>
      {!active && <Icon name="filters" size={15} color={colors.muted} />}<Text style={{ color: active ? colors.primary : colors.muted, fontSize: 12, fontWeight: '600' }}>{active ? '완료' : '순서 변경'}</Text>
    </Pressable>;
  }
  function nameEditor(row: MemberCategory) {
    if (editor?.base.slug !== row.slug) return null;
    const duplicate = duplicateCategory(all, row, editor.name);
    return <View style={{ padding: 16, gap: 12, backgroundColor: colors.surface, borderRadius: 8 }}>
      <FormField label={row.parent_slug ? '세부 분류 이름' : '옷 종류 이름'} value={editor.name} maxLength={80} editable={!busy} error={editor.error} autoFocus
        onChangeText={(value) => { setEditor({ ...editor, name: value, error: undefined }); setMessage(null); }} onSubmitEditing={() => { void saveName(); }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><ActionButton label="이름 저장" loading={busy} onPress={() => { void saveName(); }} /><ActionButton variant="secondary" label="취소" disabled={busy} onPress={() => { setEditor(null); setMessage(null); }} />{duplicate && row.is_custom && <ActionButton variant="secondary" label={`기존 ‘${duplicate.label_ko}’로 합치기`} disabled={busy} onPress={() => askDelete(row, duplicate)} />}</View>
    </View>;
  }
  function rootRow(root: MemberCategory, handle: ReactNode) {
    const active = root.slug === selected?.slug;
    const count = all.filter((row) => row.parent_slug === root.slug).length;
    return <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: active ? colors.background : 'transparent', borderLeftWidth: 3, borderLeftColor: active ? colors.primary : 'transparent', borderRadius: 7, marginVertical: 3 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${root.label_ko} 세부 분류 ${count}개${root.is_active ? '' : ' 사용 안 함'}`} accessibilityState={{ selected: active, disabled: busy || dragging }} disabled={busy || dragging} onPress={() => selectRoot(root.slug)}
        style={{ minHeight: 76, minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 12, opacity: busy ? 0.6 : 1 }}>
        <Icon name={categoryIcons[root.slug] ?? 'hanger'} size={24} color={active ? colors.primary : colors.muted} />
        <View style={{ flex: 1, minWidth: 0, gap: 5 }}><Text numberOfLines={2} style={{ color: active ? colors.primary : root.is_active ? colors.text : colors.muted, fontSize: 15, fontWeight: '700' }}>{root.label_ko}</Text><Text style={{ color: colors.muted, fontSize: 11 }}>{root.is_active ? `세부 분류 ${count}개` : '사용 안 함'}</Text></View>
      </Pressable>
      {handle}
    </View>;
  }

  return <View style={{ width: '100%', maxWidth: 1200, alignSelf: 'center', gap: 24 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Link href="/settings" style={{ color: colors.muted, paddingVertical: 10, fontSize: 13 }}>설정</Link><Text style={{ color: colors.muted }}>/</Text><Text style={{ color: colors.text, fontSize: 13 }}>카테고리 관리</Text></View>
    <WardrobeHeader title="카테고리 관리" description="옷 종류와 세부 분류를 나에게 맞게 정리하세요." />
    {query.isPending ? <WardrobeState title="카테고리를 불러오는 중" message="잠시만 기다려 주세요." /> : query.isError ? <WardrobeState title="카테고리를 불러오지 못했어요" message="연결을 확인하고 다시 시도해 주세요." retry={() => { void query.refetch(); }} /> : selected ? <View style={{ flexDirection: desktop ? 'row' : 'column', alignItems: desktop ? 'flex-start' : 'stretch', gap: 20 }}>
      <View style={{ width: desktop ? 250 : '100%', flexShrink: 0, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 8 }}>
        <View style={{ paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={{ color: colors.muted, fontSize: 12, fontWeight: '600' }}>옷 종류 {roots.length}</Text>{orderButton('roots')}</View>
        {orderMode === 'roots' && <Text style={{ color: colors.primary, fontSize: 12, lineHeight: 19, padding: 10 }}>오른쪽 손잡이를 잡고 원하는 위치로 끌어 놓으세요. 놓으면 바로 저장됩니다.</Text>}
        {!desktop && orderMode !== 'roots' ? <SelectField compact hideLabel label="관리할 옷 종류" value={selected.slug} options={roots.map((root) => ({ value: root.slug, label: `${root.label_ko}${root.is_active ? '' : ' · 사용 안 함'}` }))} disabled={busy || dragging} onChange={selectRoot} /> : <SortableCategoryList sidebar items={roots} enabled={orderMode === 'roots'} disabled={busy || draftDirty} onDragChange={setDragging} onReorder={reorderRoots} renderRow={rootRow} />}
      </View>
      <View style={{ flex: 1, minWidth: 0, width: desktop ? undefined : '100%', borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.background }}>
        <View style={{ padding: desktop ? 24 : 16, gap: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0 }}><Text accessibilityRole="header" aria-level={2} style={{ color: colors.text, fontSize: 25, fontWeight: '700', flexShrink: 1 }}>{selected.label_ko}</Text><CategoryIconButton label={`${selected.label_ko} 이름 수정`} icon="pencil" disabled={busy || sorting} onPress={() => edit(selected)} /></View>
          </View>
          {nameEditor(selected)}
          <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 21 }}>{selected.is_active ? '세부 분류의 이름과 사용 여부를 관리하세요.' : '사용 안 함으로 설정된 옷 종류입니다. 새 옷 등록에서 하위 분류도 함께 숨깁니다.'}</Text>
        </View>
        <View style={{ padding: desktop ? 24 : 16, gap: 16 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Text accessibilityRole="header" aria-level={3} style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>세부 분류 <Text style={{ color: colors.muted }}>{children.length}개</Text></Text>
            {orderButton('children')}
          </View>
          {orderMode === 'children' && <Text accessibilityLiveRegion="polite" style={{ color: colors.primary, fontSize: 12, lineHeight: 20 }}>오른쪽 손잡이를 잡고 원하는 위치로 끌어 놓으세요. 놓으면 순서가 바로 저장됩니다.</Text>}
          <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: desktop ? 16 : 10, minHeight: 42, backgroundColor: colors.surface }}><Text style={{ flex: 1, color: colors.muted, fontSize: 12, fontWeight: '600' }}>분류 이름</Text><Text style={{ width: 68, textAlign: 'center', color: colors.muted, fontSize: 12 }}>사용 여부</Text><Text style={{ width: orderMode === 'children' ? 44 : 88, textAlign: 'center', color: colors.muted, fontSize: 12 }}>{orderMode === 'children' ? '순서' : '관리'}</Text></View>
            <SortableCategoryList key={selected.slug} items={children} enabled={orderMode === 'children'} disabled={busy || draftDirty} onDragChange={setDragging} onReorder={reorderChildren} renderRow={(child, handle) => <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: desktop ? 16 : 10, minHeight: 64, gap: 0 }}>
                <Text style={{ flex: 1, minWidth: 0, color: child.is_active ? colors.text : colors.muted, fontSize: 14, lineHeight: 21, paddingVertical: 12, paddingRight: 8 }}>{child.label_ko}</Text>
                <View style={{ width: 68, alignItems: 'center' }}><CategoryToggle name={child.label_ko} active={child.is_active} disabled={busy || sorting || editor?.base.slug === child.slug} onChange={(active) => { void toggle(child, active); }} /></View>
                {orderMode === 'children' ? handle : <View style={{ width: 88, flexDirection: 'row', alignItems: 'center' }}><CategoryIconButton label={`${child.label_ko} 이름 수정`} icon="pencil" disabled={busy || sorting} onPress={() => edit(child)} /><CategoryIconButton label={`${child.label_ko} 세부 분류 삭제`} icon="trash" disabled={busy || sorting} onPress={() => askDelete(child)} /></View>}
              </View>
              {editor?.base.slug === child.slug && <View style={{ padding: 10 }}>{nameEditor(child)}</View>}
            </View>} />
            {!children.length && <Text style={{ color: colors.muted, fontSize: 13, padding: 24, lineHeight: 22 }}>등록된 세부 분류가 없어요. 아래에서 첫 분류를 추가해 보세요.</Text>}
          </View>
          <View style={{ padding: 12, gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.surface }}>
            <Text style={{ color: colors.muted, fontSize: 12 }}>새 세부 분류 추가</Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}><TextInput accessibilityLabel="새 세부 분류 이름" aria-invalid={Boolean(nameError)} placeholder="예: 후드티, 기능성 셔츠" placeholderTextColor={colors.muted} value={name} maxLength={80} editable={!busy && !sorting} onChangeText={(value) => { setName(value); setNameError(undefined); setMessage(null); }} onSubmitEditing={() => { void add(); }}
              style={{ flex: 1, minWidth: 0, minHeight: 48, borderWidth: 1, borderColor: nameError ? colors.danger : colors.border, borderRadius: 7, padding: 12, backgroundColor: colors.background, color: colors.text, fontSize: 14 }} /><ActionButton label="추가" disabled={busy || sorting || !name.trim()} onPress={() => { void add(); }} /></View>
            {nameError && <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 12 }}>{nameError}</Text>}
          </View>
          {message && <Text accessibilityLiveRegion="polite" style={{ color: colors.primary, fontSize: 13, lineHeight: 22 }}>{message}</Text>}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}><Icon name="info" size={16} color={colors.muted} /><Text style={{ flex: 1, color: colors.muted, fontSize: 12, lineHeight: 19 }}>사용 안 함으로 설정해도 기존 옷과 코디는 유지됩니다.</Text></View>
        </View>
      </View>
    </View> : <WardrobeState title="카테고리가 없어요" message="목록을 다시 불러와 주세요." retry={() => { void query.refetch(); }} />}
    <Modal visible={deletion !== null} transparent animationType="fade" onRequestClose={() => { if (!busy) setDeletion(null); }}><View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', padding: 24, justifyContent: 'center' }}><View accessibilityViewIsModal style={{ width: '100%', maxWidth: 480, alignSelf: 'center', backgroundColor: colors.background, borderRadius: 16, padding: 24, gap: 16 }}>
      <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>{deletion?.merge ? '기존 분류로 합칠까요?' : '세부 분류를 삭제할까요?'}</Text>
      {deletion && <Text style={{ color: colors.text, lineHeight: 24 }}>‘{deletion.base.label_ko}’ 분류를 삭제하고 연결된 옷은 ‘{deletion.target.label_ko}’로 옮깁니다.</Text>}
      <Text style={{ color: colors.muted, lineHeight: 22 }}>내 계정에서만 삭제됩니다. 옷·사진·코디·착용 기록은 유지되며, 휴지통에 있는 옷도 함께 분류를 옮깁니다.</Text>
      {deletion?.target.is_active === false && <Text style={{ color: colors.muted, lineHeight: 22 }}>옮길 분류는 현재 사용 안 함 상태입니다.</Text>}
      {deletion?.error && <Text accessibilityRole="alert" style={{ color: colors.danger, lineHeight: 22 }}>{deletion.error}</Text>}
      <ActionButton label={deletion?.merge ? '분류 합치기 확인' : '세부 분류 삭제 확인'} loading={busy} onPress={() => { void confirmDelete(); }} />
      <ActionButton variant="secondary" label="취소" disabled={busy} onPress={() => setDeletion(null)} />
    </View></View></Modal>
    <Modal visible={leaving !== null} transparent animationType="fade" onRequestClose={() => setLeaving(null)}><View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', padding: 24, justifyContent: 'center' }}><View accessibilityViewIsModal style={{ width: '100%', maxWidth: 440, alignSelf: 'center', backgroundColor: colors.background, borderRadius: 16, padding: 24, gap: 16 }}><Text accessibilityRole="header" style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>저장하지 않은 변경이 있어요</Text><Text style={{ color: colors.muted, lineHeight: 22 }}>입력을 버리고 이동할까요?</Text><ActionButton variant="secondary" label="계속 편집" onPress={() => setLeaving(null)} /><ActionButton label="변경 버리고 이동" onPress={() => { const action = leaving; setLeaving(null); action?.proceed(); }} /></View></View></Modal>
  </View>;
}
