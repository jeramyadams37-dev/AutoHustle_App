// Fleet photos & documents — on-device image handling.
// Profile photos and document images are downscaled with canvas BEFORE
// saving so they never bloat localStorage. Non-image documents are
// stored as-is only if under the size cap, otherwise refused with a
// clear warning — never a silent failure.
//
// localStorage is not bottomless (about 5 MB per origin in the Android
// WebView). A downscaled 800px JPEG at quality 0.8 is typically
// 80–200 KB. Documents are capped at 1.5 MB each. If the phone ever
// refuses a save because storage is full, that is the WebView quota —
// delete old documents or photos to make room.

export const PHOTO_MAX_DIM = 800;
export const PHOTO_QUALITY = 0.8;
export const PHOTO_MAX_BYTES = 400 * 1024; // retry smaller if the first pass is over this
export const DOC_MAX_BYTES = 1536 * 1024; // 1.5 MB per stored document

const loadImage = (dataUrl) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error('Could not read that image.'));
  img.src = dataUrl;
});

const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result));
  r.onerror = () => reject(new Error('Could not read that file.'));
  r.readAsDataURL(file);
});

// Downscale an image File to a JPEG data URL (max 800px, quality 0.8).
// The multi-megabyte original is never stored. If the first pass is
// still over 400 KB, retry once at 600px / 0.7.
export async function fileToPhotoDataUrl(file, maxDim = PHOTO_MAX_DIM, quality = PHOTO_QUALITY) {
  const raw = await fileToDataUrl(file);
  const img = await loadImage(raw);
  const make = (dim, q) => {
    const scale = Math.min(1, dim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', q);
  };
  let out = make(maxDim, quality);
  // A data URL is ~4/3 the size of the bytes it holds.
  if (out.length > (PHOTO_MAX_BYTES * 4) / 3) out = make(600, 0.7);
  return out;
}

// Process a document upload. Images get the photo treatment above;
// anything else is stored as-is only if under the cap. Returns
// { data, mime, size } or throws with a plain-English reason the UI
// shows to the owner (never fails silently).
export async function fileToDocument(file) {
  const isImage = String(file.type || '').startsWith('image/');
  if (isImage) {
    const data = await fileToPhotoDataUrl(file);
    return { data, mime: 'image/jpeg', size: Math.round((data.length * 3) / 4) };
  }
  if (file.size > DOC_MAX_BYTES) {
    throw new Error(
      `That file is ${(file.size / 1048576).toFixed(1)} MB — documents are capped at 1.5 MB so they fit on the phone. Take a photo of it instead and upload that.`,
    );
  }
  const data = await fileToDataUrl(file);
  return { data, mime: file.type || 'application/octet-stream', size: file.size };
}

export function fmtFileSize(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1048576) return `${(n / 1048576).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

// Open a stored document for viewing. On the native app it goes through
// the share sheet (save to Files, print, open in another app); on the
// web it downloads with the document's own name.
export async function viewDocument(doc) {
  const name = doc.name || 'document';
  if (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()) {
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const { Share } = await import('@capacitor/share');
      const data = String(doc.data || '').split(',')[1] || '';
      const f = await Filesystem.writeFile({ path: name, data, directory: Directory.Cache });
      await Share.share({ title: name, url: f.uri, dialogTitle: name });
    } catch (e) {
      if (!String(e?.message || e).toLowerCase().includes('cancel')) alert('Could not open that document: ' + (e?.message || e));
    }
    return;
  }
  const a = document.createElement('a');
  a.href = doc.data;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
