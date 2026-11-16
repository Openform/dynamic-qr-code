/**
 * Getting a photo ready to upload for a campaign page, in the browser: it's
 * scaled down to at most `maxSide` pixels and saved again as WebP (or JPEG
 * where the browser can't write WebP), at the lowest of a few qualities that
 * brings it under about 400 KB. Saving it again also leaves behind the
 * photo's hidden data, such as where a phone photo was taken.
 *
 * The server checks the result again (lib/pageImageFiles.js), so this is for
 * speed and privacy, not safety. Browser-only.
 */

/** Cover photos and photos in an Image block. */
export const PHOTO_MAX_SIDE = 1600;

/** Logos, shown small in a circle. */
export const LOGO_MAX_SIDE = 512;

const TARGET_BYTES = 400 * 1024;
const QUALITIES = [0.85, 0.75, 0.65, 0.55];

function toBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * `file` (from a file input) → `{ blob, width, height }` ready to upload.
 * Throws an Error with a message to show when it can't be read.
 */
export async function prepareImage(file, { maxSide = PHOTO_MAX_SIDE } = {}) {
  if (!file || !/^image\//.test(file.type)) throw new Error('Choose a photo (JPEG, PNG or WebP).');

  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('That photo couldn’t be opened. Try a JPEG or PNG.');
  }

  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');

  // JPEG has no transparency, so a transparent PNG gets a white background.
  const draw = (whiteBackground) => {
    context.clearRect(0, 0, width, height);
    if (whiteBackground) {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
    }
    context.drawImage(bitmap, 0, 0, width, height);
  };

  try {
    draw(false);
    for (const quality of QUALITIES) {
      let blob = await toBlob(canvas, 'image/webp', quality);
      if (!blob || blob.type !== 'image/webp') {
        draw(true);
        blob = await toBlob(canvas, 'image/jpeg', quality);
      }
      if (!blob) break;
      if (blob.size <= TARGET_BYTES || quality === QUALITIES.at(-1)) return { blob, width, height };
    }
  } finally {
    bitmap.close?.();
  }
  throw new Error('That photo couldn’t be prepared. Try another one.');
}
