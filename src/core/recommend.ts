import type { SceneAnalysis } from '@contract';
import { posesFor, type PoseDefinition, type Scene, type Vibe } from './poses';

const SCENE_SUMMARY: Record<Scene, string> = {
  beach: 'Open beach with lots of sky',
  mountain: 'Mountain view with a wide background',
  city: 'City street with buildings and lines',
  cafe: 'Cozy café setting',
  park: 'Green park or garden',
  home: 'Indoor home setting',
  landmark: 'Landmark or monument behind you',
  wall: 'Interesting wall or backdrop',
  stairs: 'Steps or a staircase',
  water: 'Lake, river or waterfront',
  sunset: 'Golden-hour or sunset light',
  event: 'Party, wedding or event',
  gym: 'Gym or workout space',
  office: 'Office or workspace',
  snow: 'Snowy landscape',
  night: 'Night-time with city lights',
};

const SCENE_TIPS: Partial<Record<Scene, string[]>> = {
  beach: ['Keep the horizon straight and in the top third.', 'Avoid harsh midday sun on faces — turn so the sun is behind or to the side.'],
  sunset: ['Expose for the sky and let the person become a silhouette, or tap the face to brighten it.'],
  city: ['Use street lines or buildings to lead the eye to the person.', 'Step back and zoom in slightly for a flattering perspective.'],
  mountain: ['Shoot from slightly below so the peaks tower behind them.', 'Leave space to show the scale of the view.'],
  night: ['Hold the phone very still or lean on something; ask them to stay still too.'],
  cafe: ['Use window light from the side for soft, flattering faces.'],
  landmark: ['Line the person up so they do not block the landmark.'],
};

/**
 * Offline pose ranking, used when the AI coach is unavailable or the user
 * picks a scene by hand. Prefers poses tagged for the scene and vibe, and
 * mixes postures so the suggestions are not four variations of one idea.
 */
export function rankPoses(scene: Scene, people: 1 | 2, vibe?: Vibe | null, count = 4): PoseDefinition[] {
  const scored = posesFor(people)
    .map((pose, index) => {
      let score = 0;
      const sceneRank = pose.scenes.indexOf(scene);
      if (sceneRank >= 0) score += 10 - Math.min(sceneRank, 5);
      if (vibe && pose.vibes.includes(vibe)) score += 6;
      if (pose.needs) score -= 1; // needs a prop that may not be there
      return { pose, score, index };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const picked: PoseDefinition[] = [];
  const postures = new Map<string, number>();
  for (const { pose } of scored) {
    if ((postures.get(pose.posture) ?? 0) >= 2) continue;
    picked.push(pose);
    postures.set(pose.posture, (postures.get(pose.posture) ?? 0) + 1);
    if (picked.length >= count) break;
  }
  return picked;
}

export function localSceneAnalysis(scene: Scene, people: 1 | 2, vibe?: Vibe | null): SceneAnalysis {
  const poses = rankPoses(scene, people, vibe);
  return {
    scene: {
      type: scene,
      summary: SCENE_SUMMARY[scene],
      lighting: 'Face the light source or keep it to the side for even, flattering light.',
    },
    recommendations: poses.map((p) => ({
      poseId: p.id,
      why: `Works well for ${SCENE_SUMMARY[scene].toLowerCase()} with a ${p.vibes[0]} feel.`,
      placement: p.needs ? `Find ${p.needs}.` : 'Stand where the background is clean behind you.',
    })),
    photographerTips: [...(SCENE_TIPS[scene] ?? []), 'Tap on the face to focus before shooting.'].slice(0, 3),
    framing: { orientation: 'portrait', cameraHeight: poses[0]?.camera ?? 'eye' },
  };
}
