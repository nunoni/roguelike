// Inline SVG icons, one per skill and fusion. 24x24, stroked with currentColor.

const HEART = 'M0 .42C-.62-.02-.5-.46-.24-.46-.1-.46 0-.36 0-.24 0-.36.1-.46.24-.46.5-.46.62-.02 0 .42Z';
const heart = (cx, cy, s, fill = false) =>
  `<path transform="translate(${cx} ${cy}) scale(${s})" d="${HEART}" vector-effect="non-scaling-stroke"${fill ? ' fill="currentColor" fill-opacity=".35"' : ''}/>`;
const p = (d) => `<path d="${d}"/>`;
const c = (cx, cy, r, extra = '') => `<circle cx="${cx}" cy="${cy}" r="${r}" ${extra}/>`;
const BUTTERFLY = '<path d="M12 9C9 3 2.500 3.500 3 8c.4 3 4 4.500 9 3.500C7 13 4.500 16.500 7 19c2 2 4.500-1 5-5 .5 4 3 7 5 5 2.500-2.500 0-6-5-7.500 5 1 8.600-.5 9-3.500.5-4.500-6-5-9 1z" fill="currentColor" fill-opacity=".3"/>';
const FLAME_D = 'M12 2.5c1.5 4.5 6 6 6 11a6 6 0 01-12 0c0-3 2-4.2 3-7 .8 1.8 2.2 1.6 3-4z';
const flame = (cx, cy, k) => `<path transform="translate(${cx} ${cy}) scale(${k}) translate(-12 -13)" d="${FLAME_D}" fill="currentColor" fill-opacity=".35" stroke-width="${(1.6 / k).toFixed(2)}"/>`;
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

  // ---- new skills
  beat: p('M9 18V5l11-2v13') + c(6.5, 18, 2.5, 'fill="currentColor" fill-opacity=".4"') + c(17.5, 16, 2.5, 'fill="currentColor" fill-opacity=".4"') + p('M9 9l11-2'),
  flutter: BUTTERFLY + p('M12 7v11M12 7l-2-4M12 7l2-4'),
  envy: `<path transform="translate(12 12.500) scale(19)" d="${HEART}" vector-effect="non-scaling-stroke" fill="currentColor" fill-opacity=".3"/>` + p('M12 7.500l-2 3.500 3 2.500-2 4.500') + c(6, 4, 1, 'fill="currentColor"') + c(18, 4, 1, 'fill="currentColor"'),
  strings: heart(5.5, 15, 8, true) + heart(18.5, 9, 8, true) + p('M8.500 14.500C11 10 13 15 15.500 9.500'),

  // ---- new signature fusions
  ballroom: BUTTERFLY + p('M12 7v11') + c(12, 12, 10.500, 'stroke-dasharray="1.500 3"'),
  soulmates: heart(8, 12, 12, true) + heart(16, 12, 12, true) + p('M3 4c4 4 14 4 18 0'),

  // ---- cross fusions
  thermal: p('M7 2.500v11M4 10.500l3 3 3-3') + flame(17, 9, 0.48) + p('M3 20c1.500-1.500 3-1.500 4.500 0s3 1.500 4.500 0 3-1.500 4.500 0 3-1.500 4.500 0'),
  wildfire: `<path d="M13.500 2L6 12.500h5L9.500 22 18 10.500h-5z" fill="currentColor" fill-opacity=".25"/>` + flame(4.500, 18, 0.32) + flame(19.500, 18, 0.32),
  fever: c(12, 12, 10, 'stroke-dasharray="3 2.400"') + flame(12, 12.500, 0.55),
  starburst: `<path d="${STAR}" transform="translate(-3 3)" fill="currentColor" fill-opacity=".35"/>` + heart(4, 4, 5, true) + heart(20, 20, 5, true) + heart(4, 20, 5, true) + heart(20, 4, 5, true),
  singularity: c(12, 12, 3.500, 'fill="currentColor" fill-opacity=".7"') + c(12, 12, 7.500, 'stroke-dasharray="2 2.500"') + p('M3 2.500l4 4M21 2.500l-4 4M12 1v3.500'),
  halo: `<ellipse cx="12" cy="4.500" rx="6" ry="2"/>` + heart(12, 14, 11, true) + p('M8 13C6 8.500 2.500 9.500 2.500 13c0 1.400 1.600 1.800 3.400 1.300M16 13c2-4.500 5.500-3.500 5.500 0 0 1.400-1.600 1.800-3.400 1.300'),
  thunderstruck: c(12, 12, 8.500) + c(12, 12, 1.200, 'fill="currentColor"') + `<path d="M14 2.500L8 12h4l-2 9.500 6-9.500h-4z" fill="currentColor" fill-opacity=".35"/>`,
  skipping: p('M3 7l4 5-4 5M9 7l4 5-4 5') + c(18.500, 12, 2, 'fill="currentColor" fill-opacity=".5"') + c(18.500, 12, 4.500, 'stroke-dasharray="2 2"'),
  serenade: p('M8 17V5l9-2v12') + c(5.500, 17, 2.500, 'fill="currentColor" fill-opacity=".4"') + heart(16, 15.500, 8, true),
  choir: heart(12, 13, 8, true) + heart(4.500, 7, 6, true) + heart(19.500, 7, 6, true) + p('M8.500 11C7 7 3 7.500 3 11M15.500 11c1.500-4 5.500-3.500 5.500 0'),
  encore: p('M9 18V5l11-2v13') + c(6.500, 18, 2.500, 'fill="currentColor" fill-opacity=".4"') + c(17.500, 16, 2.500, 'fill="currentColor" fill-opacity=".4"') + p('M2 4l2 2M2 9h3M3 13l2-1'),
  kiss: BUTTERFLY + heart(12, 12.500, 7, true),
  livewire: heart(5, 16, 8, true) + heart(19, 8, 8, true) + p('M8 15l3-5 2 4 3-5'),
  heartache: `<path transform="translate(12 13) scale(17)" d="${HEART}" vector-effect="non-scaling-stroke" fill="currentColor" fill-opacity=".3"/>` + p('M12 8.500l-2 3.500 3 2.500-2 4.500') + c(12, 12, 10.500, 'stroke-dasharray="1.200 2.800"'),

  // ---- the newer arsenal
  ex: heart(9, 12.5, 13, true) + p('M14.5 5.5c6 .5 7.5 10 1.5 13') + p('M16 18.5l-.8-3.4M16 18.5l3.3-1'),
  whip: p('M3 20.5c4-1.5 3.5-7.5 8.5-8.5s5-6 7-7.500') + p('M6.5 15l-2.2-.8M10.5 12.3l-1-2.300M15 10l1.900-1.300M8.400 18l1.600 1.500') + heart(19.5, 4, 6, true),
  mirror: c(12, 13.5, 7.5, 'fill="currentColor" fill-opacity=".25"') + p('M4.5 13.5h15M5.500 10h13M5.500 17h13M12 6v15M8.500 7c-1.800 4-1.800 9 0 13M15.500 7c1.800 4 1.800 9 0 13M12 2v4') + p('M20 3l1 1M21.500 6.500h1.500'),
  letter: p('M3 6.500h18v12H3zM3 6.500l9 7 9-7') + heart(12, 16, 5, true),
  whiplash: heart(12, 12.500, 9, true) + c(12, 12, 8.500, 'stroke-dasharray="3 2.200"') + p('M20.500 12l1.800-1.800M3.500 12l-1.800 1.800M12 3.500l1.800-1.800M12 20.500l-1.800 1.800'),
  fanmail: p('M7 10h13v9.500H7zM7 10l6.500 5 6.500-5') + p('M2.500 3.500l3 3M1.500 10h3.500M8.500 2v3.500') + c(13.500, 6, 1.200, 'fill="currentColor"'),
  quiver: c(12, 12, 8.500) + c(12, 12, 3.500, 'fill="currentColor" fill-opacity=".35"') + p('M12 12L21.500 2.500M18 2.500h3.500V6M12 12L2.500 7M12 12l-4 9.500'),
  lasertag: p('M2.500 19.500L8.500 5l6.500 14.500L21.500 5') + c(8.500, 5, 1.600, 'fill="currentColor"') + c(15, 19.500, 1.600, 'fill="currentColor"') + c(21.500, 5, 1.600, 'fill="currentColor"'),
  goldrush: c(17, 7, 4.500, 'fill="currentColor" fill-opacity=".35"') + p('M17 4.800v4.400M15.500 6h2.300M2.500 21.500l8.500-8.500M5 15l3-3M9 19l3-3') + p('M13.500 13.500l1 1'),
  heartofgold: heart(12, 13.500, 17, true) + p('M7.500 4.500l2 2.500L12 3.500l2.500 3.500 2-2.500-.8 4.500H8.300z'),
  xp: heart(12, 13.500, 15, true) + p('M12 10.500v5M9.800 12.500L12 10.300l2.200 2.200') + p('M4 4l1.500 1.500M20 4l-1.500 1.500M12 1.500v2'),
  glowup: c(12, 12, 4.500, 'fill="currentColor" fill-opacity=".4"') + p('M12 14V9.500M10 11.500l2-2 2 2') + p('M12 1.500v3M12 19.500v3M1.500 12h3M19.500 12h3M4.500 4.500l2 2M17.500 17.500l2 2M19.500 4.500l-2 2M6.500 17.500l-2 2'),
  runningwild: flame(15, 12, 0.62) + p('M1.500 8h5M1 12h4.500M1.500 16h5'),
};

export function icon(id, size = 24) {
  const body = ICONS[id] || c(12, 12, 8);
  return `<svg class="icon" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export const heartSvg = (cls) =>
  `<svg class="hp ${cls}" viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path transform="translate(12 12.500) scale(21)" d="${HEART}" vector-effect="non-scaling-stroke"/></svg>`;
