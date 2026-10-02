import { personCenter, type Person } from './keypoints';

/**
 * Exponential smoothing of detected keypoints between frames so the overlay
 * and the score do not jitter. People are tracked by nearest center.
 */
export function smoothPeople(previous: Person[], next: Person[], alpha = 0.55, maxJump = 0.15): Person[] {
  if (previous.length === 0) return next;
  const used = new Set<number>();
  return next.map((person) => {
    const c = personCenter(person);
    if (!c) return person;
    let bestIndex = -1;
    let bestDist = Infinity;
    previous.forEach((prev, i) => {
      if (used.has(i)) return;
      const pc = personCenter(prev);
      if (!pc) return;
      const d = Math.hypot(pc.x - c.x, pc.y - c.y);
      if (d < bestDist) {
        bestDist = d;
        bestIndex = i;
      }
    });
    if (bestIndex < 0 || bestDist > maxJump) return person;
    used.add(bestIndex);
    const prev = previous[bestIndex];
    return {
      score: person.score,
      keypoints: person.keypoints.map((k, i) => {
        const p = prev.keypoints[i];
        // Do not drag a point from a stale low-confidence position.
        if (p.score < 0.2 || k.score < 0.2) return k;
        return {
          x: p.x + (k.x - p.x) * alpha,
          y: p.y + (k.y - p.y) * alpha,
          score: k.score,
        };
      }),
    };
  });
}
