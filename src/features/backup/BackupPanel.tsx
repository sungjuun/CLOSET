import { useEffect, useRef, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { usePreventRemove } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { strToU8 } from 'fflate';
import { useAppNavigationBlocker } from '@/providers/NavigationGuard';
import { useTheme } from '@/theme/useTheme';
import { useUserId } from '@/providers/AppProviders';
import { useAccountPreferences } from '../settings/AccountPreferencesProvider';
import { useThemePreferences } from '../settings/ThemePreferencesProvider';
import { supabase } from '@/lib/supabase/client';
import { publicConfig } from '@/lib/config/env';
import { ActionButton } from '@/components/ui/ActionButton';
import { backupDate, backupErrorMessage, csvArchive, fullArchive, loadBackup, type LoadedBackup } from './model';
import { createBackupService, type RestoreSummary } from './service';
import { pickBackupFile, saveBackupFile } from './files';

export function BackupPanel({ onBusyChange }: { onBusyChange: (busy: boolean) => void }) {
  const owner = useUserId();
  const colors = useTheme();
  const account = useAccountPreferences();
  const theme = useThemePreferences();
  const cache = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<LoadedBackup | null>(null);
  const [summary, setSummary] = useState<RestoreSummary | null>(null);
  const [restoreProfile, setRestoreProfile] = useState(false);
  const [profileVersion, setProfileVersion] = useState<string | null>(null);
  const lifecycle = useRef<{ active: boolean; request: AbortController | null }>({ active: true, request: null });
  useEffect(() => {
    const scope = lifecycle.current; scope.active = true;
    return () => { scope.active = false; scope.request?.abort(); };
  }, []);
  const blocked = () => setError('진행 중인 작업이 있어요. 완료를 기다리거나 작업 중단을 눌러 주세요.');
  usePreventRemove(busy, blocked);
  useAppNavigationBlocker(busy, blocked);
  const service = owner && supabase && publicConfig.status === 'ready' ? createBackupService(supabase, owner, { url: publicConfig.url, key: publicConfig.key }) : null;
  async function run(action: (signal: AbortSignal, progress: (text: string) => void) => Promise<void>) {
    const scope = lifecycle.current;
    if (!service || !scope.active || scope.request) return;
    const request = new AbortController(); scope.request = request;
    setBusy(true); onBusyChange(true); setError(null); setMessage('자료를 확인하고 있어요…');
    const timeout = setTimeout(() => request.abort(), 5 * 60 * 1000);
    try {
      await action(request.signal, text => { if (scope.active && !request.signal.aborted) setMessage(text); });
    } catch (cause) {
      if (scope.active) { setMessage(null); setError(request.signal.aborted ? '작업을 중단했어요. 복원 중이었다면 데이터가 반영되었을 수 있습니다. 같은 백업으로 다시 확인해 주세요.' : backupErrorMessage(cause)); }
    } finally {
      clearTimeout(timeout); scope.request = null;
      if (scope.active) { setBusy(false); onBusyChange(false); }
    }
  }
  function exportFile(kind: 'data' | 'full' | 'csv') {
    void run(async (signal, progress) => {
      const result = await service!.export(kind === 'full' ? 'full' : 'data', signal, progress);
      const date = backupDate(result.backup.createdAt);
      progress('백업 파일을 준비하고 있어요…');
      const bytes = kind === 'full' ? fullArchive(result) : kind === 'csv' ? csvArchive(result.backup) : strToU8(JSON.stringify(result.backup));
      if (signal.aborted || !lifecycle.current.active) return;
      await saveBackupFile(bytes, `closet-${kind}-${date}.${kind === 'data' ? 'json' : 'zip'}`, kind === 'data' ? 'application/json' : 'application/zip');
      if (!signal.aborted && lifecycle.current.active) setMessage('백업 파일의 저장·공유를 요청했어요. 기기의 다운로드 또는 저장 위치를 확인해 주세요.');
    });
  }
  function chooseFile() {
    if (!service || lifecycle.current.request) return;
    // Open the browser file chooser immediately in the user's click handler.
    const selected = pickBackupFile();
    setLoaded(null); setSummary(null); setRestoreProfile(false); setProfileVersion(null);
    void run(async (signal, progress) => {
      const bytes = await selected;
      if (!bytes || signal.aborted || !lifecycle.current.active) { if (lifecycle.current.active) setMessage(null); return; }
      progress('백업 형식과 파일을 검증하고 있어요…');
      const result = await loadBackup(bytes, owner!);
      const preview = await service!.restore(result, true, null, signal);
      if (!signal.aborted && lifecycle.current.active) { setLoaded(result); setSummary(preview); setMessage('복원 내용을 확인해 주세요. 아직 저장한 내용은 없습니다.'); }
    });
  }
  function previewAgain() {
    if (!loaded) return;
    void run(async (signal) => {
      const expected = restoreProfile ? await service!.profileVersion(signal) : null;
      if (restoreProfile && !expected) return;
      const preview = await service!.restore(loaded, true, expected, signal);
      if (!signal.aborted && lifecycle.current.active) { setSummary(preview); setProfileVersion(expected); setMessage('복원 내용을 확인해 주세요. 아직 저장한 내용은 없습니다.'); }
    });
  }
  function restore() {
    if (!loaded || !summary) return;
    void run(async (signal, progress) => {
      setSummary(null);
      await service!.restore(loaded, false, profileVersion, signal, progress);
      if (!signal.aborted && lifecycle.current.active) {
        setLoaded(null); setMessage('복원을 완료했어요. 기존 자료는 유지하고, 누락된 자료와 사진을 복원했습니다.');
        void cache.invalidateQueries().catch(() => {}); account.reload(); theme.reload();
      }
    });
  }
  const panel = { padding: 20, gap: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.background } as const;
  const muted = { color: colors.muted, fontSize: 13, lineHeight: 22 } as const;
  const disabled = busy || !service;
  const counts = Object.values(summary?.tables ?? {}).reduce((sum, row) => ({ added: sum.added + row.added, skipped: sum.skipped + row.skipped }), { added: 0, skipped: 0 });
  return <View style={{ gap: 20 }}>
    <View style={panel}>
      <View style={{ gap: 6 }}><Text accessibilityRole="header" aria-level={3} style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>내 옷장 백업</Text><Text style={muted}>의류·휴지통·코디·착용 기록·분류·브랜드·색상 즐겨찾기·설정을 보관하세요. 진행 중인 업로드를 마친 뒤 백업해 주세요.</Text></View>
      <View style={{ padding: 16, gap: 10, borderRadius: 9, backgroundColor: colors.surface }}><Text style={{ color: colors.text, fontWeight: '700' }}>전체 ZIP · 사진 포함</Text><Text style={muted}>데이터 JSON과 등록된 옷 사진, 브랜드 로고, 저장된 코디 이미지를 함께 저장합니다. 전체 복원에 사용하세요.</Text><ActionButton label="사진 포함 전체 백업" disabled={disabled} onPress={() => exportFile('full')} /></View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <View style={{ flexGrow: 1, flexBasis: 230, gap: 8 }}><ActionButton variant="secondary" label="데이터 JSON 백업" disabled={disabled} onPress={() => exportFile('data')} /><Text style={muted}>사진을 제외한 데이터 복원용입니다.</Text></View>
        <View style={{ flexGrow: 1, flexBasis: 230, gap: 8 }}><ActionButton variant="secondary" label="CSV 내려받기" disabled={disabled} onPress={() => exportFile('csv')} /><Text style={muted}>표별 CSV를 ZIP으로 묶습니다. 엑셀 열람용이며 복원용은 아닙니다.</Text></View>
      </View>
      <Text style={muted}>백업은 암호화되지 않은 개인 자료입니다. 안전한 장소에 보관하세요. 비밀번호·로그인 토큰·API 키는 포함하지 않습니다. 파일 100MiB / 사진 500개까지 지원합니다.</Text>
    </View>
    <View style={panel}>
      <Text accessibilityRole="header" aria-level={3} style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>백업에서 복원</Text>
      <Text style={muted}>현재 로그인한 계정에서 만든 JSON 또는 전체 ZIP을 선택하세요. 기존 자료와 동일한 항목은 건너뛰고, 내용이 달라진 항목이 있으면 중단합니다. 휴지통으로 이동한 기존 옷을 덮어써 되살리는 기능은 아닙니다.</Text>
      <ActionButton variant="secondary" label="복원할 파일 선택" disabled={disabled} onPress={chooseFile} />
      {loaded && <View style={{ backgroundColor: colors.surface, padding: 16, gap: 14, borderRadius: 9 }}>
        <Text style={{ color: colors.text, fontWeight: '700' }}>{loaded.backup.kind === 'full' ? '사진 포함 전체 백업' : '데이터 JSON 백업'} · {backupDate(loaded.backup.createdAt)} (한국 시간)</Text>
        <Text style={muted}>의류 {loaded.backup.tables.wardrobe_items.length}개 · 코디 {loaded.backup.tables.outfits.length}개 · 착용 기록 {loaded.backup.tables.wear_events.length}개 · 사진 {loaded.backup.files.length}개</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Switch accessibilityLabel="프로필과 화면 설정도 복원" value={restoreProfile} trackColor={{ false: colors.border, true: colors.primary }} thumbColor={colors.background} disabled={busy || account.loading} onValueChange={value => { setRestoreProfile(value); setSummary(null); setProfileVersion(null); }} /><Text style={{ ...muted, flex: 1 }}>프로필과 화면 설정도 복원</Text></View>
        <Text style={muted}>{restoreProfile ? '프로필 이름·테마·정렬·카드 밀도를 백업 시점으로 바꿉니다.' : '현재 프로필과 화면 설정을 유지합니다.'}</Text>
        {summary ? <><Text style={{ color: colors.text, lineHeight: 22 }}>새로 추가할 자료 {counts.added}개 · 동일해서 유지할 자료 {counts.skipped}개{loaded.backup.files.length ? `\n사진 ${loaded.backup.files.length}개는 원본과 대조해 누락된 파일만 복원합니다.` : ''}</Text><ActionButton label="확인하고 복원" disabled={disabled} onPress={restore} /></> : <ActionButton label="복원 내용 다시 확인" disabled={disabled} onPress={previewAgain} />}
        <ActionButton variant="secondary" label="복원 취소" disabled={busy} onPress={() => { setLoaded(null); setSummary(null); setMessage(null); }} />
      </View>}
      <Text style={muted}>데이터는 한 번에 저장하고 사진은 이어서 올립니다. 연결이 끊기면 같은 파일로 다시 시도하세요. 완료된 자료를 중복 추가하거나 기존 파일을 덮어쓰지 않습니다.</Text>
    </View>
    {message && <Text accessibilityLiveRegion="polite" style={{ color: colors.primary, fontSize: 13, lineHeight: 22 }}>{message}</Text>}
    {error && <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 13, lineHeight: 22 }}>{error}</Text>}
    {busy && <ActionButton variant="secondary" label="작업 중단" onPress={() => lifecycle.current.request?.abort()} />}
  </View>;
}
