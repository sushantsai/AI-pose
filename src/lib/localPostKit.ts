import type { Platform, PostKit, Scene, Vibe } from '@contract';

const TAGS: Record<Scene, string[]> = {
  beach: ['#beachvibes', '#oceanview', '#saltyhair', '#beachday'],
  mountain: ['#mountainview', '#hikingadventures', '#summitviews', '#naturelovers'],
  city: ['#citylife', '#streetstyle', '#urbanexplorer', '#citywalk'],
  cafe: ['#coffeetime', '#cafevibes', '#slowmornings', '#coffeelover'],
  park: ['#parklife', '#greenery', '#outdoors', '#weekendvibes'],
  home: ['#homesweethome', '#cozyvibes', '#athome', '#selfcare'],
  landmark: ['#travelgram', '#wanderlust', '#bucketlist', '#travelphotography'],
  wall: ['#streetart', '#wallporn', '#urbanart', '#colorfulwalls'],
  stairs: ['#stairs', '#architecture', '#streetphotography', '#cityscape'],
  water: ['#lakeside', '#waterfront', '#calmwaters', '#naturephotography'],
  sunset: ['#goldenhour', '#sunsetlovers', '#sunsetvibes', '#skyporn'],
  event: ['#celebration', '#goodtimes', '#partytime', '#memories'],
  gym: ['#fitnessmotivation', '#gymlife', '#workout', '#strongnotskinny'],
  office: ['#worklife', '#officestyle', '#mondaymotivation', '#hustle'],
  snow: ['#snowday', '#winterwonderland', '#snowvibes', '#wintertime'],
  night: ['#nightlife', '#citylights', '#nightphotography', '#afterdark'],
};

const CAPTIONS: Record<Scene, [string, string, string]> = {
  beach: ['Sea you soon 🌊', 'Vitamin sea, maximum dose', 'Where the waves write the soundtrack'],
  mountain: ['Higher than my worries ⛰️', 'Altitude adjusted my attitude', 'Thin air, full heart'],
  city: ['City state of mind', 'Main character energy, city edition', 'Concrete, light and a little wonder'],
  cafe: ['But first, coffee ☕', 'Espresso yourself', 'Slow sips and soft light'],
  park: ['Touching grass, as advised 🌿', 'Plot twist: I went outside', 'Green days are good days'],
  home: ['Home is a feeling', 'Professional relaxer, off duty', 'Soft light, slow day'],
  landmark: ['Been there, posed that 📍', 'Ticking boxes on the bucket list', 'Some places stay with you'],
  wall: ['Found my backdrop', 'Matching the wall was intentional', 'Colour me happy'],
  stairs: ['Step by step', 'Taking life one step at a time, literally', 'Every step tells a story'],
  water: ['Calm waters, clear mind', 'Making waves, gently', 'Still water, loud heart'],
  sunset: ['Golden hour glow ✨', 'The sun clocked out, I clocked in', 'Chasing light until it is gone'],
  event: ['Good times, great company 🎉', 'Dressed up, showed up', 'Moments worth keeping'],
  gym: ['Stronger every day 💪', 'Sweat now, flex later', 'Built, not bought'],
  office: ['Getting it done', 'Professional by day, poser by choice', 'Ideas in motion'],
  snow: ['Snow much fun ❄️', 'Chill mode: activated', 'Quiet, white and wonderful'],
  night: ['After dark ✨', 'Night owl, certified', 'City lights and late nights'],
};

const VIBE_TAG: Partial<Record<Vibe, string>> = {
  romantic: '#couplegoals',
  playful: '#goodvibesonly',
  elegant: '#effortlesschic',
  adventurous: '#adventuretime',
  confident: '#selflove',
  candid: '#candidmoments',
  professional: '#personalbranding',
  casual: '#everydaystyle',
};

/** Offline captions and hashtags when the AI is unavailable. */
export function localPostKit(scene: Scene, platform: Platform, people: 1 | 2, vibe?: Vibe | null): PostKit {
  const [short, witty, aesthetic] = CAPTIONS[scene];
  const hashtags = [
    ...TAGS[scene],
    ...(vibe && VIBE_TAG[vibe] ? [VIBE_TAG[vibe]!] : []),
    ...(people === 2 ? ['#togetherness'] : []),
    platform === 'instagram' ? '#instagood' : '#photooftheday',
  ];
  return {
    captions: [
      { style: 'short', text: short },
      { style: 'witty', text: witty },
      { style: 'aesthetic', text: aesthetic },
    ],
    hashtags,
    altText: people === 2 ? `Two people posing at a ${scene} location.` : `A person posing at a ${scene} location.`,
    tip:
      platform === 'instagram'
        ? 'Post as 4:5 for the most space in the feed; put hashtags in the first comment to keep the caption clean.'
        : 'Square or 4:5 photos look best in the Facebook feed; ask a question in the caption to invite comments.',
  };
}
