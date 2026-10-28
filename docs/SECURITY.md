# 회원 데이터 분리와 SQL 검토

## 원본에서 유지할 구조

모든 개인 테이블의 RLS에 `auth.uid()`를 사용한다. `profiles.id` 또는 `user_id` 소유권을 USING / WITH CHECK 양쪽에서 검사하므로 타인 행 조회/수정 및 소유자 변경을 막는다. `outfit_items`, `item_images`, `wear_event_items` 등의 `(id, user_id)` 복합 FK는 타 회원의 의류/코디 연결을 차단한다. 카테고리는 전역 읽기만 허용한다. `item_wear_stats`는 `security_invoker`여야 한다.

원본은 PostgreSQL 15 이상을 전제한다: invoker view와 `ON DELETE SET NULL (outfit_id)` 같은 일부 열 대상 동작을 실제 Supabase 버전에서 확인해야 한다. 회원 탈퇴 시 restrict 참조와 auth cascade가 충돌하지 않는지도 통합 검증해야 한다.

## 검토 결과와 구현 상태

1. 구현: `app_private.valid_image_path` 제약으로 `{user_id}/items/{item_id}/{UUID}.ext`를 검증한다. Storage 정책은 해당 본인 소유 의류와 사진 예약을 함께 확인한다.
2. 구현: `image_order` 0–4 범위 + `(item_id, image_order)` 고유 제약으로 최대 5장을 동시성 하에서도 강제한다. 업로드 정책은 의류 → 사진 순서의 SHARE 잠금을 잡고 파일이 남은 예약 삭제는 trigger로 거부한다. 삭제는 Storage 객체 → 예약 RPC 순서다. 파일 덮어쓰기/이동/ready 경로 재삽입은 닫고 새 UUID 경로를 사용한다. W02에서 변환/업로드/재시도/미완료 예약 정리 UI를 연결했다.
3. 코디/착용 쓰기는 회원별 잠금·의류 SHARE 잠금·고정 search_path·소유권 검사 RPC를 사용한다. 착용 생성/명시적 구성 교체는 본인 active·미삭제 의류 1–50개/중복/날짜/메모/코디 버전을 검사한다. H02 keep 편집은 과거 구성을 보존하고 날짜/메모만 수정한다. 수정·삭제는 updated_at CAS와 단조 증가 timestamp를 사용하며 삭제 tombstone은 목록/집계에서 제외한다. 생성 validator를 app_private로 옮겨 회원 실행을 거부하고 공개 wrapper에서 삭제된 ID의 재생성을 차단한다. authenticated에는 outfits/outfit_items/wear_events/wear_event_items 직접 쓰기 권한을 부여하지 않는다. 읽기 RLS와 복합 FK는 계속 적용한다.
4. 구현: 개인 테이블/view와 함수 권한을 명시했다. 프로필은 표시 이름/테마/통화만 수정 가능하고 의류 소유자/ID 변경 및 hard delete는 닫았다. 내부 trigger 함수의 PUBLIC 실행 권한을 제거했다. 정책 helper는 노출 API schema 밖인 app_private에 두고 필요한 권한만 허용한다.
5. 구현/후속: import 요청은 HTTPS/길이와 pending 상태만 허용하고 결과/상태 수정은 서버 전용이다. 실제 URL fetch는 아직 없으며 DNS/redirect/응답 크기/시간 제한은 P1 서버 작업의 필수 조건이다.
6. 구현: 계절 enum 집합, 3자리 통화, hex 색상, 태그 개수/길이/null, 텍스트 길이와 가격 제약을 추가했다. 가입 메타데이터의 이름은 80자로 제한한다. 관계가 있는 계정의 DB cascade 삭제도 fixture로 검증했다.
7. 구현: bucket 설정을 명시적으로 UPDATE해 private/MIME/5MiB 설정을 보장한다. 완료 RPC는 소유권, 실제 객체 존재, Storage 메타데이터의 크기/MIME와 경로 일치를 검사한다. 앱은 파일 시그니처 → 실제 디코딩 → 재인코딩 → 출력 시그니처/크기 검증 후 원본 대신 변환본을 업로드한다. 서버는 실제 바이너리를 디코딩하지 않으므로 악의적 API 직접 호출의 위장 바이트까지 거부한다고 주장하지 않는다. 서버 측 바이트 검증/격리 기능은 공개 서비스 전 추가 보안 과제다.
8. 구현: 상태/대표 컬럼의 직접 INSERT/UPDATE는 허용하지 않고 고정 search_path의 소유권 검사 RPC로 변경한다. 대표 중복은 unique partial index로 막는다. 일반 삭제 RPC는 다음 ready 사진을 대표로 선택한다. 직접 metadata 삭제 권한까지 포함한 모든 경로에서 대표가 반드시 1개라고 보장하지는 않으며, 표시 시 첫 ready 사진을 fallback으로 사용한다.

## 앱 측 경계

- 브랜드는 회원별 RLS의 `brands`와 `(brand_id,user_id)` 복합 FK로 연결한다. 의류 trigger는 본인 브랜드의 정식 이름을 채우고 브랜드명 수정 RPC는 연결 의류 이름도 한 트랜잭션에서 갱신한다. 브랜드 직접 쓰기/anon 실행을 차단하고 인증·소유권·버전 CAS를 검사한다. 로고는 별도 private bucket의 본인/브랜드/UUID 경로와 5MiB/MIME 제한을 사용하며 덮어쓰기/이동은 허용하지 않는다. 현재 참조된 파일 삭제는 막고 교체/해제 후 정리한다. 저장소는 시작 토큰·AbortSignal·회원별 캐시를 적용한다. 서버 이미지 바이트 디코딩과 미연결 파일 자동 수거는 후속이며 상세 검증은 `BRANDS_VALIDATION.md`다.

- 공개 번들에는 Supabase URL과 publishable key만 허용한다. 모든 `EXPO_PUBLIC_*` 값은 사용자가 볼 수 있다. service_role/secret key는 서버에만 둔다.
- 환경 검증은 비밀 키 형식을 거부하며 값 자체를 로그/오류에 출력하지 않는다. 환경값 미설정/오류 시 클라이언트 생성과 데이터 접근을 중단한다.
- 회원별 Query key, 전환 중 화면 차단, 요청 취소/캐시 삭제를 함께 사용한다. 옷장 list/get/categories HTTP 요청에는 Query의 AbortSignal을 연결했다. 저장 중 화면 이탈/계정 전환 시 mutation을 취소하며 늦은 응답의 캐시 재삽입/화면 이동을 억제한다.
- 검색과 브랜드/색상 선택지 RPC는 `security invoker`로 RLS를 유지하며 `user_id = auth.uid()`와 캡처한 요청 소유자를 모두 검사한다. PUBLIC/anon 실행 권한은 제거했다. 사용자 검색어는 바인딩 값으로 전달해 `strpos`로 문자 그대로 찾고 정렬은 서버의 허용 목록/CASE로 제한한다. 모든 필터/페이지는 회원별 Query key에 포함한다.
- 코디 검색/브랜드·태그 선택지도 security invoker와 auth.uid()/요청 소유자 검사를 사용한다. 코디와 연결 의류/태그는 RLS를 유지하며 휴지통 의류/삭제 코디는 브랜드 검색·선택지에 포함하지 않는다. 여러 옷이 일치해도 EXISTS로 한 코디만 집계한다. 익명·타인 owner 지정·취소·특수문자·직접 RPC의 길이/정렬/명시적 null 검증은 `PHASE_09_VALIDATION.md`를 참조한다.
- W04 참조 안내 RPC도 security invoker이며 본인 코디/착용 참조만 집계한다. 본인 휴지통은 기존 SELECT RLS와 owner/삭제 여부 필터로 조회한다. 복원은 deleted_at만 비우며 원래 상태와 사진/연결을 유지한다. hard delete나 영구 Storage 정리 권한은 추가하지 않았다.
- 수정·즐겨찾기·상태·삭제·복원은 세션 소유자 확인, owner/id/updated_at 조건부 UPDATE, 쓰기 whitelist를 사용한다. 충돌은 최신 값을 자동 덮어쓰지 않는다. 이 충돌 계약은 앱 저장소의 동작이며 기존 직접 UPDATE 권한을 제거한 DB 전체 강제 규칙은 아니다. RLS는 직접 호출에도 동일하게 적용된다. 요청 중단은 서버 commit 취소를 보장하지 않아 재조회와 원하는 결과 비교로 재시도한다.
- O01 후보 조회는 본인 active/미삭제/슬롯 분류로 제한하고 선택·구성 검사 시 다시 읽어 확인한다. 선택된 의류 배치 조회는 본인 행만 반환하며 상태 변경/삭제도 감지한다. 미저장 초안은 컴포넌트 메모리에만 두고 토큰/URL을 함께 저장하지 않는다. 회원 교체 시 초안/조회/확인 요청을 폐기한다. O01 읽기 검사 자체는 원자적 검증이 아니므로 O02 RPC가 저장 트랜잭션 안에서 소유권·활성·분류를 재검사한다. outfits/outfit_items 직접 쓰기는 계속 차단한다.
- 개인정보/이미지 URL/토큰을 Zustand, analytics, 로그에 보관하지 않는다. private 이미지의 signed URL은 짧은 TTL로 발급하고 개인 캐시와 함께 지운다.
- 착용 저장소는 시작 세션의 토큰을 고정하고 날짜를 지역 달력 문자열로 유지한다. 생성은 동일 이벤트 ID/정확한 원래 요청만 재시도 성공이며 변경된 요청은 충돌이다. 수정은 CAS와 현재 원하는 값의 무변경 성공을 사용한다. source_outfit_id/source_outfit_updated_at은 생성·명시적 코디 교체 때 본인 코디에서만 채우는 출처다. source ID는 live FK가 아니므로 원본 hard delete 뒤에도 남지만 다른 회원의 코디를 출처로 임의 지정할 수 없다. 계정 삭제 때 wear_events와 함께 제거된다. 입력에 user_id를 받지 않고 날짜 범위 Query도 회원별 key/세션 검사/취소를 적용한다.
- 착용 편집은 원본 스냅샷 유지와 명시적 교체를 구분한다. keep은 비활성/휴지통 의류를 다시 활성화하거나 현재 코디로 재계산하지 않는다. 명시적 교체는 현재 의류/원본 코디를 잠금 안에서 검사하며 다른 기록은 건드리지 않는다. 삭제된 이벤트와 스냅샷은 tombstone으로 보관하고 앱 목록/get·날짜 건수·item_wear_stats·wardrobe_item_usage에서 제외한다. 일반 회원이 직접 deleted_at을 지우거나 내부 생성 validator를 호출해 되살릴 수 없음을 검증했다. own-row RLS 자체는 본인 tombstone SELECT를 허용한다. 복원/영구 삭제 API는 제공하지 않는다.
- I01 통계의 두 읽기 RPC는 security invoker/RLS와 auth.uid()/요청 소유자 검사를 유지하며 PUBLIC/anon 실행을 거부한다. 기간·기준일·목록 모드·검색 길이는 서버에서 검증하고 검색은 바인딩한 문자열의 리터럴 부분 일치다. 요약은 본인 전체 집계를 DB에서 계산하고 의류 목록만 20개씩 반환한다. 저장소는 시작 세션 토큰/AbortSignal을 고정하고 회원·기준일·기간·검색·페이지를 캐시 key에 포함한다. 새 쓰기 권한이나 공개 데이터 경로는 추가하지 않는다. A/B·anon·전송 직전 세션 교체·취소 검증은 `PHASE_12_VALIDATION.md`를 참조한다.
- 사진 signed URL은 TTL 60초다. 화면에서 조회 중 45초마다 갱신하며 캐시의 gcTime=0, 회원별 key, 계정 전환 시 캐시 삭제를 적용한다. 이미 발급된 URL은 bearer 링크로 만료 전까지 사용될 수 있으며 로그아웃이 즉시 폐기하는 것은 아니다. 사진 작업은 시작 시 세션/회원 확인 후 토큰을 고정하고 Storage/RPC 요청 모두에 AbortSignal을 연결한다.
- 네이티브 자동 토큰 갱신은 foreground에서 실행한다. 웹 인증 복귀와 재설정은 PKCE 및 정확한 callback allowlist를 사용한다.
- 이메일 인증과 `(main)` route guard를 구현했다. 로그아웃/세션 전환 중 개인 화면과 탐색은 숨긴다. 공개 callback은 세션 전환 시 마운트를 유지한다. 실제 의류 목록/상세 UI에서도 A→로그아웃→B의 캐시 격리 및 타인 상세 URL 거부를 검증했다.

## 검증과 남은 수락 조건

실제 로컬 Supabase에서 `npm run db:test`로 A/B와 anon을 검증한다. service_role은 fixture 생성/정리 및 RLS와 독립적인 FK 검증에만 사용한다. 회원 분리는 실제 로그인한 A/B의 토큰으로 검증한다. O02/O03은 `PHASE_08_VALIDATION.md`/`PHASE_09_VALIDATION.md`, 착용 기반은 `PHASE_10_VALIDATION.md`, 착용 편집·삭제·달력은 `PHASE_11_VALIDATION.md`, 기간별 통계는 `PHASE_12_VALIDATION.md`에서 검증했다. 계정 전환 캐시의 네이티브 실기기 검증, 서버 측 이미지 바이너리 디코딩 및 탈퇴 서버 전체 프로세스는 아직 남아 있다.

- A의 전체 개인 테이블 SELECT에서 B 데이터 0건, B 행 UPDATE/DELETE 영향 0건.
- A가 `user_id=B`를 INSERT하거나 자기 행을 B로 UPDATE하면 거부.
- A의 코디/착용/사진 행에 B의 item_id/outfit_id를 INSERT/UPDATE하면 거부.
- anon은 개인 테이블/Storage 접근 거부; 카테고리 SELECT만 허용.
- A가 B의 Storage 경로 읽기/쓰기/덮어쓰기/이동/삭제를 하면 거부.
- 자기 폴더 아래 타인/존재하지 않는 item 경로, 6번째 이미지, 5MiB 초과/선언 MIME 불일치를 거부. 바이트 자체를 위조한 직접 호출 검증과 구분한다.
- A→B/로그아웃/세션 만료 시 캐시와 진행 중 요청에서 A 데이터가 다시 나타나지 않음.
- 코디 수정/삭제 후 과거 착용 item 목록 유지, 계정 삭제 시 DB+Storage 정리.

초기 정적 검토를 보안 migration에 반영했고 PostgreSQL 17.11에서 실제 API/SQL 통합 테스트를 통과했다. 최신 코디 초안/선택은 `PHASE_07_VALIDATION.md`, 의류 수정/휴지통은 `PHASE_06_VALIDATION.md`, 검색/필터는 `PHASE_05_VALIDATION.md`, 사진은 `PHASE_04_VALIDATION.md`, 의류 등록/조회는 `PHASE_03_VALIDATION.md`, DB/Auth는 `PHASE_02_VALIDATION.md`를 참조한다. 운영/원격 환경은 아직 검증하지 않았다.

근거: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage 정책](https://supabase.com/docs/guides/storage/security/access-control).
