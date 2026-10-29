# 로컬 데이터 환경

최신: `20261029134820_category_deletion.sql`(총 20개)은 사용자 세부 분류 삭제/같은 부모 내 합치기와 삭제 재시도 이력을 추가한다. 로컬/운영에 적용했고 기존 사용자 데이터는 자동 삭제하지 않는다. `docs/CATEGORY_LIFECYCLE_VALIDATION.md` 참조.

- `20261028010000_initial_schema.sql`: 첨부 원본을 보존한 초기 스키마.
- `20261028011000_security_hardening.sql`: 경로/사진 슬롯/도메인 검증, private Storage와 명시적 권한 보완.
- `20261028020000_image_lifecycle.sql`: pending/ready, 대표 사진, 예약/완료/대표 변경/삭제 RPC와 컬럼 권한.
- `20261028021000_image_lock_order.sql`: Storage 쓰기 잠금 순서를 의류 → 사진으로 통일.
- `20261028022000_completed_image_immutable.sql`: ready 경로 파일 재삽입 차단.
- `20261028030000_wardrobe_search.sql`: RLS를 따르는 읽기 검색/정렬 RPC와 본인 브랜드·색상 목록.
- `20261028040000_wardrobe_usage.sql`: RLS를 따르는 본인 의류의 코디 수/이름·착용 기록 수.
- `20261028050000_outfit_writes.sql`: 최소 구성/소유자/active/분류/중복/버전 충돌을 검사하는 코디 저장·복제·soft delete RPC.
- `20261028060000_outfit_search.sql`: 본인 미삭제 코디의 이름/메모/태그/구성 브랜드 검색, AND 필터/정렬, 브랜드·태그 선택지 읽기 RPC.
- `20261028070000_wear_snapshots.sql`: 코디 버전/수동 의류를 검증하는 착용 이벤트·구성 원자적 저장과 재시도 출처 컬럼.
- `20261028080000_wear_calendar.sql`: 착용 수정/삭제 RPC, tombstone/재생성 차단, 날짜별 건수와 삭제 제외 통계/참조 집계.
- `20261028090000_insights.sql`: 회원별 30/90일·전체 요약과 의류별 누적 비용·서버 목록 읽기 RPC.
- `20261028100000_brands.sql`: 회원별 브랜드/비공개 로고, 의류 brand_id 연결과 기존 이름 이관·동기화, CAS 쓰기 RPC.
- `20261029010000_krw_only.sql`: 의류/프로필 원화 전용 제약과 단일 통화 가격 정렬. 기존 외화 구매가는 임의 환산하지 않고 적용 전 검토를 요구한다.
- `20261029020000_member_categories.sql`: 회원별 카테고리 이름/순서/숨김과 private 세부 분류, CAS/정렬 RPC 및 타인 분류 연결 차단.
- `20261029030000_brand_deletion.sql`: 브랜드 tombstone/활성 이름 고유값/삭제 RPC, 의류 연결 해제/삭제 후 새 업로드·재연결 차단과 로고 파일 정리 권한. 총 16개 migration.
- `config.toml`: PostgreSQL 17, 가입 제한/이메일 로그인 허용, 정확한 callback allowlist. 로컬 개발 전용.

`npm run db:start` → `npm run db:migrate` → `npm run db:test` 순서로 검증한다. 검증된 스키마 타입은 `npm run db:types`로 생성한다. 운영 배포/계정 연결은 수행하지 않았다.

사진 저장 계약은 DB 예약 생성 → 파일 업로드 → 완료 RPC, 삭제는 파일 → 예약 RPC 순서다. 코디/착용 쓰기는 인증된 RPC로만 수행하며 직접 테이블 쓰기는 닫혀 있다. 착용 생성 내부 validator는 app_private에 있고 회원 실행은 거부한다. 상세는 `docs/SECURITY.md`, 착용 검증은 `docs/PHASE_11_VALIDATION.md`, 코디는 `docs/PHASE_08_VALIDATION.md`, 사진은 `docs/PHASE_04_VALIDATION.md`를 참조한다.
