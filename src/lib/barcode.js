/**
 * Client-only wrapper around bwip-js for the non-QR symbologies (Data Matrix).
 * Isolated from qrStyle.js so that bwip-js — which touches the DOM/canvas — is
 * never pulled into the server bundle or the API routes.
 *
 * bwip-js is loaded via a lazy dynamic import so it stays out of the initial
 * bundle and never executes during SSR.
 */

import { buildBwipOptions } from './qrStyle';

let bwipPromise;
function getBwip() {
  if (!bwipPromise) {
    bwipPromise = import('bwip-js/browser').then((m) => m.default || m);
  }
  return bwipPromise;
}

/** Render a barcode for the given style/data into an existing <canvas> element. */
export async function renderBwipCanvas(canvasEl, style, data, scale = 6) {
  const bwipjs = await getBwip();
  bwipjs.toCanvas(canvasEl, buildBwipOptions(style, { data, scale }));
}

/** Produce an SVG string for the given style/data. */
export async function bwipSvgString(style, data, scale = 6) {
  const bwipjs = await getBwip();
  return bwipjs.toSVG(buildBwipOptions(style, { data, scale }));
}

/** Download the barcode as a PNG or SVG file. */
export async function downloadBwip(style, data, extension, name) {
  const filename = `${name || 'barcode'}.${extension}`;

  if (extension === 'svg') {
    const svg = await bwipSvgString(style, data, 8);
    triggerDownload(new Blob([svg], { type: 'image/svg+xml' }), filename);
    return;
  }

  // PNG: render off-screen at a higher scale for a crisp export.
  const canvas = document.createElement('canvas');
  await renderBwipCanvas(canvas, style, data, 8);
  await new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (blob) triggerDownload(blob, filename);
      resolve();
    }, 'image/png');
  });
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
