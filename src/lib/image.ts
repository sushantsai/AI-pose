import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { Rect } from '@/core/crop';

/** Downscale for the AI: ~512 px on the long edge keeps vision cost around 250 tokens. */
export async function toAiJpegBase64(uri: string, longEdge = 512): Promise<string> {
  const ctx = ImageManipulator.manipulate(uri);
  const probe = await ctx.renderAsync();
  const landscape = probe.width >= probe.height;
  ctx.resize(landscape ? { width: longEdge } : { height: longEdge });
  const ref = await ctx.renderAsync();
  const out = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
  if (!out.base64) throw new Error('Could not encode image');
  return out.base64;
}

export async function imageSize(uri: string): Promise<{ width: number; height: number }> {
  const ref = await ImageManipulator.manipulate(uri).renderAsync();
  return { width: ref.width, height: ref.height };
}

/** Crop (pixel rect) and optionally resize to an exact output size, returning a new file URI. */
export async function cropImage(
  uri: string,
  rect: Rect,
  size?: { width: number; height: number } | null,
): Promise<string> {
  const ctx = ImageManipulator.manipulate(uri).crop({
    originX: rect.x,
    originY: rect.y,
    width: rect.width,
    height: rect.height,
  });
  // Only downscale; never upscale a small crop.
  if (size && rect.width > size.width) ctx.resize({ width: size.width, height: size.height });
  const ref = await ctx.renderAsync();
  const out = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.92 });
  return out.uri;
}
