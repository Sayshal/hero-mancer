const cache = new Map();
const FALLBACK = { primary: '#c8a878', secondary: '#5a4830' };
const BLACK = new foundry.utils.Color(0);

/**
 * Resolve a palette {primary, secondary} from a class icon image.
 * @param {?string} img Image URL.
 * @returns {Promise<{primary:string, secondary:string}>} Palette.
 */
export async function getClassColor(img) {
  if (!img || img === 'icons/svg/mystery-man.svg') return FALLBACK;
  const cached = cache.get(img);
  if (cached) return cached;
  const pending = extract(img);
  cache.set(img, pending);
  const palette = await pending;
  cache.set(img, palette);
  return palette;
}

/**
 * Sample pixels off an image, bin by 32-step buckets, pick most common as primary.
 * @param {string} img URL.
 * @returns {Promise<{primary:string, secondary:string}>} Resolved palette (fallback on failure).
 */
function extract(img) {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    const timeout = setTimeout(() => resolve(FALLBACK), 5000);
    image.onload = () => {
      clearTimeout(timeout);
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const size = 50;
        canvas.width = size;
        canvas.height = size;
        ctx.drawImage(image, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;
        const colorMap = new Map();
        for (let i = 0; i < data.length; i += 16) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];
          if (a < 128) continue;
          if (r > 240 && g > 240 && b > 240) continue;
          if (r < 20 && g < 20 && b < 20) continue;
          const rb = Math.floor(r / 32) * 32;
          const gb = Math.floor(g / 32) * 32;
          const bb = Math.floor(b / 32) * 32;
          const key = `${rb},${gb},${bb}`;
          colorMap.set(key, (colorMap.get(key) ?? 0) + 1);
        }
        let dominant = null;
        let max = 0;
        for (const [k, n] of colorMap) {
          if (n > max) {
            max = n;
            dominant = k;
          }
        }
        if (!dominant) return resolve(FALLBACK);
        const [r, g, b] = dominant.split(',').map(Number);
        const primaryColor = new foundry.utils.Color((r << 16) | (g << 8) | b);
        const secondaryColor = primaryColor.mix(BLACK, 0.55);
        resolve({ primary: primaryColor.toString(), secondary: secondaryColor.toString() });
      } catch {
        resolve(FALLBACK);
      }
    };
    image.onerror = () => {
      clearTimeout(timeout);
      resolve(FALLBACK);
    };
    image.src = img;
  });
}
