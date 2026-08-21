import { isIOSApp } from './platform';

/**
 * Cross-platform "save this image" for the lightbox.
 *
 * - Web / desktop: fetch the bytes and trigger a normal browser download
 *   (Electron shows its save dialog). If the host blocks cross-origin reads,
 *   fall back to opening the image in a new tab so it can be saved manually.
 * - iOS shell: hand the bytes to Swift over the `saveImage` message handler,
 *   which writes them to the photo library. Fetching in-page first matters:
 *   the page has the backend session cookie for /telegram/media URLs, which
 *   the native URLSession does not. For hosts the page cannot read (CORS),
 *   the URL is passed instead and Swift downloads it itself — those are
 *   public CDN links that need no credentials.
 */

declare global {
  interface Window {
    webkit?: {
      messageHandlers?: {
        saveImage?: { postMessage: (msg: unknown) => void };
      };
    };
    /** One-shot completion callback the iOS shell invokes after a save attempt. */
    __trenchcordImageSaved?: (ok: boolean) => void;
  }
}

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

function filenameFor(src: string, mime: string): string {
  let base = 'image';
  try {
    const last = new URL(src, window.location.href).pathname.split('/').filter(Boolean).pop();
    if (last) base = decodeURIComponent(last).replace(/\.[a-z0-9]+$/i, '') || 'image';
  } catch {
    // keep the default
  }
  return `${base}.${EXT_BY_MIME[mime] ?? 'png'}`;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}

async function fetchBlob(src: string): Promise<Blob | null> {
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null; // CORS or network — callers have a fallback
  }
}

/** Resolves once the image is saved (or the download was handed off); rejects when nothing could be saved. */
export async function saveImage(src: string): Promise<void> {
  if (isIOSApp()) {
    const bridge = window.webkit?.messageHandlers?.saveImage;
    if (!bridge) throw new Error('Saving is not available in this build.');

    const done = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        delete window.__trenchcordImageSaved;
        reject(new Error('Saving timed out.'));
      }, 30_000);
      window.__trenchcordImageSaved = (ok) => {
        clearTimeout(timeout);
        delete window.__trenchcordImageSaved;
        if (ok) resolve();
        else reject(new Error('Could not save the image. Check that Trenchcord may add to your photos in Settings.'));
      };
    });

    const blob = await fetchBlob(src);
    if (blob) {
      bridge.postMessage({ base64: await blobToBase64(blob), mime: blob.type });
    } else {
      bridge.postMessage({ url: new URL(src, window.location.href).href });
    }
    return done;
  }

  const blob = await fetchBlob(src);
  if (blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filenameFor(src, blob.type);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }
  // The page can't read the bytes (cross-origin without CORS): show the image
  // by itself so the browser's own save action still works.
  const win = window.open(src, '_blank', 'noopener');
  if (!win) throw new Error('Could not save the image.');
}
