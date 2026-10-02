import { COUPLE_POSES } from './couple';
import { SOLO_POSES } from './solo';
import type { PoseDefinition } from './types';

export * from './types';

export const POSES: readonly PoseDefinition[] = [...SOLO_POSES, ...COUPLE_POSES];

const BY_ID = new Map(POSES.map((p) => [p.id, p]));

export function getPose(id: string): PoseDefinition | undefined {
  return BY_ID.get(id);
}

export function posesFor(people: 1 | 2): PoseDefinition[] {
  return POSES.filter((p) => p.people === people);
}

/** One line per pose, used as the catalog the AI coach chooses from. */
export function catalogLine(p: PoseDefinition): string {
  const needs = p.needs ? ` | needs ${p.needs}` : '';
  return `${p.id} | ${p.name} | ${p.people === 1 ? 'solo' : 'couple'} | ${p.posture}, ${p.framing} body | scenes: ${p.scenes.join(', ')} | vibes: ${p.vibes.join(', ')}${needs}`;
}
