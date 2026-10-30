import type { IconName } from '@/components/ui/Icon';

export const guideCategories = [
  { id: 'basics', label: '코디 기본기', description: '레이어드 · 비율 · 실루엣', icon: 'shirt' },
  { id: 'colors', label: '색상 이론', description: '톤온톤 · 톤인톤 · 배색', icon: 'palette' },
  { id: 'fit', label: '사이즈·핏', description: '어깨너비 · 총장 · 밑위', icon: 'trousers' },
  { id: 'clothing-care', label: '의류 관리', description: '세탁 · 건조 · 보관', icon: 'hanger' },
  { id: 'shoe-care', label: '신발 관리', description: '가죽 · 스웨이드 · 운동화', icon: 'shoe' },
  { id: 'materials', label: '소재 지식', description: '코튼 · 울 · 데님 · 나일론 · 가죽', icon: 'layers' },
] as const satisfies readonly { id: string; label: string; description: string; icon: IconName }[];
export type GuideCategory = typeof guideCategories[number]['id'];
type Source = { label: string; url: string };
export type Guide = {
  slug: string; category: GuideCategory; title: string; summary: string;
  steps: readonly string[]; example: string; tags: readonly string[];
  source?: Source; swatches?: readonly string[];
};
const sources = {
  color: { label: 'Adobe · 색상 조화 도구', url: 'https://color.adobe.com/create/color-wheel' },
  size: { label: 'UNIQLO · 의류 치수 측정 안내', url: 'https://faq-th.uniqlo.com/articles/en_US/Knowledge/About-how-to-measure' },
  label: { label: 'GINETEX · 세탁 기호 안내', url: 'https://www.ginetex.net/GB/labelling/care-symbols.asp' },
  wool: { label: 'Woolmark · 울 관리 안내', url: 'https://www.woolmark.com/care/' },
  denim: { label: 'Levi’s · 데님 세탁과 관리', url: 'https://help.levi.com/hc/en-us/articles/15463553339917-Denim-care-and-washing' },
  shoe: { label: 'Nike · 신발 세척 안내', url: 'https://www.nike.com/a/how-to-clean-shoes' },
  suede: { label: 'Nike · 스웨이드 관리 안내', url: 'https://www.nike.com/a/how-to-clean-suede-shoes' },
  fabric: { label: 'REI · 소재와 레이어링 안내', url: 'https://www.rei.com/learn/expert-advice/backpacking-clothes.html' },
} satisfies Record<string, Source>;

// Styling examples are CLOSET editorial suggestions; care/measurement references are linked per article.
export const guides: readonly Guide[] = [
  { slug: 'layering', category: 'basics', title: '겹쳐 입어도 답답하지 않은 레이어드', summary: '두께와 길이를 조금씩 바꿔 자연스러운 층을 만들어 보세요.', steps: ['몸에 닿는 옷은 얇게, 바깥 옷은 여유 있게 골라 움직임을 확인해요.', '셔츠 밑단이나 티셔츠 목선 중 한 곳만 살짝 드러내 보세요.', '색과 무늬를 동시에 많이 늘리기보다 하나씩 더해 보세요.'], example: '화이트 티셔츠 + 블루 셔츠 + 네이비 재킷. 실내에서는 재킷을 벗어도 조합이 이어져요.', tags: ['레이어드', '셔츠', '재킷'] },
  { slug: 'proportions', category: 'basics', title: '상하의 비율은 밑단에서 시작해요', summary: '같은 옷도 상의 끝이 어디에 오는지에 따라 인상이 달라져요.', steps: ['거울에서 상의 밑단과 바지 허리선의 위치를 함께 살펴요.', '긴 상의는 앞부분만 넣은 모습과 꺼낸 모습을 비교해 보세요.', '정해진 비율보다 앉거나 걸을 때의 편안함을 먼저 확인해요.'], example: '와이드 팬츠에 짧은 재킷을 입거나, 긴 셔츠의 앞단을 살짝 넣어 허리선을 드러내 보세요.', tags: ['비율', '총장', '밑단'] },
  { slug: 'silhouette', category: 'basics', title: '실루엣과 핏, 한 곳에 여유 주기', summary: '전체를 크게 입기 전, 상의나 하의 한쪽부터 바꿔 보세요.', steps: ['상의와 하의의 폭을 따로 살피고 원하는 분위기를 정해요.', '상의가 넉넉하면 곧게 떨어지는 하의부터 조합해 보세요.', '어깨·팔·허벅지가 당기지 않는지 움직이며 확인해요.'], example: '여유 있는 니트 + 스트레이트 데님 + 단정한 신발. 서로 다른 폭을 비교하며 취향을 찾아보세요.', tags: ['실루엣', '핏', '와이드'] },
  { slug: 'tone-on-tone', category: 'colors', title: '톤온톤: 같은 색, 다른 밝기', summary: '비슷한 색상 안에서 밝기와 깊이를 달리하는 조합이에요.', steps: ['주인공 색상을 하나 정하고 밝은 색과 어두운 색을 짝지어요.', '소재의 결이나 광택을 달리하면 같은 계열도 구분되어 보여요.', '신발이나 가방은 무채색으로 마무리해 보세요.'], example: '라이트 블루 셔츠 + 네이비 팬츠. 색의 차이가 작다면 소재감을 바꿔 보세요.', tags: ['톤온톤', '명도', '네이비'], source: sources.color, swatches: ['#B8D1E4', '#647D9B', '#22314C'] },
  { slug: 'tone-in-tone', category: 'colors', title: '톤인톤: 다른 색, 비슷한 분위기', summary: '색상이 달라도 밝기와 선명도가 비슷하면 부드럽게 이어져요.', steps: ['선명한 색끼리, 차분한 색끼리 먼저 묶어 보세요.', '상의와 하의 사진을 나란히 놓고 한쪽만 너무 튀는지 살펴요.', '완전히 같은 톤을 찾기보다 편안하게 느껴지는 조합부터 저장해요.'], example: '세이지 그린 상의 + 차분한 베이지 하의. 화면과 실제 옷의 색은 다를 수 있어 자연광에서도 확인해요.', tags: ['톤인톤', '채도', '세이지'], swatches: ['#A7B39B', '#C4B59E', '#B1A8AA'] },
  { slug: 'color-balance', category: 'colors', title: '보색과 포인트 컬러의 균형', summary: '색상환의 반대편 색은 작은 면적으로 먼저 시도해 보세요.', steps: ['보색은 대비가 크므로 한쪽을 가방이나 양말에 작게 써 보세요.', '옷의 큰 면적에는 익숙한 기본색을 두면 조합하기 편해요.', '따뜻한 색과 차가운 색의 조합도 실제 옷을 놓고 비교해요.'], example: '블루 셔츠 + 차콜 팬츠에 차분한 오렌지 소품. 배색 비율은 규칙보다 취향에 맞춰 조절하세요.', tags: ['보색', '배색', '웜톤', '쿨톤'], source: sources.color, swatches: ['#355B85', '#D79257', '#444850'] },
  { slug: 'shoulder-chest', category: 'fit', title: '어깨너비와 가슴단면 비교하기', summary: '잘 맞는 옷 한 벌을 기준으로 실측을 비교해 보세요.', steps: ['옷을 평평하게 놓고 판매자의 측정 위치와 같은 곳을 재요.', '어깨 봉제선 사이와 겨드랑이 아래 가슴단면을 기록해요.', '드롭 숄더처럼 설계가 다른 옷은 숫자와 착용 사진을 함께 봐요.'], example: '잘 맞는 셔츠의 실측을 메모해 두면 새 셔츠의 사이즈 표와 비교하기 쉬워요.', tags: ['어깨너비', '가슴단면', '실측'], source: sources.size },
  { slug: 'length-rise', category: 'fit', title: '총장·밑위·인심 구분하기', summary: '바지 길이 하나만으로 착용 위치를 판단하기 어려워요.', steps: ['상의 총장은 시작 지점이 브랜드마다 다를 수 있어 도식을 확인해요.', '바지는 밑위와 안쪽 다리 길이인 인심을 구분해요.', '허리에 걸치는 위치와 신발을 함께 정한 뒤 밑단을 살펴요.'], example: '소유한 바지의 허리단면·밑위·인심을 함께 기록하고, 새 바지의 같은 치수와 비교해요.', tags: ['총장', '밑위', '인심', '바지'], source: sources.size },
  { slug: 'trouser-fit', category: 'fit', title: '바지 실루엣과 신발 맞추기', summary: '허벅지부터 밑단까지 이어지는 선을 확인해 보세요.', steps: ['테이퍼드는 아래로 좁아지고, 스트레이트는 비교적 곧게 떨어져요.', '와이드 팬츠는 폭뿐 아니라 밑단이 신발을 얼마나 덮는지도 살펴요.', '앉았을 때 허리와 허벅지가 편한지 먼저 확인해요.'], example: '같은 팬츠를 스니커즈와 로퍼에 각각 입고 밑단 접힘을 비교해 보세요.', tags: ['테이퍼드', '스트레이트', '바지 실루엣'] },
  { slug: 'care-label', category: 'clothing-care', title: '세탁 전, 케어 라벨부터', summary: '소재 이름보다 해당 제품의 취급 표시를 먼저 확인하세요.', steps: ['세탁통은 물세탁, 삼각형은 표백, 사각형은 건조 안내예요.', '표시된 온도와 금지 기호를 확인하고 허용 범위를 넘기지 않아요.', '색상과 오염 정도를 나누고 주머니를 비운 뒤 세탁해요.'], example: '같은 코튼이라도 안감·프린트·가공에 따라 세탁법이 다를 수 있어요. 라벨이 없으면 제조사에 확인하세요.', tags: ['세탁', '라벨', '기호'], source: sources.label },
  { slug: 'drying', category: 'clothing-care', title: '건조 방식이 옷의 형태를 바꿔요', summary: '건조기 사용 가능 여부와 자연건조 표시를 구분해요.', steps: ['사각형 안 원은 회전식 건조 안내예요. 금지 표시면 건조기를 피하세요.', '눕혀 말리기·걸어 말리기·그늘 표시가 있는지 확인해요.', '니트는 젖은 무게로 늘어날 수 있으니 라벨에 맞춰 형태를 잡아요.'], example: '세탁이 끝난 니트를 무조건 옷걸이에 걸기 전에, 평평하게 건조하라는 표시가 있는지 확인하세요.', tags: ['건조', '건조기', '니트'], source: sources.label },
  { slug: 'storage', category: 'clothing-care', title: '계절이 바뀔 때 보관 체크', summary: '오염과 습기를 남기지 않고 옷의 무게에 맞게 보관해요.', steps: ['제품 안내에 맞게 세탁한 뒤 완전히 말려 보관해요.', '무거운 니트는 접고, 형태를 지켜야 하는 재킷은 알맞은 옷걸이를 써요.', '보관 공간에 여유를 두고 주기적으로 습기와 오염을 확인해요.'], example: '울 니트는 깨끗하게 말린 뒤 접어 보관하고, 방충 제품은 사용 설명서에 따라 사용해요.', tags: ['보관', '울', '니트'], source: sources.wool },
  { slug: 'leather-shoes', category: 'shoe-care', title: '가죽 신발, 표면부터 살펴요', summary: '매끈한 가죽과 특수 가공 가죽은 관리법이 달라요.', steps: ['부드러운 솔이나 천으로 표면의 마른 먼지를 먼저 제거해요.', '관리제는 해당 가죽에 사용 가능한지 확인하고 눈에 띄지 않는 곳에 시험해요.', '물에 담그거나 열로 급히 말리지 말고 제조사 안내를 따라요.'], example: '에나멜·코팅·스웨이드는 일반 가죽 크림을 바로 바르지 마세요. 소재에 맞는 관리 제품을 확인하세요.', tags: ['가죽', '구두', '로퍼'], source: sources.shoe },
  { slug: 'suede-shoes', category: 'shoe-care', title: '스웨이드는 마른 상태에서 부드럽게', summary: '물로 씻기 전에 전용 솔로 결을 정리해 보세요.', steps: ['완전히 마른 상태에서 전용 솔로 가볍게 먼지를 털어요.', '오염을 강하게 문지르기보다 눈에 띄지 않는 부분에서 먼저 시험해요.', '물세탁이나 일반 비누 사용은 피하고 전용 관리 안내를 확인해요.'], example: '젖은 신발은 열을 피해 자연 건조한 뒤 관리하세요. 오래된 얼룩은 전문 업체에 상담하는 편이 좋아요.', tags: ['스웨이드', '솔', '얼룩'], source: sources.suede },
  { slug: 'sneaker-cleaning', category: 'shoe-care', title: '운동화 세척, 부분별로 나누기', summary: '밑창과 갑피를 나누고 소재에 맞는 방법을 선택해요.', steps: ['마른 먼지를 턴 뒤 분리 가능한 끈은 따로 관리해요.', '제조사가 허용한 경우에만 순한 세정액과 부드러운 솔로 닦아요.', '세제를 닦아 내고 통풍되는 곳에서 충분히 자연 건조해요.'], example: '메시·가죽·접착 부위의 관리법이 다를 수 있어요. 세탁기에 넣기 전 해당 모델의 취급 안내부터 확인하세요.', tags: ['운동화', '세척', '스니커즈'], source: sources.shoe },
  { slug: 'cotton', category: 'materials', title: '코튼: 같은 면이어도 다른 촉감', summary: '원단 두께·조직·가공에 따라 착용감이 달라져요.', steps: ['소재 혼용률과 원단의 두께를 함께 확인해요.', '면은 수분을 흡수하고 젖으면 마르는 데 시간이 걸릴 수 있어요.', '수축과 프린트 손상을 줄이려면 제품별 세탁·건조 안내를 따라요.'], example: '얇은 코튼 티셔츠와 탄탄한 옥스퍼드 셔츠를 만져 보면 같은 면의 차이를 느낄 수 있어요.', tags: ['코튼', '면', '흡수'], source: sources.fabric },
  { slug: 'wool', category: 'materials', title: '울: 니트의 형태 지키기', summary: '울이라고 모두 손세탁하는 것은 아니에요.', steps: ['머신 워셔블 등 제품의 세탁 가능 표시를 먼저 확인해요.', '허용된 세탁법과 세제를 사용하고 과한 마찰을 피해요.', '건조 안내를 지키고 충분히 말린 다음 접어 보관해요.'], example: '니트의 보풀을 세게 잡아 뜯지 말고, 제품에 맞는 관리 도구를 조심스럽게 사용하세요.', tags: ['울', '양모', '니트', '보풀'], source: sources.wool },
  { slug: 'denim', category: 'materials', title: '데님: 색과 형태를 오래 유지하기', summary: '뒤집어 세탁하고 제품별 관리 안내를 확인해요.', steps: ['세탁이 필요할 때 라벨에 맞춰 찬물 세탁을 고려해요.', '다른 옷으로 물이 들지 않도록 색상을 나누고 뒤집어 세탁해요.', '형태를 정리해 그늘에서 건조하되 제품의 지시가 우선이에요.'], example: '진한 생지 데님은 밝은 가방·신발과 마찰할 때도 이염될 수 있으니 제품 안내를 살펴보세요.', tags: ['데님', '청바지', '이염'], source: sources.denim },
  { slug: 'nylon', category: 'materials', title: '나일론: 혼용률과 기능 구분하기', summary: '합성섬유라는 이름만으로 방수 성능을 알 수는 없어요.', steps: ['나일론 등 합성섬유는 가볍고 비교적 빨리 마르는 의류에 쓰여요.', '방수·발수 성능은 코팅과 구조에 따라 달라 제품 설명을 확인해요.', '열과 관리제의 영향은 가공마다 다르므로 라벨을 따라요.'], example: '얇은 나일론 재킷이 모두 우비 역할을 하지는 않아요. 사용할 상황과 제품의 기능을 함께 확인하세요.', tags: ['나일론', '합성섬유', '발수'], source: sources.fabric },
  { slug: 'leather', category: 'materials', title: '가죽: 표면 가공부터 구분하기', summary: '천연·합성 여부와 표면의 결을 먼저 살펴요.', steps: ['매끈한 가죽, 스웨이드, 코팅 가죽의 관리 방법을 구분해요.', '가죽 의류에는 신발용 관리제를 임의로 사용하지 않아요.', '세탁과 얼룩 제거는 의류 제조사 또는 가죽 전문 업체에 확인해요.'], example: '새 가죽 재킷을 등록할 때 소재와 관리 안내를 메모해 두면 계절이 바뀔 때 다시 찾기 편해요.', tags: ['가죽', '레더', '코팅'] },
];

export function getGuide(slug: string | undefined) { return guides.find(guide => guide.slug === slug); }
function normalize(value: string) { return value.normalize('NFKC').toLocaleLowerCase('ko-KR').trim(); }
export function filterGuides(query: string, category: GuideCategory | 'all' = 'all') {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  return guides.filter(guide => {
    if (category !== 'all' && guide.category !== category) return false;
    const categoryName = guideCategories.find(item => item.id === guide.category)?.label;
    const content = normalize([guide.title, guide.summary, guide.example, categoryName, ...guide.steps, ...guide.tags].join(' '));
    return terms.every(term => content.includes(term));
  });
}
export function relatedGuides(guide: Guide) { return guides.filter(item => item.category === guide.category && item.slug !== guide.slug).slice(0, 3); }
