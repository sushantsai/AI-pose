import type { CoachResponse, Platform, PostKit, Scene, SceneAnalysis, Vibe } from '@contract';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { localSceneAnalysis } from '@/core/recommend';
import { localPostKit } from './localPostKit';
import { ensureSession } from './supabase';

export type Source = 'ai' | 'offline';

export interface Sourced<T> {
  data: T;
  source: Source;
  /** Why the offline fallback was used, for a gentle notice in the UI. */
  notice?: string;
  remaining?: number;
}

async function invoke<T>(body: Record<string, unknown>): Promise<{ data: T; remaining?: number }> {
  const supabase = await ensureSession();
  if (!supabase) throw new OfflineError('AI is not configured — showing built-in suggestions.');
  const { data, error } = await supabase.functions.invoke<CoachResponse<T>>('coach', { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = (await error.context.json().catch(() => null)) as CoachResponse<T> | null;
      if (payload && !payload.ok) throw new OfflineError(payload.error);
    }
    throw new OfflineError('Could not reach the AI coach — showing built-in suggestions.');
  }
  if (!data || !data.ok) throw new OfflineError(data && !data.ok ? data.error : 'Unexpected response');
  return { data: data.data, remaining: data.remaining };
}

class OfflineError extends Error {}

function noticeFor(err: unknown): string {
  return err instanceof OfflineError ? err.message : 'AI unavailable — showing built-in suggestions.';
}

/**
 * Ask the AI which poses suit this location. Never throws: on any failure it
 * returns `data: null` with a notice, and the camera falls back to built-in picks.
 */
export async function analyzeScene(opts: {
  imageBase64: string;
  people: 1 | 2;
  vibe?: Vibe | null;
}): Promise<Sourced<SceneAnalysis | null>> {
  try {
    const res = await invoke<SceneAnalysis>({
      action: 'scene',
      image: opts.imageBase64,
      people: opts.people,
      vibe: opts.vibe ?? null,
    });
    if (res.data.recommendations.length === 0) {
      // The AI read the scene but picked nothing usable: keep its read, use local poses.
      const local = localSceneAnalysis(res.data.scene.type, opts.people, opts.vibe);
      return { data: { ...res.data, recommendations: local.recommendations }, source: 'ai', remaining: res.remaining };
    }
    return { data: res.data, source: 'ai', remaining: res.remaining };
  } catch (err) {
    return { data: null, source: 'offline', notice: noticeFor(err) };
  }
}

export async function createPostKit(opts: {
  imageBase64: string;
  platform: Platform;
  people: 1 | 2;
  scene: Scene;
  sceneSummary: string | null;
  vibe: Vibe | null;
}): Promise<Sourced<PostKit>> {
  try {
    const res = await invoke<PostKit>({
      action: 'postkit',
      image: opts.imageBase64,
      platform: opts.platform,
      people: opts.people,
      sceneSummary: opts.sceneSummary,
      vibe: opts.vibe,
    });
    return { data: res.data, source: 'ai', remaining: res.remaining };
  } catch (err) {
    return { data: localPostKit(opts.scene, opts.platform, opts.people, opts.vibe), source: 'offline', notice: noticeFor(err) };
  }
}
