# 로컬 데이터 환경

- `20261028010000_initial_schema.sql`: 첨부 원본을 보존한 초기 스키마.
- `20261028011000_security_hardening.sql`: 경로/사진 슬롯/도메인 검증, private Storage와 명시적 권한 보완.
- `20261028020000_image_lifecycle.sql`: pending/ready, 대표 사진, 예약/완료/대표 변경/삭제 RPC와 컬럼 권한.
- `20261028021000_image_lock_order.sql`: Storage 쓰기 잠금 순서를 의류 → 사진으로 통일.
- `20261028022000_completed_image_immutable.sql`: ready 경로 파일 재삽입 차단.
- `20261028030000_wardrobe_search.sql`: RLS를 따르는 읽기 검색/정렬 RPC와 본인 브랜드·색상 목록.
- `20261028040000_wardrobe_usage.sql`: RLS를 따르는 본인 의류의 코디 수/이름·착용 기록 수. 총 7개 migration.
- `config.toml`: PostgreSQL 17, 가입 제한/이메일 로그인 허용, 정확한 callback allowlist. 로컬 개발 전용.

`npm run db:start` → `npm run db:migrate` → `npm run db:test` 순서로 검증한다. 검증된 스키마 타입은 `npm run db:types`로 생성한다. 운영 배포/계정 연결은 수행하지 않았다.

사진 저장 계약은 DB 예약 생성 → 파일 업로드 → 완료 RPC, 삭제는 파일 → 예약 RPC 순서다. 코디/착용 직접 쓰기는 후속 원자적 RPC 구현 전 닫혀 있다. 상세는 `docs/SECURITY.md`, 사진 검증은 `docs/PHASE_04_VALIDATION.md`를 참조한다.
