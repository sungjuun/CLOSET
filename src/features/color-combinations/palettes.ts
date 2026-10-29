// These are illustrative fabric tones, independent of saved garment colors.
export const guideColors = {
  navy: { label: '네이비', hex: '#202D4A' },
  black: { label: '블랙', hex: '#252525' },
  gray: { label: '그레이', hex: '#8E9198' },
  beige: { label: '베이지', hex: '#D3BDA0' },
  brown: { label: '브라운', hex: '#735744' },
  khaki: { label: '카키', hex: '#73795B' },
  white: { label: '화이트', hex: '#F8F7F2' },
  offWhite: { label: '오프화이트', hex: '#F0EDE5' },
  denim: { label: '데님 블루', hex: '#7892AD' },
} as const;

export const baseColorIds = ['navy', 'black', 'gray', 'beige', 'brown', 'khaki', 'white'] as const;
export type BaseColorId = typeof baseColorIds[number];
type Pairing = { color: keyof typeof guideColors; description: string };

export const colorPairings = {
  navy: [
    { color: 'offWhite', description: '밝고 깔끔한 대비' },
    { color: 'beige', description: '차분한 클래식' },
    { color: 'gray', description: '절제된 미니멀' },
    { color: 'brown', description: '따뜻한 깊이' },
  ],
  black: [
    { color: 'white', description: '선명하고 단정한 대비' },
    { color: 'gray', description: '차분한 모노톤' },
    { color: 'beige', description: '부드러운 균형' },
    { color: 'khaki', description: '담백한 캐주얼' },
  ],
  gray: [
    { color: 'navy', description: '정돈된 도시적 분위기' },
    { color: 'white', description: '가볍고 깨끗한 인상' },
    { color: 'black', description: '간결한 모노톤' },
    { color: 'beige', description: '은은하고 부드러운 조화' },
  ],
  beige: [
    { color: 'navy', description: '차분하고 단정한 조합' },
    { color: 'white', description: '밝고 편안한 분위기' },
    { color: 'brown', description: '자연스러운 톤온톤' },
    { color: 'khaki', description: '담백한 어스 컬러' },
  ],
  brown: [
    { color: 'offWhite', description: '포근하고 부드러운 대비' },
    { color: 'beige', description: '따뜻한 톤온톤' },
    { color: 'navy', description: '깊이 있는 클래식' },
    { color: 'denim', description: '편안한 데일리 캐주얼' },
  ],
  khaki: [
    { color: 'offWhite', description: '산뜻하고 자연스러운 대비' },
    { color: 'black', description: '차분한 워크웨어 분위기' },
    { color: 'beige', description: '편안한 어스 컬러' },
    { color: 'navy', description: '담백하고 안정적인 조합' },
  ],
  white: [
    { color: 'navy', description: '산뜻하고 단정한 대비' },
    { color: 'black', description: '또렷한 모노톤' },
    { color: 'beige', description: '밝고 부드러운 분위기' },
    { color: 'denim', description: '가벼운 데일리 캐주얼' },
  ],
} as const satisfies Record<BaseColorId, readonly Pairing[]>;
