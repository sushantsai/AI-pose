import type { FigureSpec } from '../poseDsl';
import type { Scene, Vibe } from '@contract';

export { SCENES, VIBES } from '@contract';
export type { Scene, Vibe } from '@contract';

export type Posture = 'standing' | 'sitting' | 'leaning' | 'walking' | 'crouching' | 'jumping';
export type CameraHeight = 'eye' | 'low' | 'high';

export interface PoseDefinition {
  /** Stable id, referenced by the AI coach. */
  id: string;
  name: string;
  people: 1 | 2;
  posture: Posture;
  /** 'half' poses are framed from the waist up; legs are ignored when scoring. */
  framing: 'full' | 'half';
  scenes: Scene[];
  vibes: Vibe[];
  /** Short cues read out by the coach, in order. */
  cues: string[];
  /** Advice for whoever holds the camera. */
  photoTip: string;
  camera: CameraHeight;
  /** Something the scene must offer, e.g. "a wall" or "steps". */
  needs?: string;
  figures: FigureSpec[];
}
