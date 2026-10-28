# 10단계: 착용 기록 스냅샷 저장·조회 기반

검증일: 2026-10-28 (Asia/Seoul). 사용자 요청에 따라 브라우저·실기기 검증 보류를 유지하고 H01 서버/데이터 계층을 구현했다. Q01 전체를 완료로 표시하지 않는다. H02 달력·기록 생성/수정/삭제 화면과 I01 통계 UI는 후속이다. 현재 `/calendar`는 기존 준비 화면이다.

## 구현

- `20261028070000_wear_snapshots.sql`을 로컬 Docker Supabase에 적용했다. migration은 총 10개이며 reset/원격 배포는 수행하지 않았다. 실제 DB에서 타입을 재생성했다. 새 패키지/환경 변수/외부 서비스는 없다.
- `record_wear_event`는 이벤트와 의류 ID 목록을 한 트랜잭션으로 저장한다. 본인 코디 ID/읽은 updated_at 또는 수동 UUID 배열 중 하나만 받는다. auth.uid()로 회원을 정하며 active·미삭제 의류 1–50개/중복/날짜/메모를 서버에서 검사한다. 일반 회원의 테이블 직접 쓰기/기록 수정·삭제는 계속 닫혀 있다.
- 이벤트별 advisory 잠금으로 생성/재시도를 직렬화한다. 코디는 기존 쓰기와 같은 advisory 잠금과 FOR SHARE, 의류는 UUID 순서 SHARE 잠금을 커밋까지 유지한다. 코디 수정이 먼저 커밋되면 이전 버전의 기록 요청은 거부하며, 착용 기록이 먼저 잠기면 수정은 기록 커밋까지 기다린다. 수동 의류 기록도 상태 변경이 검증과 커밋 사이에 끼어들지 못한다.
- 같은 이벤트 ID/정확한 원래 날짜·메모·입력 모드·원본 ID/버전 또는 수동 ID 집합의 재시도는 쓰기 없이 기존 기록을 반환한다. 요청 내용이 달라지면 충돌이다. 새 이벤트 ID를 사용하면 같은 날짜/같은 코디도 별도 착용으로 집계한다.
- `source_outfit_id`/`source_outfit_updated_at`은 원래 코디 요청의 출처를 보존한다. live FK인 outfit_id는 원본 hard delete 시 null이 되지만 출처와 당시 구성은 유지돼 원래 요청을 재시도할 수 있다. 출처는 현재 원본의 존재를 보장하는 FK가 아니며 신규 RPC가 본인 코디에서만 작성한다. 기존 기록의 출처는 null로 유지하고 역산하지 않았다. 계정 cascade 삭제 때 함께 정리된다.
- 당시 구성은 wear_event_items의 의류 ID 집합이다. 과거 구성을 현재 outfit_items로 다시 계산하지 않는다. 의류 이름·가격·사진 등 속성은 현재 값을 읽으며 비활성/휴지통 참조도 기록에서 조회할 수 있다.
- `model.ts`는 시간대 변환 없는 지역 날짜 문자열, 실제 날짜/윤년(1900-01-01–9999-12-31), 메모 5000자, UUID 정규화/중복/수동 50개 경계, 최대 366일 포함 조회 범위를 검증한다. 날짜를 시각으로 변환해 저장하지 않는다.
- `repository.ts`는 세션 검사/시작 토큰 고정/AbortSignal/자동 재시도 금지를 적용한 record/get/list를 제공한다. 범위 조회는 날짜 포함 경계와 날짜·생성 시각·ID 정렬, 20개 페이지/정확한 개수/페이지 소멸 시 재집계를 사용한다. `queries.ts`는 회원별 key/포커스 갱신/15초 취소/해제 epoch와 관련 wear/wardrobe/outfits/insights 조회 취소·무효화를 제공한다. 호출자는 한 기록 시도의 ID/입력을 재시도에 유지해야 한다.

## 검증 결과

| 항목 | 결과 | 범위 |
| --- | --- | --- |
| TypeScript / ESLint | PASS | 오류·경고 0 |
| 단위 테스트 | PASS | 14개 파일, 72개 테스트 |
| 실제 DB/Auth/Storage 통합 | PASS | Node 13 + Vitest 56 = 69개 |
| SQL lint | PASS | `supabase db lint --local --level warning`, 오류 없음 |
| 웹 / Android / iOS export | PASS | 기존 앱의 웹 번들과 두 Hermes 번들 회귀. 실기기 실행과 구분 |
| 공개 번들 서버 키 검사 | PASS | 산출물 31개에 실제 로컬 service_role 키 미검출 |
| 수동/코디 기록 | PASS | 본인 구성과 코디 출처 저장, 같은 날 같은 코디 2회/다른 날 별도 이벤트 |
| 과거 구성 보존 | PASS | 코디 구성 변경·soft delete·hard delete 후 원래 의류 목록/출처 유지. 바뀐 모드/버전의 재시도는 거부 |
| 비활성/휴지통 의류 | PASS | 새 기록은 거부. 기존 스냅샷은 보관/삭제 후 조회·정확한 재시도 가능 |
| 원자성/입력 경계 | PASS | 없는/타인/비활성 의류가 있으면 이벤트·구성 모두 0건. 날짜/명시적 null/메모/중복/빈 구성/코디·수동 혼합 거부, 유효한 의류 50개 저장 |
| 응답 유실/동시 생성 | PASS | 실제 commit 응답을 버린 뒤 재시도. 코디가 바뀌어도 기존 기록 반환. 같은 ID 동시 동일 요청은 한 기록, 다른 요청은 한 쪽만 성공 |
| 잠금 경합 | PASS | 착용 기록 커밋 전 코디 수정/의류 보관은 대기. 코디 수정이 먼저 잠기면 기록은 대기 후 오래된 버전을 거부 |
| 회원 격리 | PASS | 다른 회원 조회/코디/기록 ID/의류 연결 차단, anon 실행/조회 차단, 직접 INSERT/UPDATE/DELETE 차단 |
| 세션/취소 | PASS | 취소·다른 owner 조회 거부, 전송 직전 공유 클라이언트 A→B 변경에도 A 토큰으로만 저장 |
| 날짜 범위/페이지 | PASS | 윤일 단일 날짜 21개→20/1 페이지, 양끝 포함, 안정 정렬, 삭제 후 빈 마지막 페이지/20개로 재집계 |
| 기존 통계 view 갱신 | PASS | 새 의류 착용 0회 비용 null → 1회 120 → 같은 요청 재시도 후 1회 → 같은 날 새 이벤트 후 2회/60 |
| 브라우저/실기기 | 보류 | 사용자 요청에 따라 실행하지 않음. 새 기록 UI는 이번 단계 범위 밖 |

새 단위 테스트 6개는 날짜/윤년, 366일 범위, whitelist/정규화, 수동 구성 경계, 원본 버전 정밀도, 캐시 경계/오류 메시지를 검증한다. 새 착용 DB 테스트 12개와 기존 57개 회귀를 함께 통과했다. 마지막 두 재시도 검증을 추가한 뒤 착용 통합 12개를 다시 통과했다.

원본 코디 hard delete의 기존 FK 동작은 outfit_id를 null로 바꾸고 기존 updated_at trigger도 실행한다. 재시도 검증은 이 unlink 직후의 현재 버전을 유지하는지 확인한다. 이벤트 created_at/원본 출처/스냅샷은 보존된다.

## 실행 환경과 재현

기존 집 PC의 Node 24.22.1/npm 11.19.1을 사용했다. 프로젝트 권장 Node 22.23.x/npm 10과 구분하며 package.json/lockfile은 변경하지 않았다. 테스트는 loopback 54321 및 직접 생성한 임시 계정/데이터만 사용했다. 실제 계정/개인 사진은 사용하지 않았다. 종료 후 auth.users/wardrobe_items/outfits/wear_events/wear_event_items/item_images/storage.objects 모두 0건을 확인했다. 로컬 Supabase는 실행 상태로 유지한다.

```powershell
npm run db:migrate
npm run db:types
npm run check
npm run db:test
npx supabase db lint --local --level warning
npm run export:web
npm run export:native -- --output-dir dist/native
node scripts/check-public-bundle.mjs
```

웹/네이티브 export는 기존 앱 번들 회귀 검사다. 새 H01 Query는 H02 화면에서 사용할 기반이며 현재 달력에서 호출하지 않는다.

## 다음 작업

H02에서 월 달력/선택일 목록/코디 또는 개별 의류 기록 폼과 수정·삭제 RPC/충돌 처리/조회 갱신을 연결한다. 이후 I01 기간별 통계를 구현한다. O02–O03 UI, Q01 기기간 화면 갱신/접근성/실기기 검증과 공개 가입/원격 HTTPS·SMTP·배포는 남아 있다. 사용자 요청에 따라 브라우저 검증 재승인은 요청하지 않았다.
