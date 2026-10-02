/**
 * Renders the silhouette outlines (as drawn on the camera) for review:
 *   npx tsx scripts/render-outlines.ts > outlines.svg
 */
import { bodyShape, outlineThickness, shapeSvg } from '../src/core/outline';
import { buildFigure } from '../src/core/poseDsl';
import { POSES } from '../src/core/poses';

const W = 180;
const H = 320;
const COLS = 7;
const ids = process.argv.slice(2);
const poses = ids.length ? POSES.filter((p) => ids.includes(p.id)) : POSES;
const rows = Math.ceil(poses.length / COLS);
const defs: string[] = [];
const body: string[] = [];

poses.forEach((pose, i) => {
  const ox = (i % COLS) * W;
  const oy = Math.floor(i / COLS) * (H + 30);
  const figures = pose.figures.map((f) => buildFigure(f, W / H));
  const shapes = figures.map((f) => bodyShape(f, W, H, pose.framing === 'half'));
  const t = outlineThickness(figures[0], H);
  const id = `m${i}`;
  defs.push(
    `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="black"/>${shapes
      .map((s) => shapeSvg(s, t, 'white'))
      .join('')}${shapes.map((s) => shapeSvg(s, 0, 'black')).join('')}</mask>`,
  );
  body.push(
    `<g transform="translate(${ox},${oy})"><rect x="2" y="2" width="${W - 4}" height="${H - 4}" rx="10" fill="#3a4250"/><rect width="${W}" height="${H}" fill="white" mask="url(#${id})"/></g>`,
    `<text x="${ox + W / 2}" y="${oy + H + 18}" fill="#eee" font-size="12" font-family="sans-serif" text-anchor="middle">${pose.name}</text>`,
  );
});

console.log(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${COLS * W}" height="${rows * (H + 30)}" style="background:#0B0B10"><defs>${defs.join('')}</defs>${body.join('')}</svg>`,
);
