// unlock.js: asks for the password once, then unscrambles the content on the phone.
//
// How it works:
//   - The site only holds scrambled files. This code rebuilds the key from the password
//     (the same way build/build.mjs did) and uses it to unscramble.
//   - If the key is wrong, unscrambling fails, which is how we know the password was wrong.
//   - After a correct password the key is saved on the phone, so she never types it again.

const KEY_STORAGE = 'flatearth-key'; // Name of the saved key in the phone's local storage.
const { subtle } = window.crypto;

// Read the saved key, if any. try/catch because some private-browsing modes block storage.
function loadSavedKey() {
  try { return localStorage.getItem(KEY_STORAGE); } catch { return null; }
}
function saveKey(base64) {
  try { localStorage.setItem(KEY_STORAGE, base64); } catch { /* Not saved: she'll be asked again next time. */ }
}
function forgetKey() {
  try { localStorage.removeItem(KEY_STORAGE); } catch { /* nothing to do */ }
}

// Small helpers to convert between bytes and text form (base64) for storage.
const toBase64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const fromBase64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

// Turn the typed password into the encryption key (slow on purpose, about a second).
async function keyFromPassword(password) {
  const settings = await (await fetch('crypto-settings.json')).json();
  const passwordKey = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', salt: fromBase64(settings.salt), iterations: settings.iterations, hash: 'SHA-256' },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    true, // "extractable", so we can save it and skip the slow step next time.
    ['decrypt']
  );
}

// Rebuild a key from the saved text form.
function keyFromSaved(base64) {
  return subtle.importKey('raw', fromBase64(base64), { name: 'AES-GCM' }, true, ['decrypt']);
}

// Download a scrambled file and unscramble it. Throws if the key is wrong.
// The first 12 bytes are the random "IV" written by the build script; the rest is the data.
async function fetchAndDecrypt(path, key) {
  // cache: 'no-cache' = use a saved copy only after the server confirms it's still current.
  const bytes = new Uint8Array(await (await fetch(path, { cache: 'no-cache' })).arrayBuffer());
  return subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, key, bytes.slice(12));
}

// Unscramble the main content file and turn it back into data.
async function loadContent(key) {
  const plain = await fetchAndDecrypt('data/content.bin', key);
  return JSON.parse(new TextDecoder().decode(plain));
}

// Unscramble a photo (or a video) and give back a temporary address the page can show.
// Example: photoUrl('kitchen.webp', key)  ->  'blob:...'
//          photoUrl('dryer-filter.mp4', key, 'videos')
export async function photoUrl(name, key, folder = 'photos') {
  const plain = await fetchAndDecrypt(`${folder}/${name}.bin`, key);
  const type = name.endsWith('.mp4') ? 'video/mp4' : name.endsWith('.svg') ? 'image/svg+xml' : name.endsWith('.png') ? 'image/png' : name.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
  return URL.createObjectURL(new Blob([plain], { type }));
}

// Main entry point: returns { content, key } once unlocked.
// "showForm" is called when we need her to type the password; it must return a promise
// that resolves to { password, showError } when she submits.
export async function unlock(showForm) {
  // 1. Try the saved key first (normal case after the first time, works offline).
  const saved = loadSavedKey();
  if (saved) {
    try {
      const key = await keyFromSaved(saved);
      return { content: await loadContent(key), key };
    } catch {
      forgetKey(); // The password was changed since, so ask again.
    }
  }
  // 2. Ask for the password until it's right.
  let attempt = await showForm();
  for (;;) {
    try {
      const key = await keyFromPassword(attempt.password);
      const content = await loadContent(key);
      saveKey(toBase64(await subtle.exportKey('raw', key)));
      return { content, key };
    } catch {
      attempt = await attempt.showError('Wrong password. Try again.');
    }
  }
}
