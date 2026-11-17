// Inline SVG icons, one per skill and fusion. 24x24, stroked with currentColor.

const HEART = 'M0 .42C-.62-.02-.5-.46-.24-.46-.1-.46 0-.36 0-.24 0-.36.1-.46.24-.46.5-.46.62-.02 0 .42Z';
const heart = (cx, cy, s, fill = false) =>
  `<path transform="translate(${cx} ${cy}) scale(${s})" d="${HEART}" vector-effect="non-scaling-stroke"${fill ? ' fill="currentColor" fill-opacity=".35"' : ''}/>`;
const p = (d) => `<path d="${d}"/>`;
const c = (cx, cy, r, extra = '') => `<circle cx="${cx}" cy="${cy}" r="${r}" ${extra}/>`;
const STAR = 'M15 3.5l1.6 3.6 3.9.4-2.9 2.7.8 3.8-3.4-2-3.4 2 .8-3.8-2.9-2.7 3.9-.4z';

const ICONS = {
  twin: heart(8, 12, 9, true) + heart(16, 12, 9, true),
  homing: heart(7, 17, 8, true) + p('M10 13Q14 12 15 9') + c(17.5, 6.5, 3) + c(17.5, 6.5, 0.6),
  rate: heart(15.5, 12, 12, true) + p('M2 8.5h6M1 12h5M2 15.5h6'),
  pierce: p('M2 12h19M17 7.5l4.5 4.5-4.5 4.5M10 5v14M6 7v10'),
  burst: c(12, 12, 3.2, 'fill="currentColor" fill-opacity=".35"') + p('M12 2v4M12 18v4M2 12h4M18 12h4M5 5l2.8 2.8M16.2 16.2L19 19M19 5l-2.8 2.8M7.8 16.2L5 19'),
  burn: `<path d="M12 2.5c1.5 4.5 6 6 6 11a6 6 0 01-12 0c0-3 2-4.2 3-7 .8 1.8 2.2 1.6 3-4z" fill="currentColor" fill-opacity=".3"/>` + p('M12 20a2.6 2.6 0 002.6-2.6c0-1.6-1.4-2-2.6-4-1.2 2-2.6 2.4-2.6 4A2.6 2.6 0 0012 20z'),
  chill: p('M12 2v20M3.3 7l17.4 10M20.7 7L3.3 17M9.5 3.5L12 6l2.5-2.5M9.5 20.5L12 18l2.5 2.5'),
  chain: `<path d="M13.5 2L5 13.5h6L9.5 22 19 10h-6z" fill="currentColor" fill-opacity=".3"/>`,
  bounce: p('M2.5 6L9 17l5.5-8.5 4.5 7M15.5 16.5l3.8-.6-.6-3.9'),
  split: heart(12, 12.5, 18, true) + p('M12 7.2l-2.2 3.6 3.6 2.6-2.2 4.6'),
  pulse: c(12, 12, 2.6, 'fill="currentColor" fill-opacity=".5"') + c(12, 12, 6.2) + c(12, 12, 10, 'stroke-dasharray="3 2.4"'),
  orbit: c(12, 12, 8.5, 'stroke-dasharray="2 2.6"') + heart(12, 3.8, 6, true) + heart(4.6, 16.2, 6, true) + heart(19.4, 16.2, 6, true),
  charm: heart(12, 12.5, 16, true) + p('M3 21L21 3M16 3h5v5M3 21l1.2-4M3 21l4-1.2'),
  drones: heart(12, 13, 9, true) + p('M9 11C7 5.5 2.5 6.5 2.5 11c0 1.6 2 2 4 1.4M15 11c2-5.500 6.500-4.500 6.500 0 0 1.6-2 2-4 1.4'),
  well: p('M12 12a1.600 1.600 0 111.600 1.600A3.500 3.500 0 1112 8.500a6 6 0 11-6 6A8.500 8.500 0 0112 3.500'),
  magnet: `<path d="M6 4v8a6 6 0 0012 0V4h-4v8a2 2 0 01-4 0V4z" fill="currentColor" fill-opacity=".3"/>` + p('M6 7.500h4M14 7.500h4'),
  shield: p('M12 2.5l8 3v6c0 5-3.500 8.300-8 10-4.500-1.700-8-5-8-10v-6z') + heart(12, 11.5, 9, true),
  dash: p('M4 6l6 6-6 6M11 6l6 6-6 6M18.500 9l3 3-3 3'),
  hp: heart(12, 12.5, 19, true) + p('M12 8.500v6M9 11.500h6'),
  steal: heart(12, 9.5, 14, true) + p('M12 15v6.500M9 19l3 3 3-3'),
  crit: c(12, 12, 7) + c(12, 12, 1.4, 'fill="currentColor"') + p('M12 2v5M12 17v5M2 12h5M17 12h5'),
  dmg: p('M5 20l7-7 7 7M5 14l7-7 7 7M8 6.500l4-4 4 4'),
  speed: `<path d="M4 19C5 9 13 4 20.500 3.500 20 11 15.500 19 6 19" fill="currentColor" fill-opacity=".3"/>` + p('M3 21.500L13 11M8 14h4M10.500 10.500h4'),
  stars: `<path d="${STAR}" fill="currentColor" fill-opacity=".35"/>` + p('M3 21.500l6.500-6.500M3.500 15l3-3M9.500 21l3-3'),

  heartstorm: heart(12, 6.5, 8, true) + heart(6, 16.5, 8, true) + heart(18, 16.5, 8, true) + p('M12 12a3.500 3.500 0 010 .1') + c(12, 12.8, 1.2, 'fill="currentColor"'),
  lovebeam: heart(6.5, 12, 10, true) + p('M12 12h10.500M12.500 8h9M12.500 16h9'),
  supernova: c(12, 12, 4, 'fill="currentColor" fill-opacity=".45"') + p('M12 1v5M12 18v5M1 12h5M18 12h5M4.200 4.200l3.500 3.500M16.300 16.300l3.500 3.500M19.800 4.200l-3.500 3.500M7.700 16.300l-3.500 3.500') + c(12, 12, 8, 'stroke-dasharray="1.500 3"'),
  absolutezero: p('M12 2v20M3.300 7l17.400 10M20.700 7L3.300 17') + `<path d="M13 7l-4 5.500h3l-1 4.500 4-5.500h-3z" fill="currentColor"/>`,
  kaleidoscope: p('M12 2l8.700 5v10L12 22l-8.700-5V7zM12 2v20M3.300 7l17.400 10M20.700 7L3.300 17') + c(12, 12, 3, 'fill="currentColor" fill-opacity=".4"'),
  pulsar: c(12, 12, 3, 'fill="currentColor" fill-opacity=".5"') + c(12, 12, 7, 'stroke-dasharray="2.500 2"') + p('M2 22L8.500 15.500M15.500 8.500L22 2M2 2l6.500 6.500M15.500 15.500L22 22'),
  entourage: heart(12, 8.5, 11, true) + heart(5.5, 17.5, 7) + heart(18.5, 17.5, 7) + p('M8.500 6.500C7 3 3.500 4 3.500 7M15.500 6.500C17 3 20.500 4 20.500 7'),
  eventhorizon: c(12, 12, 4, 'fill="currentColor" fill-opacity=".7"') + `<ellipse cx="12" cy="12" rx="10.500" ry="4" transform="rotate(-20 12 12)"/>` + c(12, 12, 7, 'stroke-dasharray="2 2.500"'),
  comet: heart(16, 8, 11, true) + p('M11 12L2.500 20.500M13.500 14.500L8 20M9 9.500L3.500 15'),
  bleedingheart: heart(12, 8.5, 15, true) + p('M8 16.500v3M12 17.500v4.500M16 16.500v3'),
  heartstopper: heart(12, 12.5, 12, true) + c(12, 12, 9.5) + p('M12 1v4M12 19v4M1 12h4M19 12h4'),
  stardust: `<path d="${STAR}" fill="currentColor" fill-opacity=".4"/>` + p('M2 20c3-3 4 2 7-1s1-4 4-5') + c(4, 14, 0.8, 'fill="currentColor"') + c(9, 22, 0.8, 'fill="currentColor"') + c(19, 18, 0.8, 'fill="currentColor"'),
};

export function icon(id, size = 24) {
  const body = ICONS[id] || c(12, 12, 8);
  return `<svg class="icon" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export const heartSvg = (cls) =>
  `<svg class="hp ${cls}" viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path transform="translate(12 12.500) scale(21)" d="${HEART}" vector-effect="non-scaling-stroke"/></svg>`;
