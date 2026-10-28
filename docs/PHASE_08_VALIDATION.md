# 8단계: 원자적 코디 저장·수정·복제·삭제

검증일: 2026-10-28 (Asia/Seoul). O02 서버 RPC와 편집/목록 화면 연결을 구현했다. 브라우저 조작 검증은 접근 승인 거부로 미실행이며 수락 조건으로 남긴다. 원격 배포와 실기기 검증은 수행하지 않았다.

## 구현

- `20261028050000_outfit_writes.sql`을 추가해 migration은 총 8개다. 로컬 Docker Supabase를 새로 시작해 기존 7개와 새 migration을 모두 적용했다. 기존 데이터 reset은 수행하지 않았다. 타입은 실제 로컬 DB에서 재생성했다.
- `save_outfit`은 메타데이터와 전체 슬롯 구성을 한 트랜잭션으로 저장/교체한다. auth.uid()로 소유자를 정하고 JSON 필드/길이/최소 1개/7슬롯/중복/position=0을 서버에서 검사한다. 모든 의류를 UUID 순서로 SHARE 잠금하고 본인 active·미삭제·분류를 다시 검사해 검증과 저장 사이의 상태 변경을 막는다.
- 생성 전부터 코디별 advisory 잠금을 잡고, 기존 행은 FOR UPDATE로 잠근다. 수정은 updated_at 원문을 비교한다. 기존 버전과 다르거나 첫 생성 ID가 이미 존재하면 정확히 같은 저장 결과에 한해 무변경 성공으로 처리하며 그 밖에는 충돌을 반환한다. updated_at은 clock_timestamp와 이전 값+1μs 중 큰 값으로 단조 증가한다.
- `copy_outfit`은 저장된 원본 버전을 확인하고 메타데이터/슬롯을 복사한다. 원본은 유지하며 복제 이름에는 `(복사)`를 붙인다. 복제 시에도 현재 의류 검증과 단일 트랜잭션 저장을 사용한다. 재시도 시 같은 대상 ID를 사용한다.
- `delete_outfit`은 버전 비교와 soft delete를 사용한다. 반복 삭제는 기존 삭제 결과를 반환한다. 의류/사진/기존 착용 연결과 착용 당시 의류 목록을 유지한다. 코디 복원/영구 삭제 UI는 이번 범위에 없다.
- 모든 RPC는 고정 search_path와 명시적 회원 검사를 사용한다. PUBLIC/anon 실행 권한과 회원의 outfits/outfit_items 직접 INSERT/UPDATE/DELETE는 닫혀 있다. malformed 입력이나 소유자 주입을 거부한다.
- `repository.ts`는 입력 whitelist/정규화와 시작 시 세션 검사/토큰 고정을 제공한다. 요청 도중 공유 클라이언트 계정이 바뀌어도 시작한 계정의 토큰으로만 요청한다. Query actions는 회원별 key/15초 AbortSignal/해제 epoch 검사를 사용한다. 서버 commit 뒤 응답이 유실될 수 있으므로 취소를 rollback 보장으로 취급하지 않는다.
- `/outfits/new`에 저장 버튼, `/outfits/[outfitId]`에 기존 코디 불러오기·수정·복제·삭제를 연결했다. 기존 폼 snapshot은 백그라운드 재조회로 덮어쓰지 않는다. 실패/충돌 시 입력을 유지하고 사용자 확인 후 최신 저장본으로 교체한다. 미저장 변경은 메뉴/화면 이탈 확인을 유지한다. 지원하지 않는 다중 레이어 구성은 일부만 저장하지 않고 편집을 거부한다.
- 목록에 보기·수정 링크와 비활성/삭제/분류 변경 경고를 추가했다. 쓰기 뒤 해당 회원의 코디/옷장 Query를 무효화하며 카드의 이름/메모/계절 조회와 API 저장 후 재조회는 검증했다. 실제 화면 갱신/포커스 동작은 브라우저 검증이 필요하다.

## 검증 결과

| 항목 | 결과 | 범위 |
| --- | --- | --- |
| TypeScript / ESLint | PASS | 오류·경고 0 |
| 단위 테스트 | PASS | 12개 파일, 63개 테스트 |
| 실제 DB/Auth/Storage 통합 | PASS | Node 13 + Vitest 37 = 50개 |
| SQL lint | PASS | `supabase db lint --local --level warning`, 오류 없음 |
| 웹 / Android / iOS export | PASS | 웹 번들과 두 Hermes 번들. 실기기 빌드/실행과 구분 |
| 공개 번들 서버 키 검사 | PASS | 웹/네이티브 산출물 31개에 실제 로컬 service_role 키 미검출 |
| 7슬롯 저장/전체 구성 교체 | PASS | 메타데이터, 태그/즐겨찾기, 이름 검색과 실제 목록 재조회 |
| 입력/회원 격리 | PASS | 빈/중복/잘못된 분류·UUID·position·JSON null/소유자 주입, 타인/anon/직접 쓰기 차단 |
| 저장 원자성 | PASS | 사용할 수 없는 의류가 하나라도 있으면 이름·버전·기존 슬롯 유지 |
| 동시 변경 | PASS | 두 동시 수정 중 하나만 성공, 오래된 버전의 수정·삭제·복제 거부 |
| 응답 유실/재시도 | PASS | 실제 commit 응답을 버린 뒤 같은 생성/수정/복제 재요청. 기존 ID/버전/구성 유지 |
| 잠금 경합 | PASS | 저장 트랜잭션이 끝나기 전 의류 보관 처리는 대기. 반대로 보관 변경이 먼저 잠기면 저장은 대기 후 변경된 상태를 보고 거부 |
| 계정 전환 | PASS | RPC 전송 직전 공유 클라이언트를 A→B로 바꿔도 A 토큰으로만 저장, B 조회는 비어 있음 |
| 삭제/과거 기록 | PASS | soft delete 후 목록/상세에서 제외, 의류·과거 착용 스냅샷 유지, 반복 삭제 안전 |
| 브라우저 UI 조작/스크린샷 | NOT RUN | 도구의 localhost:8081 접근 승인 거부. 다른 브라우저/자동화 방식으로 우회하지 않음 |
| 네이티브 실기기/기기간 화면 갱신 | NOT RUN | 실제 기기 검증 필요 |

이번 집 PC의 Node는 24.22.1/npm 11.19.1이다. 기존 프로젝트 권장 범위인 Node 22.23.x/npm 10과 달라 `npm ci`에서 engine 경고가 있었으며 위 결과는 Node 24 환경의 결과다. package.json/lockfile의 버전 범위는 변경하지 않았다. Windows Docker Desktop은 사용자 설치 경로의 resources/bin을 현재 검증 프로세스 PATH에만 추가했다.

재현 명령:

```powershell
npm ci
npm run db:start
npm run db:migrate
npm run db:types
npm run env:local # 기존 .env.local이 없을 때만
npm run check
npm run db:test
npx supabase db lint --local --level warning
npm run export:web
npm run export:native -- --output-dir dist/native
node scripts/check-public-bundle.mjs
```

통합 테스트는 loopback Supabase와 직접 만든 임시 회원/의류/코디/착용 기록만 사용하고 계정을 정리했다. UI 검증 준비용 두 임시 계정과 의류/사진도 `scripts/ui-fixture.mjs cleanup`으로 정리했다. 실제 계정이나 개인 사진은 사용하지 않았다. 로컬 공개 환경값만 `.env.local`에 작성했으며 서버 키는 넣지 않았다.

## 남은 수락 조건과 다음 작업

1. 브라우저에서 생성→목록→수정→재접속→복제→삭제, 실패 시 입력 유지/충돌 후 최신 내용 교체, 삭제 취소/확인, 미저장 이탈 취소/확인을 검증한다. 320/390/1280/1440px에서 추가 버튼/확인창과 사진을 확인한다.
2. 실제 브라우저 새로고침/닫기 확인창, 모바일 뒤로 가기/스와이프/키보드/사진 권한과 A→B 전환 시 화면/캐시 격리를 확인한다.
3. O03 태그/브랜드 코디 검색을 보완한 후 Q01 회귀를 진행한다. 레이어/position 재정렬, 코디 복원, 미저장 초안의 영구 복구는 별도 범위다.
4. 원격 HTTPS Supabase/SMTP/배포·스토어 빌드와 운영 환경은 후속이다. 기존 의존성 audit 경고는 이번 단계에서 재감사하지 않았다.
