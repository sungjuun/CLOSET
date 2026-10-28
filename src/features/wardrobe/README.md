# 옷장 모듈 계약

현재 구현: `schemas.ts` 입력 검증 → typed `repository.ts`의 categories/list/get/create → `queries.ts`의 회원별 key/요청 취소/저장 후 무효화 → 등록/목록/상세 화면. owner는 인증 컨텍스트에서 캡처하고 폼은 소유자/상태/생성 시각을 전달하지 않는다.

브랜드는 `features/brands`의 이름/이미지 관리와 검색 선택창을 공유한다. 새 폼은 brand_id를 저장하고 DB가 본인 브랜드의 정식 brand_name을 채운다. 이름 변경은 휴지통을 포함한 연결 의류에 반영되며 기존 검색·필터·통계 계약을 유지한다. 카드/상세 로고는 별도 private bucket의 짧은 signed URL이다. 선택 해제는 ID/이름 모두 null로 만든다. 기존 미연결 텍스트는 호환성을 위해 보존한다. 검증은 `docs/BRANDS_VALIDATION.md`다.

목록은 soft delete를 제외하고 읽기 전용 `search_wardrobe_items` RPC로 20개씩 조회한다. `filters.ts`의 정규화된 검색/필터/정렬 값 전체를 회원별 key에 포함한다. 문자열 검색은 이름/브랜드/색상의 대소문자 무시 리터럴 부분 일치다. 필터는 AND, 대분류는 자신과 하위 분류 포함, 브랜드/색상은 정확히 일치, 계절은 한 계절 선택이다. 변경 시 페이지 0, 결과 감소 시 마지막 유효 페이지로 보정한다. 기본 최신순 외 이름/브랜드/오래된 등록/통화별 가격 정렬을 지원하며 created_at/id로 동률을 해소한다. 브랜드·색상 선택지는 본인의 삭제되지 않은 전체 옷장 기준이며 다른 필터에 따라 줄이지 않는다.

저장은 폼 생명주기 동안 같은 UUID를 유지한다. 응답이 유실된 요청을 동일 내용/ID로 재시도하면 기존 행을 반환하며 다른 내용으로 덮어쓰지 않는다. 계정 전환/화면 이탈 때 진행 중 요청을 취소하고 늦은 mutation의 캐시 반영/화면 이동을 억제한다.

`photos/`는 platform별 선택/디코딩·재인코딩, 세션을 고정한 Storage/RPC service, 회원별 Query, PhotoFrame/PhotoManager를 제공한다. 등록 후 상세에서 사진을 추가한다. pending 예약은 최대 5장에 포함하며 ready 사진만 signed URL을 발급한다. 업로드 오류는 동일 ID/변환 바이트로 재시도하고 앱 재실행 후 남은 예약은 상세에서 완료/정리한다. 삭제는 Storage → 예약 RPC 순서다. URL은 TTL 60초이며 영구 저장하지 않는다.

공통 SelectField는 웹의 label/select와 네이티브의 Modal/라디오 목록 어댑터를 사용한다. 검색은 350ms 지연 또는 키보드 검색 제출로 적용한다. 필터 값은 화면 메모리에만 유지하며 URL/영구 저장과 최근 착용순은 구현하지 않았다.

W04: `WardrobeForm`을 등록/수정에서 공유한다. 수정은 읽은 당시의 snapshot을 유지하며 자동 재조회로 초안을 덮어쓰지 않는다. repository update/setFavorite/setStatus/softDelete/restore는 owner/id/updated_at/삭제 여부로 조건부 갱신한다. 이전 응답 유실 후 같은 원하는 결과가 이미 저장돼 있으면 반환하고 다른 내용이면 conflict다. 폼 입력은 whitelist 필드만 저장한다. 삭제는 deleted_at만 채우며 사진·참조는 그대로 보존, 휴지통에서 원래 lifecycle_status로 복원한다.

`useWardrobeActions`는 화면/회원 수명주기, 15초 요청 중단, 기존 조회 취소/개인 캐시 무효화를 처리한다. 읽기 재시도가 편집 UI를 계속 잠그지 않도록 후속 조회는 백그라운드로 처리한다. 취소/시간 초과는 서버 rollback을 보장하지 않으므로 재조회/동일 결과 재시도를 사용한다. 새 영구 삭제/Realtime은 없다. 수정 취소/최신 정보 교체 버튼은 입력 폐기를 확인하며 브라우저 닫기/OS 뒤로 가기 경고는 제공하지 않는다.

상세의 usage는 삭제되지 않은 본인 코디 수/이름과 모든 본인 착용 참조 수다. 실제 코디 편집/착용 화면은 후속이다. 카메라/HEIC/선택창·편집의 네이티브 실기기 검증은 남아 있다.
