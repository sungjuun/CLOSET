import { colorOf, describePair, pairSchema, type ColorPair } from './finder';

export function artworkBackground(hex: string) {
  return '#' + [1, 3, 5].map((start) => Math.round(parseInt(hex.slice(start, start + 2), 16) * 0.22 + 250 * 0.78).toString(16).padStart(2, '0')).join('');
}
const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

export function outfitArtwork(pair: ColorPair, exportCard = false) {
  pairSchema.parse(pair);
  const top = colorOf(pair.top); const bottom = colorOf(pair.bottom);
  const background = artworkBackground(top.hex);
  const footer = exportCard ? `<rect x="0" y="640" width="480" height="160" fill="#FFFFFF"/><text x="28" y="680" font-size="23" font-weight="700" fill="#222530">${escape(describePair(pair).title)}</text><text x="28" y="713" font-size="15" fill="#5D6370">${escape(top.label)} 상의 / ${escape(bottom.label)} 하의</text><rect x="28" y="736" width="16" height="16" rx="4" fill="${top.hex}" stroke="#AEB2B8"/><text x="52" y="750" font-size="13" fill="#5D6370">${top.hex}</text><rect x="180" y="736" width="16" height="16" rx="4" fill="${bottom.hex}" stroke="#AEB2B8"/><text x="204" y="750" font-size="13" fill="#5D6370">${bottom.hex}</text><text x="28" y="782" font-size="11" letter-spacing="2" fill="#737A87">CLOSET / THE COLOR FINDER</text>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="${exportCard ? 800 : 640}" viewBox="0 0 480 ${exportCard ? 800 : 640}" font-family="sans-serif">
    <rect width="480" height="640" fill="${background}"/>
    <text x="30" y="40" fill="#4B5456" font-size="10" letter-spacing="3">THE COLOR FINDER</text>
    <ellipse cx="248" cy="558" rx="164" ry="19" fill="#263238" opacity="0.055"/>
    <g transform="translate(260 275) rotate(8 80 150)" stroke="#334044" stroke-opacity="0.3" stroke-width="1.2" stroke-linejoin="round">
      <path d="M0 0H160L151 305H87L79 112L65 305H0Z" fill="${bottom.hex}"/>
      <path d="M1 15H158M76 16L78 104M10 290L65 292M87 292H151M26 19Q28 56 8 65M140 18Q137 54 153 64M37 18L28 283M117 18L115 283" fill="none" stroke-opacity="0.18"/>
      <path d="M18 0V14M58 0V14M103 0V14M143 0V14" fill="none"/>
      <circle cx="83" cy="8" r="2" fill="#334044" fill-opacity="0.35" stroke="none"/>
    </g>
    <g transform="translate(84 142) rotate(-9 110 140)" stroke="#334044" stroke-opacity="0.32" stroke-width="1.4" stroke-linejoin="round">
      <path d="M50 0Q110 25 170 0L213 19L258 110L217 135L195 91L190 288Q110 309 29 288L25 91L5 135L-35 110L5 19Z" fill="${top.hex}"/>
      <path d="M50 0Q58 52 110 51Q163 51 170 0M61 3Q67 37 110 38Q153 38 159 3M5 19L25 91M213 19L195 91M-30 100L10 123M221 124L252 103M31 275Q110 294 189 275M41 96L43 271M177 96L176 271" fill="none" stroke-opacity="0.22"/>
      <path d="M5 21L25 91L29 288L42 290L39 95L23 26Z" fill="#263238" fill-opacity="0.04" stroke="none"/>
    </g>
    <g transform="translate(70 516) rotate(-8)" stroke="#737A70" stroke-width="1.1" stroke-linejoin="round">
      <path d="M0 15Q4 0 25 1Q36 1 39 18L46 30L85 48Q99 53 96 62Q49 78 3 68Z" fill="#F8F7EF"/>
      <path d="M3 59Q42 65 96 53M11 19L36 21M12 27L40 29M13 35L42 37" fill="none"/>
    </g>
    ${footer}
  </svg>`;
}
