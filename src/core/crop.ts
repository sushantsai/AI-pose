import { personBounds, type Person } from './keypoints';

export type PlatformFormat = 'instagram-post' | 'instagram-story' | 'facebook-post' | 'original';

export const FORMATS: Record<PlatformFormat, { label: string; aspect: number | null; size: { width: number; height: number } | null }> = {
  'instagram-post': { label: 'Instagram Post 4:5', aspect: 4 / 5, size: { width: 1080, height: 1350 } },
  'instagram-story': { label: 'Story / Reel 9:16', aspect: 9 / 16, size: { width: 1080, height: 1920 } },
  'facebook-post': { label: 'Facebook 1:1', aspect: 1, size: { width: 1080, height: 1080 } },
  original: { label: 'Original', aspect: null, size: null },
};

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Union of all visible people's keypoints, in normalized image coordinates. */
export function subjectBounds(people: Person[]): Rect | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of people) {
    const b = personBounds(p);
    if (!b) continue;
    minX = Math.min(minX, b.minX);
    minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX);
    maxY = Math.max(maxY, b.maxY);
  }
  if (!Number.isFinite(minX)) return null;
  // Keypoints stop at the nose and ankles: pad for the top of the head and feet.
  const h = maxY - minY;
  const w = maxX - minX;
  minY -= h * 0.12;
  maxY += h * 0.05;
  minX -= w * 0.08;
  maxX += w * 0.08;
  return {
    x: Math.max(0, minX),
    y: Math.max(0, minY),
    width: Math.min(1, maxX) - Math.max(0, minX),
    height: Math.min(1, maxY) - Math.max(0, minY),
  };
}

/**
 * Largest crop of `aspect` (width / height) that fits the image, positioned
 * to keep the subject in frame with some headroom. Returns pixel coordinates.
 */
export function smartCrop(
  image: { width: number; height: number },
  aspect: number,
  subject: Rect | null,
): Rect {
  const imageAspect = image.width / image.height;
  let width: number;
  let height: number;
  if (imageAspect > aspect) {
    height = image.height;
    width = Math.round(height * aspect);
  } else {
    width = image.width;
    height = Math.round(width / aspect);
  }

  const s = subject ?? { x: 0.25, y: 0.2, width: 0.5, height: 0.6 };
  const subjectPx = {
    x: s.x * image.width,
    y: s.y * image.height,
    width: s.width * image.width,
    height: s.height * image.height,
  };

  // Horizontally center on the subject.
  let x = subjectPx.x + subjectPx.width / 2 - width / 2;
  // Vertically: if the subject fits, keep a bit more room below the feet than
  // above the head; if it does not fit, keep the head and crop the feet.
  let y: number;
  if (subjectPx.height <= height) {
    const spare = height - subjectPx.height;
    y = subjectPx.y - spare * 0.4;
  } else {
    y = subjectPx.y - height * 0.03;
  }

  x = clamp(x, 0, image.width - width);
  y = clamp(y, 0, image.height - height);
  return { x: Math.round(x), y: Math.round(y), width, height };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), Math.max(min, max));
}
