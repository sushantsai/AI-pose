import type { Scene } from '@contract';

export const SCENE_LABEL: Record<Scene, { emoji: string; label: string }> = {
  beach: { emoji: '🏖️', label: 'Beach' },
  mountain: { emoji: '⛰️', label: 'Mountain' },
  city: { emoji: '🏙️', label: 'City street' },
  cafe: { emoji: '☕', label: 'Café' },
  park: { emoji: '🌳', label: 'Park' },
  home: { emoji: '🏠', label: 'Home' },
  landmark: { emoji: '🏛️', label: 'Landmark' },
  wall: { emoji: '🧱', label: 'Wall / mural' },
  stairs: { emoji: '🪜', label: 'Stairs' },
  water: { emoji: '🌊', label: 'Lake / river' },
  sunset: { emoji: '🌅', label: 'Sunset' },
  event: { emoji: '🎉', label: 'Event' },
  gym: { emoji: '🏋️', label: 'Gym' },
  office: { emoji: '💼', label: 'Office' },
  snow: { emoji: '❄️', label: 'Snow' },
  night: { emoji: '🌃', label: 'Night' },
};
