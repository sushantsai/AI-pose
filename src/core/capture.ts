/**
 * Auto-capture state machine: the shutter fires once the person has matched
 * the pose steadily for a moment (optionally after a countdown), with
 * hysteresis so a single jittery frame does not reset everything.
 */

export type CaptureState =
  | { phase: 'searching' }
  | { phase: 'holding'; since: number }
  | { phase: 'countdown'; endsAt: number }
  | { phase: 'capturing' }
  | { phase: 'cooldown'; until: number };

export interface CaptureConfig {
  /** Score that counts as matched. */
  threshold: number;
  /** How long the match must be held before firing (ms). */
  holdMs: number;
  /** Countdown after holding, 0 to fire immediately (ms). */
  countdownMs: number;
  /** Pause after a capture before arming again (ms). */
  cooldownMs: number;
  /** How far below the threshold the score may dip while holding. */
  hysteresis: number;
}

export const DEFAULT_CAPTURE: CaptureConfig = {
  threshold: 80,
  holdMs: 700,
  countdownMs: 0,
  cooldownMs: 2500,
  hysteresis: 8,
};

export type CaptureEvent =
  | { type: 'tick'; now: number; score: number; ready: boolean }
  | { type: 'captured'; now: number }
  | { type: 'reset' };

export function captureReducer(state: CaptureState, event: CaptureEvent, config: CaptureConfig): CaptureState {
  if (event.type === 'reset') return { phase: 'searching' };
  if (event.type === 'captured') return { phase: 'cooldown', until: event.now + config.cooldownMs };

  const { now, score, ready } = event;
  switch (state.phase) {
    case 'searching':
      return ready ? { phase: 'holding', since: now } : state;
    case 'holding': {
      if (score < config.threshold - config.hysteresis) return { phase: 'searching' };
      if (now - state.since < config.holdMs) return state;
      return config.countdownMs > 0
        ? { phase: 'countdown', endsAt: now + config.countdownMs }
        : { phase: 'capturing' };
    }
    case 'countdown': {
      // People move a little while waiting; only abort on a big drop.
      if (score < config.threshold - config.hysteresis * 2) return { phase: 'searching' };
      return now >= state.endsAt ? { phase: 'capturing' } : state;
    }
    case 'capturing':
      return state;
    case 'cooldown':
      return now >= state.until ? { phase: 'searching' } : state;
  }
}

/** 0..1 progress of the hold, for the on-screen ring. */
export function holdProgress(state: CaptureState, now: number, config: CaptureConfig): number {
  if (state.phase === 'holding') return Math.min(1, (now - state.since) / config.holdMs);
  if (state.phase === 'countdown' || state.phase === 'capturing') return 1;
  return 0;
}

export function countdownSeconds(state: CaptureState, now: number): number | null {
  if (state.phase !== 'countdown') return null;
  return Math.max(1, Math.ceil((state.endsAt - now) / 1000));
}
