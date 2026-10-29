const palette: readonly (readonly [string, readonly string[]])[] = [
  ['#000000', ['black', '블랙', '검정', '검정색', '검은색', '흑색']],
  ['#FFFFFF', ['white', '화이트', '흰색', '하양', '하얀색', '백색']],
  ['#FFFFF0', ['ivory', '아이보리']],
  ['#FAF9F6', ['off white', '오프화이트']],
  ['#FFFDD0', ['cream', '크림', '크림색']],
  ['#D8C3A5', ['beige', '베이지']],
  ['#C2B280', ['ecru', '에크루']],
  ['#808080', ['gray', 'grey', '그레이', '회색']],
  ['#D3D3D3', ['light gray', 'light grey', '라이트그레이', '밝은회색', '연회색']],
  ['#555555', ['dark gray', 'dark grey', '다크그레이', '진회색', '짙은회색']],
  ['#36454F', ['charcoal', 'charcoal gray', 'charcoal grey', '차콜', '차콜그레이']],
  ['#C0C0C0', ['silver', '실버', '은색']],
  ['#0000FF', ['blue', '블루', '파랑', '파란색', '청색']],
  ['#ADD8E6', ['light blue', '라이트블루', '연파랑', '연한파랑', '연청']],
  ['#87CEEB', ['sky blue', '스카이블루', '하늘색']],
  ['#00008B', ['dark blue', '다크블루', '진파랑', '진청']],
  ['#000080', ['navy', 'navy blue', '네이비', '남색', '곤색']],
  ['#00004D', ['dark navy', '다크네이비']],
  ['#6F8FAF', ['denim', 'denim blue', '데님', '데님블루']],
  ['#4B0082', ['indigo', '인디고']],
  ['#FF0000', ['red', '레드', '빨강', '빨간색', '적색']],
  ['#800020', ['burgundy', '버건디', 'wine', '와인', '와인색']],
  ['#800000', ['maroon', '마룬']],
  ['#FFC0CB', ['pink', '핑크', '분홍', '분홍색']],
  ['#FFB6C1', ['light pink', '라이트핑크', '연분홍']],
  ['#FF69B4', ['hot pink', '핫핑크']],
  ['#FF7F50', ['coral', '코랄']],
  ['#FFA500', ['orange', '오렌지', '주황', '주황색']],
  ['#FFFF00', ['yellow', '옐로우', '노랑', '노란색']],
  ['#D4A017', ['mustard', '머스타드', '겨자색']],
  ['#D4AF37', ['gold', '골드', '금색']],
  ['#008000', ['green', '그린', '초록', '초록색', '녹색']],
  ['#90EE90', ['light green', '라이트그린', '연두', '연두색']],
  ['#006400', ['dark green', '다크그린', '짙은초록']],
  ['#808000', ['olive', 'olive green', '올리브', '올리브그린']],
  ['#8B864E', ['khaki', '카키']],
  ['#A8C3A0', ['sage', 'sage green', '세이지', '세이지그린']],
  ['#98FF98', ['mint', 'mint green', '민트', '민트색']],
  ['#008080', ['teal', '틸', '청록', '청록색']],
  ['#40E0D0', ['turquoise', '터쿼이즈']],
  ['#800080', ['purple', '퍼플', '보라', '보라색']],
  ['#E6E6FA', ['lavender', '라벤더', '연보라']],
  ['#8B5E3C', ['brown', '브라운', '갈색']],
  ['#5C4033', ['dark brown', '다크브라운', '진갈색']],
  ['#B58B61', ['light brown', '라이트브라운', '연갈색']],
  ['#C19A6B', ['camel', '카멜']],
  ['#D2B48C', ['tan', '탠']],
  ['#8B7D6B', ['taupe', '토프']],
];

function normalizedName(value: string) {
  return value.normalize('NFKC').trim().toLowerCase().replace(/[\s_\-\u2010-\u2015]+/g, '');
}
const namedColors = new Map(palette.flatMap(([hex, names]) => names.map((name) => [normalizedName(name), hex] as const)));
const hexPattern = /^#[0-9a-f]{6}$/i;

// An explicit garment color is authoritative. Names only supply a display
// fallback for existing records with no code; never infer colors from photos.
export function wardrobeSwatchColor(name: string | null | undefined, hex?: string | null): string | null {
  const explicit = hex?.trim();
  if (explicit && hexPattern.test(explicit)) return explicit;
  const label = name?.normalize('NFKC').trim();
  if (!label) return null;
  if (hexPattern.test(label)) return label;
  return namedColors.get(normalizedName(label)) ?? null;
}
