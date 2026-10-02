/**
 * Renders every pose sketch into one SVG contact sheet for visual review:
 *   npx tsx scripts/render-poses.ts > poses.svg
 */
import { canonicalize } from '../src/core/matching';
import { buildFigure } from '../src/core/poseDsl';
import { POSES } from '../src/core/poses';

const W = 180;
const H = 320;
const COLS = 7;
const rows = Math.ceil(POSES.length / COLS);
const parts: string[] = [];

POSES.forEach((pose, i) => {
  const ox = (i % COLS) * W;
  const oy = Math.floor(i / COLS) * (H + 30);
  parts.push(`<rect x="${ox + 2}" y="${oy + 2}" width="${W - 4}" height="${H - 4}" rx="10" fill="#1A1A26"/>`);
  for (const spec of pose.figures) {
    const f = buildFigure(spec, W / H);
    const c = canonicalize(f);
    const p = (k: { x: number; y: number }) => `${(ox + k.x * W).toFixed(1)},${(oy + k.y * H).toFixed(1)}`;
    const bones: Array<[{ x: number; y: number }, { x: number; y: number }, string]> = [
      [c.L.shoulder, c.R.shoulder, '#ddd'], [c.L.hip, c.R.hip, '#ddd'], [c.L.shoulder, c.L.hip, '#ddd'], [c.R.shoulder, c.R.hip, '#ddd'],
      [c.L.shoulder, c.L.elbow, '#FF5E7E'], [c.L.elbow, c.L.wrist, '#FF5E7E'], [c.R.shoulder, c.R.elbow, '#7C5CFF'], [c.R.elbow, c.R.wrist, '#7C5CFF'],
    ];
    if (pose.framing === 'full') {
      bones.push([c.L.hip, c.L.knee, '#FF5E7E'], [c.L.knee, c.L.ankle, '#FF5E7E'], [c.R.hip, c.R.knee, '#7C5CFF'], [c.R.knee, c.R.ankle, '#7C5CFF']);
    }
    for (const [a, b, col] of bones) parts.push(`<polyline points="${p(a)} ${p(b)}" stroke="${col}" stroke-width="5" stroke-linecap="round"/>`);
    parts.push(`<circle cx="${ox + f.head.x * W}" cy="${oy + f.head.y * H}" r="${f.head.r * H}" stroke="#ddd" stroke-width="4" fill="none"/>`);
  }
  parts.push(`<text x="${ox + W / 2}" y="${oy + H + 18}" fill="#eee" font-size="12" font-family="sans-serif" text-anchor="middle">${pose.name}</text>`);
});

console.log(`<svg xmlns="http://www.w3.org/2000/svg" width="${COLS * W}" height="${rows * (H + 30)}" style="background:#0B0B10">${parts.join('')}</svg>`);
