import * as Speech from 'expo-speech';

/**
 * Speaks coaching hints without nagging: a new hint at most every 2.5 s, and
 * the same hint again only after 7 s.
 */
export function createVoiceCoach(minGapMs = 2500, repeatGapMs = 7000) {
  let lastText = '';
  let lastAt = 0;
  let speaking = false;
  const done = () => {
    speaking = false;
  };

  return {
    say(text: string, opts: { force?: boolean } = {}) {
      const now = Date.now();
      if (!opts.force) {
        if (speaking || now - lastAt < minGapMs) return;
        if (text === lastText && now - lastAt < repeatGapMs) return;
      } else {
        Speech.stop();
      }
      lastText = text;
      lastAt = now;
      speaking = true;
      Speech.speak(text, {
        rate: 1.05,
        onDone: done,
        onStopped: done,
        onError: done,
      });
    },
    stop() {
      speaking = false;
      Speech.stop();
    },
  };
}
