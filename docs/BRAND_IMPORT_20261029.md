# 요청 브랜드 10개 등록 — 2026-10-29

현재 앱이 연결된 로컬 Supabase의 실사용 계정에 아래 브랜드를 등록했다. 기존 rough side / union blue와 로고는 그대로 보존했으며 활성 브랜드는 총 12개다.

| 요청 이름 | 등록 영문명 | 공식 출처 | 로고 원본 |
| --- | --- | --- | --- |
| 아트이프액츠 | ART IF ACTS | https://artifacts.co.kr/ | 공식 헤더 PNG |
| 포터리 | POTTERY | https://ptry.co.kr/ | 공식 헤더 SVG |
| 블랭크룸 | BLANKROOM | https://blankroom.co.kr/ | 공식 공유 이미지의 로고 |
| 비헤비어 | BEHEAVYER | https://beheavyer.com/ | 공식 헤더 SVG |
| 브라운야드 | BROWNYARD | https://www.brownyard.co.kr/ | 공식 헤더 SVG |
| 카키스 | KHAKIS | https://khakis2020.com/ | 공식 Apple touch icon의 K 심볼 |
| 브랜디드 | BRANDED | https://brandedmall.co.kr/ | 공식 헤더 PNG |
| 어나더오피스 | ANOTHER OFFICE | https://www.anotheroffice.co.kr/ | 공식 공유 이미지의 로고 |
| 벨리에 | BÉLIER | https://belier.co.kr/ | 공식 헤더 SVG |
| 고낙 | GONAK | https://www.gonak.co.kr/ | 공식 Apple touch icon의 G 심볼 |

로고는 원본 글자와 형태를 유지해 512×512 PNG로 준비했다. 벡터는 래스터화하고 바깥 여백을 정리한 뒤 비율을 유지해 정사각형 안에 배치했다. 앱의 cover 표시에서도 글자가 잘리지 않는다. AI로 로고를 새로 그리거나 임의 글꼴로 대체하지 않았다.

등록 시 단일 실사용 계정과 앱의 loopback API 연결을 확인했다. DB 쓰기는 해당 계정의 authenticated 역할로 기존 save_brand / set_brand_image RPC를 호출했고, 이미지는 본인 brand-private 경로에 저장했다. 이름/로고 URL만으로 전체 계정에 공통 데이터를 추가하는 migration은 만들지 않았다.

10개 모두 브랜드 행과 image_path를 재조회하고 Storage 파일을 다시 다운로드해 업로드한 PNG와 SHA-256/바이트가 일치함을 확인했다. 기존 2개 브랜드 행과 이미지 참조가 유지됨도 확인했다. 확인용 파일·소스 URL·작업 계획은 Git에서 제외하는 test-results/brand-import에 보관했다. 이미지나 DB의 개인 계정 값, 서버 키는 공개 번들에 추가하지 않았다.

이 작업의 데이터는 현재 로컬 DB·Storage에 저장된다. 다른 PC에서 같은 데이터를 사용하려면 동일한 Supabase를 연결하거나 별도의 데이터 이전이 필요하다.
