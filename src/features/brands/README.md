# 브랜드 관리

`/brands`는 본인 브랜드 이름·선택 이미지의 등록/수정과 이미지 해제를 제공한다. `BrandPicker`를 의류 등록/수정에서 사용하고 `BrandLogo`를 선택창·옷장 카드·상세에 공유한다. 브랜드 전체 삭제는 제공하지 않는다.

이름은 1–120자 trim/회원별 정확 일치 고유값이다. 기존 의류 브랜드는 migration에서 목록/ID로 이관하고 brand_name은 검색/통계 호환 캐시로 유지한다. 선택된 brand_id의 이름은 DB trigger에서 채운다. 브랜드 이름 변경은 휴지통 포함 연결 의류와 한 트랜잭션이다.

service는 시작 세션 토큰/AbortSignal을 고정한다. 전체 목록은 서버 500개 페이지를 끝까지 읽고 UI는 검색/20개 페이지를 사용한다. 로고는 보이는 페이지에만 signed URL을 발급한다. 브랜드명 저장과 로고 저장은 별도 단계이며 부분 성공을 알리고 같은 UUID/변환 파일로 재시도한다. 로고 변환은 기존 wardrobe/photos 플랫폼 어댑터를 재사용한다. 현재 파일을 덮어쓰지 않고 새 경로로 교체한 뒤 이전 파일을 정리한다.

hooks는 brands/wardrobe/outfits/insights 캐시를 갱신한다. 계정 전환 시 화면/초안/요청을 폐기하며 로고 URL은 TTL 60초/45초 갱신/gcTime 0이다. 브라우저·기기 검증은 보류다. 근거: `docs/BRANDS_VALIDATION.md`.
