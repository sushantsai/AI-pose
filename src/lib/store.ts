import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Scene, SceneAnalysis, Vibe } from '@contract';
import { Directory, File, Paths } from 'expo-file-system';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Person } from '@/core/keypoints';
import type { Source } from './coachApi';

/* ------------------------------ Settings --------------------------------- */

export type Sensitivity = 'relaxed' | 'normal' | 'strict';
export const SENSITIVITY_THRESHOLD: Record<Sensitivity, number> = { relaxed: 72, normal: 80, strict: 87 };

interface SettingsState {
  onboarded: boolean;
  voice: boolean;
  autoCapture: boolean;
  timerSeconds: 0 | 3 | 5 | 10;
  sensitivity: Sensitivity;
  defaultCamera: 'back' | 'front';
  update: (patch: Partial<Omit<SettingsState, 'update'>>) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      onboarded: false,
      voice: true,
      autoCapture: true,
      timerSeconds: 0,
      sensitivity: 'normal',
      defaultCamera: 'back',
      update: (patch) => set(patch),
    }),
    { name: 'settings', storage: createJSONStorage(() => AsyncStorage) },
  ),
);

/* ------------------------------- History --------------------------------- */

export interface Shoot {
  id: string;
  createdAt: number;
  uri: string;
  poseId: string;
  scene: Scene;
  score: number;
  people: 1 | 2;
}

interface HistoryState {
  shoots: Shoot[];
  add: (shoot: Omit<Shoot, 'id' | 'createdAt' | 'uri'>, sourceUri: string) => Shoot;
  remove: (id: string) => void;
  clear: () => void;
}

const shootsDir = () => {
  const dir = new Directory(Paths.document, 'shoots');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
};

export const useHistory = create<HistoryState>()(
  persist(
    (set, get) => ({
      shoots: [],
      add: (shoot, sourceUri) => {
        const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        const dest = new File(shootsDir(), `${id}.jpg`);
        new File(sourceUri).copySync(dest);
        const entry: Shoot = { ...shoot, id, createdAt: Date.now(), uri: dest.uri };
        set({ shoots: [entry, ...get().shoots].slice(0, 200) });
        return entry;
      },
      remove: (id) => {
        const shoot = get().shoots.find((s) => s.id === id);
        if (shoot) {
          const f = new File(shoot.uri);
          if (f.exists) f.delete();
        }
        set({ shoots: get().shoots.filter((s) => s.id !== id) });
      },
      clear: () => {
        const dir = new Directory(Paths.document, 'shoots');
        if (dir.exists) dir.delete();
        set({ shoots: [] });
      },
    }),
    { name: 'history', storage: createJSONStorage(() => AsyncStorage) },
  ),
);

/* ------------------------- Current shoot session ------------------------- */

export interface Capture {
  uri: string;
  width: number;
  height: number;
  /** Pose match when the shutter fired. */
  score: number;
  /** Detected people in normalized photo coordinates, used for smart cropping. */
  people: Person[];
}

interface SessionState {
  people: 1 | 2;
  vibe: Vibe | null;
  scene: Scene;
  analysis: SceneAnalysis | null;
  analysisSource: Source | null;
  notice: string | null;
  poseId: string | null;
  captures: Capture[];
  set: (patch: Partial<Omit<SessionState, 'set' | 'reset' | 'addCapture'>>) => void;
  addCapture: (c: Capture) => void;
  reset: () => void;
}

const freshSession = {
  analysis: null,
  analysisSource: null,
  notice: null,
  poseId: null,
  captures: [] as Capture[],
};

export const useSession = create<SessionState>()((set, get) => ({
  people: 1,
  vibe: null,
  scene: 'city',
  ...freshSession,
  set: (patch) => set(patch),
  addCapture: (c) => set({ captures: [...get().captures, c].slice(-6) }),
  reset: () => set(freshSession),
}));
