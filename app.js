// app.js: draws every screen of the manual.
//
// Screens (the part after # in the address decides which one is shown):
//   #/                    Home: search + problem buttons
//   #/map                 Map of the flat; #/map/<room> opens that room's bottom panel
//   #/thing/<id>          Item page: where it is, photo, video, app, related problems
//   #/guide/<id>          Guide: a question screen, or step 1
//   #/guide/<id>/<n>      Step n of a guide
//   #/guide/<id>/end      Last screen: who to call if it still doesn't work
//   #/guide/<id>/say-<contact>  What to say when that company picks up (in Czech)
//   #/contacts            Contacts with tap-to-call
//
// The content comes from the encrypted data file (see unlock.js), so nothing personal
// is written in this code.

import { buildIndex, buildMapIndex, search } from './search.js?v=32872b0';
import { photoUrl } from './unlock.js?v=32872b0';

let content, key, index, mapIndex;
const view = document.getElementById('view');

// ---------- Small helpers ----------

// Escape text so names like "Tape & glue" can't break the page's HTML.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const byId = (list, id) => list.find((x) => x.id === id);
const roomName = (id) => byId(content.rooms, id)?.name ?? id;

// Phone number "221 586 593" -> "tel:+420221586593" (all numbers here are Czech).
const telLink = (phone) => 'tel:+420' + phone.replace(/\D/g, '');

// Turn web addresses and phone numbers inside a step's text into tappable buttons/links.
function richText(text) {
  const parts = [];
  let rest = esc(text);
  // Web addresses become a separate button below the text, labelled with the site name.
  // "[Planned shutdowns](https://...)" gives the button its own label instead
  // (needed when a step has two links to the same site).
  const links = [];
  rest = rest.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (m, label, url) => {
    links.push({ url, label });
    return '';
  }).replace(/https?:\/\/[^\s]+/g, (url) => {
    const clean = url.replace(/[.,)]+$/, '');
    links.push({ url: clean });
    return '';
  }).replace(/\s+([.:])?\s*$/, '$1').replace(/:\s*$/, '.');
  // Phone numbers like "221 586 593" become tap-to-call links.
  rest = rest.replace(/\b(\d{3} \d{3} \d{3})\b/g, (n) => `<a href="${telLink(n)}">${n}</a>`);
  parts.push(rest);
  for (const { url, label } of links) {
    const host = new URL(url.replace(/&amp;/g, '&')).hostname.replace(/^www\./, '');
    parts.push(`<a class="btn btn-link" href="${url}" target="_blank" rel="noopener">${label ?? `Open ${esc(host)}`} ↗</a>`);
  }
  return parts.join('');
}

// Simple line icons (drawn with SVG), so each kind of entry always has the same symbol.
const ICONS = {
  // A wrench: "let's fix it", calmer than a warning sign.
  problem: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  thing: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>',
  contact: '<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2Z"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  how: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
  home: '<path d="M3 11 12 3l9 8M5 9.5V21h14V9.5"/>',
  map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z"/><path d="M9 4v14M15 6v14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  photo: '<rect x="3" y="6" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="3.5"/><path d="M8 6l1.5-2h5L16 6"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/>',
  app: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
};
const icon = (name) => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

// ---------- Photos and videos ----------
// Photos are encrypted too, so each is unscrambled on the phone when first shown.
// Missing ones (not shot yet) show a grey placeholder with a description instead.

const mediaCache = new Map();
function mediaUrl(folder, name) {
  if (!mediaCache.has(name)) mediaCache.set(name, photoUrl(name, key, folder));
  return mediaCache.get(name);
}

function photoBlock(name, description) {
  if (!name) return '';
  if (!content.photos.includes(name)) {
    return `<figure class="placeholder">${icon('photo')}<figcaption><b>Photo coming</b>${esc(description)}</figcaption></figure>`;
  }
  return `<figure class="photo"><img data-photo="${esc(name)}" alt="${esc(description)}"></figure>`;
}

function videoBlock(name, description) {
  if (!name) return '';
  if (!content.videos.includes(name)) {
    return `<figure class="placeholder">${icon('video')}<figcaption><b>Video coming</b>${esc(description)}</figcaption></figure>`;
  }
  return `<figure class="photo"><video data-video="${esc(name)}" controls playsinline preload="metadata"></video></figure>`;
}

// ---------- Dogs ----------
// Photos named "dog-....jpg" in content/photos. A random one cheers her up on the
// "All fixed" and "wait" screens. "dogface-....jpg" are square close-ups of their faces,
// one of them greets her in a small circle on the home screen.
const dogPhotos = () => content.photos.filter((n) => n.startsWith('dog-'));
let lastDog = null;
function randomDog() {
  const all = dogPhotos();
  if (!all.length) return null;
  // Pick one at random, but never the same dog photo twice in a row.
  const choices = all.length > 1 ? all.filter((n) => n !== lastDog) : all;
  lastDog = choices[Math.floor(Math.random() * choices.length)];
  return lastDog;
}
function dogBlock() {
  const name = randomDog();
  return name ? `<figure class="dog"><img data-photo="${esc(name)}" alt="One of the dogs"></figure>` : '';
}
// The home screen dog is picked once each time the app is opened, so it doesn't change while she moves around.
let homeDog;
function randomDogFace() {
  const faces = content.photos.filter((n) => n.startsWith('dogface-'));
  return faces.length ? faces[Math.floor(Math.random() * faces.length)] : null;
}

// After a screen is drawn, fill in the real photos and videos.
function loadMedia() {
  for (const img of view.querySelectorAll('img[data-photo]')) {
    mediaUrl('photos', img.dataset.photo).then((url) => { img.src = url; });
  }
  for (const vid of view.querySelectorAll('video[data-video]')) {
    mediaUrl('videos', vid.dataset.video).then((url) => { vid.src = url; });
  }
}

// ---------- Floor plan ----------

// A pin on the floor plan at map position [x, y].
// A pin is either a plain [x, y] (drawn as a map pin) or { at: [x, y], n: 3, size }
// (drawn as a numbered circle that matches the number in the list below the map).
function pinSvg(pin) {
  // A pin with a name tag above it (map search): { at: [x, y], label: 'Router', link: '#/thing/router' }.
  // The tag is tappable when the thing has its own page.
  if (pin.label) {
    const [x, y] = pin.at;
    const text = pin.link ? `${pin.label}  ›` : pin.label;
    const w = text.length * 9.8 + 18, h = 32;
    const left = Math.min(Math.max(x - w / 2, 198), 642 - w); // keep the tag inside the plan
    const tag = `<g class="pin-tag${pin.link ? ' link' : ''}"><rect x="${left}" y="${y - 30 - h}" width="${w}" height="${h}" rx="8"/>`
      + `<text x="${left + w / 2}" y="${y - 30 - h / 2}">${esc(text)}</text></g>`;
    return pinSvg([x, y]) + (pin.link ? `<a href="${pin.link}">${tag}</a>` : tag);
  }
  if (Array.isArray(pin)) {
    const [x, y] = pin;
    return `<g class="pin" transform="translate(${x} ${y})"><path d="M0 0c-6-9-11-14-11-20a11 11 0 0 1 22 0c0 6-5 11-11 20Z"/><circle cy="-20" r="4"/></g>`;
  }
  const [x, y] = pin.at, r = pin.size;
  // pin.count > 1: several things at this spot, shown as a small badge at the top right.
  const badge = pin.count > 1
    ? `<g class="pin-count"><circle cx="${x + r * 0.9}" cy="${y - r * 0.9}" r="${r * 0.62}"/><text x="${x + r * 0.9}" y="${y - r * 0.9}" font-size="${r * 0.85}">${pin.count}</text></g>`
    : '';
  return `<g class="pin-num"><circle cx="${x}" cy="${y}" r="${r}"/><text x="${x}" y="${y}" font-size="${r * 1.25}">${pin.n}</text></g>${badge}`;
}

// The floor plan SVG, optionally with some rooms highlighted and pins drawn.
// "view" zooms in on part of the plan: [x, y, width, height] in floor plan coordinates.
function floorplan(highlight = [], interactive = false, pins = [], view = null) {
  const extra = pins.map(pinSvg).join('');
  let svg = content.floorplan
    .replace(/<!--[\s\S]*?-->/, '')
    .replace('</svg>', `${extra}</svg>`);
  if (view) svg = svg.replace(/viewBox="[^"]*"/, `viewBox="${view.join(' ')}"`);
  const cls = ['plan', interactive ? 'interactive' : '', ...highlight.map((r) => 'hl-' + r)].join(' ');
  return `<div class="${cls}">${svg}</div>`;
}

// Free text from a content file: each line is a paragraph, lines starting with "- " form a list.
function bodyText(text) {
  if (!text) return '';
  let html = '', inList = false;
  for (const line of text.split('\n')) {
    const item = line.match(/^-\s+(.*)$/);
    if (item && !inList) { html += '<ul class="body">'; inList = true; }
    if (!item && inList) { html += '</ul>'; inList = false; }
    if (item) html += `<li>${esc(item[1])}</li>`;
    else if (line.trim()) html += `<p class="body">${esc(line)}</p>`;
  }
  return html + (inList ? '</ul>' : '');
}

// ---------- Which room a pin is in ----------
// Reads the room shapes from the floor plan, then checks if a point lies inside one.
let roomShapes;
function shapes() {
  roomShapes ??= [...content.floorplan.matchAll(/<polygon id="room-([a-z]+)"[^>]*points="([^"]+)"/g)]
    .map((m) => ({ id: m[1], pts: m[2].trim().split(/\s+/).map((p) => p.split(',').map(Number)) }));
  return roomShapes;
}
function roomOf([x, y]) {
  for (const { id, pts } of shapes()) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    if (inside) return id;
  }
  return null;
}

// ---------- Screens ----------

function home() {
  const problems = content.problems.filter((p) => !p.hidden);
  return `
    <header class="top home-top">
      ${homeDog ? `<img class="dog-round" data-photo="${esc(homeDog)}" alt="One of the dogs">` : ''}
      <h1 class="brand">Flat Earth Manual</h1>
    </header>
    <label class="searchbox">
      ${icon('search')}
      <input id="q" type="search" placeholder="Search, in English or Czech" autocomplete="off" enterkeyhint="search">
    </label>
    <div id="results"></div>
    <section id="sos">
      <div class="list">
        ${problems.map((p) => `<a class="btn btn-problem" href="#/guide/${p.id}">${icon('problem')}<span>${esc(p.title)}</span></a>`).join('')}
      </div>
    </section>`;
}

// "How things work" screen (its own tab in the bottom bar), in the order set by "how:" in each file.
const howThings = () => content.things.filter((t) => t.how).sort((a, b) => Number(a.how) - Number(b.how));
function howScreen() {
  return `
    <header class="top"><h1>How things work</h1></header>
    <div class="list">
      ${howThings().map((t) => `<a class="btn" href="#/thing/${t.id}">${icon('how')}<span>${esc(t.name)}</span></a>`).join('')}
    </div>`;
}

// Live search results under the search box. While she types, the problem list hides.
function showResults(query) {
  const box = document.getElementById('results');
  const sos = document.getElementById('sos');
  if (!query.trim()) { box.innerHTML = ''; sos.hidden = false; return; }
  sos.hidden = true;
  const found = search(index, query);
  if (!found.length) {
    const funny = document.documentElement.dataset.style === 'a';
    box.innerHTML = `<p class="empty">${funny ? "You've sailed off the edge." : 'Nothing found.'}<br>Try another word, in English or Czech.</p>`;
    return;
  }
  const link = (e) => e.type === 'problem' ? `#/guide/${e.id}`
    : e.type === 'thing' ? (hasPage(byId(content.things, e.id)) ? `#/thing/${e.id}` : `#/map/at/${e.id}`)
    : `#/contacts/${e.id}`;
  const sub = (e) => {
    if (e.type === 'thing') { const t = byId(content.things, e.id); return t.where || ''; }
    if (e.type === 'contact') return byId(content.contacts, e.id).role;
    return 'Step-by-step fix';
  };
  box.innerHTML = `<div class="list">${found.map((e) => `
    <a class="row row-${e.type}" href="${link(e)}">${icon(e.type)}
      <span><b>${esc(e.title)}</b><small>${esc(sub(e))}</small></span></a>`).join('')}</div>`;
}

function mapScreen(roomId, selectId) {
  // "#/map" or "#/map/at/<thing>": the whole flat with the search box
  // (the second form opens with that thing already shown, e.g. from the Home search).
  if (!roomId || roomId === 'at') {
    // Opened from a link (a guide step, an item, the Home search): offer a way back there.
    const back = roomId === 'at' ? `<a class="back" href="javascript:history.back()">‹ Back</a>` : '';
    return `
      <header class="top ${back ? 'sub' : ''}">${back}<h1>Map</h1><p class="hint">Tap a room, or search for a thing.</p></header>
      <label class="searchbox">
        ${icon('search')}
        <input id="mq" type="search" placeholder="Find a thing, in English or Czech" autocomplete="off" enterkeyhint="search">
      </label>
      <div id="map-results"></div>
      <div id="map-picked"></div>
      <div class="map-wrap" id="map-main">${floorplan([], true)}</div>`;
  }
  const room = byId(content.rooms, roomId);
  if (!room) return notFound();
  // Things in this room: by their room list or by a pin inside the room.
  const things = content.things.filter((t) => (t.rooms ?? []).includes(roomId) || (t.pins ?? []).some((p) => roomOf(p) === roomId));
  // Pins to show: those inside the room, plus pins of this room's things that sit in a wall
  // or the shaft next to it (the boiler and ladder behind the WC wall panel).
  const pinsHere = (t) => (t.pins ?? []).filter((p) => roomOf(p) === roomId || (roomOf(p) === null && (t.rooms ?? []).includes(roomId)));
  // Zoom in on the room (with a margin), so the pins are big enough to tell apart.
  const roomPts = shapes().find((s) => s.id === roomId).pts.concat(things.flatMap(pinsHere));
  const xs = roomPts.map((p) => p[0]);
  const ys = roomPts.map((p) => p[1]);
  const pad = 18;
  const view = [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + 2 * pad, Math.max(...ys) - Math.min(...ys) + 2 * pad];
  const size = Math.max(view[2], view[3]) * 0.035;
  // Spots: things at (almost) the same place share one pin and one number, like the keys,
  // alarm tag and fuse box by the entrance. The pin gets a small badge with how many things
  // are there, and the list below shows one numbered block per spot.
  const gap = size * 2.1;
  const spots = []; // each: { at: [x, y], things: [...] }
  for (const t of things) {
    for (const at of pinsHere(t)) {
      const spot = spots.find((sp) => Math.hypot(sp.at[0] - at[0], sp.at[1] - at[1]) < gap);
      if (!spot) spots.push({ at: [...at], things: [t] });
      else if (!spot.things.includes(t)) spot.things.push(t);
    }
  }
  // Inside a spot, the main things (those in "How things work", like the fuse box) come first.
  for (const sp of spots) sp.things.sort((a, b) => Boolean(b.how) - Boolean(a.how));
  // Things listed for this room without a pin in it still get a line in the list (no pin).
  for (const t of things) if (!spots.some((sp) => sp.things.includes(t))) spots.push({ at: null, things: [t] });
  const pins = spots.filter((sp) => sp.at).map((sp) => ({ at: sp.at, n: spots.indexOf(sp) + 1, size, count: sp.things.length }));

  // One line for a thing: tappable with "Details" if it has a page, otherwise its note in small text.
  const thingLine = (t, withPlace) => {
    const note = !hasPage(t) && t.body ? `<small class="note-inline">${esc(t.body)}</small>` : '';
    const inner = `<span><b>${esc(t.name)}</b>${withPlace ? `<small>${esc(t.where)}</small>` : ''}${note}</span>`;
    return hasPage(t)
      ? `<a class="spot-thing has-page" href="#/thing/${t.id}">${inner}<i class="details">Details${icon('chevron')}</i></a>`
      : `<div class="spot-thing no-page">${inner}</div>`;
  };
  return `
    <header class="top sub"><a class="back" href="#/map">‹ Whole flat</a><h1>${esc(room.name)}</h1></header>
    <div class="map-wrap">${floorplan([roomId], true, pins, view)}</div>
    ${spots.length
      ? `<div class="list room-list">${spots.map((sp, i) => `
          <div class="row spot"><span class="num">${i + 1}</span>
            <div class="spot-things">${sp.things.map((t) => thingLine(t, sp.things.length === 1)).join('')}</div>
          </div>`).join('')}</div>`
      : `<p class="empty">Nothing in the manual for this room.</p>`}`;
}

// Things that have a spot on the map (only these are found by the map search).
const mappedThings = () => content.things.filter((t) => (t.pins ?? []).length);

// Does this thing have more to show than where it is? Decided automatically from its file:
// a photo, video, app, related problems, breakers, parts, or being in "How things work".
// Simple stored things like batteries or documents have none of these, so no page of their own;
// as soon as one is added to the file, the thing gets a page and becomes tappable everywhere.
const hasPage = (t) => Boolean(t.photo || (t.photos ?? []).length || t.video || t.app || t.how
  || (t.problems ?? []).length || t.breakers || (t.parts ?? []).length);

// Map search results: only things with a spot on the map, updated as she types.
// Tapping one shows it on the map below; the search and the results stay.
function showMapResults(query) {
  const box = document.getElementById('map-results');
  if (!query.trim()) { box.innerHTML = ''; return; }
  const mapped = new Set(mappedThings().map((t) => t.id));
  const found = search(mapIndex, query, 20).filter((e) => mapped.has(e.id));
  box.innerHTML = found.length
    ? `<div class="list map-results">${found.map((e) => {
        const t = byId(content.things, e.id);
        return `<button type="button" class="row row-thing" data-pick="${t.id}">${icon('thing')}<span><b>${esc(t.name)}</b><small>${esc(t.where)}</small></span></button>`;
      }).join('')}</div>`
    : `<p class="empty">Nothing found. Try another word, in English or Czech.</p>`;
  for (const btn of box.querySelectorAll('[data-pick]')) btn.addEventListener('click', () => pickOnMap(btn.dataset.pick));
}

// Show one thing on the main map: its pins, its rooms highlighted, and a line saying where it is.
function pickOnMap(id) {
  const t = byId(content.things, id);
  if (!t) return;
  for (const btn of document.querySelectorAll('[data-pick]')) btn.classList.toggle('picked', btn.dataset.pick === id);
  document.activeElement?.blur(); // closes the phone keyboard so the map is visible
  const rooms = [...new Set([...(t.rooms ?? []), ...(t.pins ?? []).map(roomOf).filter(Boolean)])];
  // One name tag, above the highest pin (several tags would overlap); with a page,
  // the tag opens it ("Router ›"). The other pins are plain.
  const link = hasPage(t) ? `#/thing/${t.id}` : null;
  const all = t.pins ?? [];
  const top = all.reduce((best, p) => (p[1] < best[1] ? p : best), all[0]);
  const pins = all.map((at) => (at === top ? { at, label: t.name, link } : at));
  document.getElementById('map-main').innerHTML = floorplan(rooms, true, pins);
  wireRooms();
  // Name and place are shown here only if they aren't already in the highlighted result above
  // (e.g. when coming from the Home search). Short notes and the "More about it" button always show.
  const inResults = Boolean(document.querySelector(`[data-pick="${id}"]`));
  const note = t.body && !hasPage(t) ? `<p class="body">${esc(t.body)}</p>` : '';
  document.getElementById('map-picked').innerHTML = `
    <div class="picked-info">
      ${inResults ? '' : `<p class="where">${icon('thing')}<span>${esc(t.name)}<small>${esc(t.where)}</small></span></p>`}
      ${note}
    </div>`;
  document.getElementById('map-main').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Tapping a room on the map opens that room.
function wireRooms() {
  for (const room of view.querySelectorAll('.plan.interactive [id^="room-"]')) {
    room.addEventListener('click', () => { location.hash = `#/map/${room.id.slice(5)}`; });
  }
}

function thingScreen(id) {
  const t = byId(content.things, id);
  if (!t) return notFound();
  const photos = t.photos ?? (t.photo ? [t.photo] : []);
  const problems = (t.problems ?? []).map((p) => byId(content.problems, p));
  return `
    <header class="top sub"><a class="back" href="javascript:history.back()">‹ Back</a><h1>${esc(t.name)}</h1></header>
    ${t.where ? `<p class="where">${icon('thing')}<span>${esc(t.where)}</span></p>` : ''}
    ${photos.map((p) => photoBlock(p, t.name)).join('')}
    ${bodyText(t.body)}
    ${(t.parts ?? []).length ? `<div class="list">${t.parts.map((id) => byId(content.things, id)).map((x) => `<a class="row row-thing" href="#/thing/${x.id}">${icon('thing')}<span><b>${esc(x.name)}</b><small>${esc(x.where)}</small></span></a>`).join('')}</div>` : ''}
    ${t.breakers ? `<h2>What each breaker does</h2><table class="breakers">${t.breakers.map((b) => `<tr><th>${esc(b.no)}</th><td>${esc(b.en)}<small>${esc(b.cs)}</small></td></tr>`).join('')}</table>` : ''}
    ${videoBlock(t.video, t.name)}
    ${t.app ? `<a class="btn btn-main" href="${esc(t.app.link)}" target="_blank" rel="noopener">${icon('app')}<span>Open the ${esc(t.app.name)} app</span></a>` : ''}
    ${problems.length ? `<div class="list related">${problems.map((p) => `<a class="btn btn-problem" href="#/guide/${p.id}">${icon('problem')}<span>${esc(p.title)}</span></a>`).join('')}</div>` : ''}
    ${(t.rooms ?? []).length || (t.pins ?? []).length ? `<h2>On the map</h2><a href="#/map/${t.rooms?.[0] ?? roomOf(t.pins[0])}" class="mini">${floorplan(t.rooms ?? [], false, t.pins ?? [])}</a>` : ''}`;
}

function guideScreen(id, stepPart) {
  const g = byId(content.problems, id);
  if (!g) return notFound();
  // The bottom tab bar is hidden inside guides (more room for the photo), so Home sits up here.
  const back = `<div class="guide-links"><a class="back" href="javascript:history.back()">‹ Back</a><a class="back" href="#/">Home</a></div>`;

  // A question screen: one big question, one button per answer.
  if (g.question) {
    return `
      <header class="top sub guide">${back}<p class="kicker">${esc(g.title)}</p></header>
      <h1 class="step-text">${esc(g.question)}</h1>
      ${g.hint ? `<div class="note"><p>${richText(g.hint)}</p></div>` : ''}
      <div class="q-photo">${photoBlock(g.photo, g.hint ?? g.question)}</div>
      <div class="list">${g.answers.map((a) => `<a class="btn btn-main" href="#/guide/${a.go}">${esc(a.label)}</a>`).join('')}</div>`;
  }

  // The call at the end counts as the last step, so "Step 1 of 2" when there is one step and a call.
  const calls = (g.call ?? []).map((c) => byId(content.contacts, c));
  const total = g.steps.length + (calls.length ? 1 : 0);
  const progress = (n) => `
    <div class="progress" aria-label="Step ${n} of ${total}">
      <span>Step ${n} of ${total}</span>
      <div class="bar"><i style="width:${(n / total) * 100}%"></i></div>
    </div>`;

  // Finished: nothing more to do. The guide can set its own text ("done-text:"), e.g. for Locked out.
  if (stepPart === 'fixed') {
    const text = g['done-text'] ?? 'All fixed.';
    return `
      <header class="top sub guide">${back}<p class="kicker">${esc(g.title)}</p></header>
      <h1 class="step-text">${text}</h1>
      ${dogBlock()}
      <a class="btn btn-main" href="#/">Back to home</a>`;
  }

  // "What to say": the opening sentences for the call, in big letters, with the call button on top.
  // Built from three parts: the company's greeting, this guide's problem, the company's policy number.
  if (stepPart?.startsWith('say-')) {
    const c = byId(content.contacts, stepPart.slice(4));
    if (!c || !g.say) return notFound();
    // "say" is one text, or a list when there are versions to choose from (she says the one that fits).
    const versions = Array.isArray(g.say) ? g.say : [g.say];
    const problem = versions.map((v) => `<p>${esc(v)}</p>`).join('<p class="or">or</p>');
    return `
      <header class="top sub guide">${back}<p class="kicker">${esc(g.title)}</p></header>
      <h1 class="step-text">What to say</h1>
      ${callButton(c)}
      <div class="script">
        <p>${esc(c['say-intro'])}</p>
        ${problem}
        ${c['say-policy'] ? `<p>${esc(c['say-policy'])}</p>` : ''}
      </div>`;
  }

  // Outage: nothing she can do. "wait-report" (outage not listed anywhere yet) also offers,
  // as an option, the number to report it to (set by "report:" in the guide file).
  if (stepPart === 'wait' || stepPart === 'wait-report') {
    const r = stepPart === 'wait-report' ? g.report : null;
    return `
      <header class="top sub guide">${back}<p class="kicker">${esc(g.title)}</p></header>
      <h1 class="step-text">${stepPart === 'wait-report'
        // Not listed anywhere, but the neighbours have it too.
        ? "It's the whole building. Nothing to fix at home, but you can try and report the issue."
        // Listed on the company's outage page.
        : "It's a known outage and hopefully they're working on it."}</h1>
      ${dogBlock()}
      ${r ? `
        <div class="call-card">
          <p class="ask">Optional: you can report it.</p>
          <h2>${esc(r.name)}</h2>
          <a class="btn btn-call" href="${telLink(r.phone)}">${icon('contact')}<span>Call ${esc(r.phone)}</span></a>
        </div>` : ''}
      <a class="btn btn-main" href="#/">Back to home</a>`;
  }

  // Last step: who to call. One company per screen: "end" shows the first one,
  // "backup" the second. The heading says who and why, e.g. "Call PRE. They'll send a locksmith."
  // ("nick:" in the contact file, "call-why:" in the guide file).
  if (stepPart === 'end' || stepPart === 'backup') {
    const isBackup = stepPart === 'backup' && calls.length > 1;
    const c = calls[isBackup ? 1 : 0];
    const nick = (x) => x.nick ?? x.name;
    const why = g['call-why'] ? ` ${esc(g['call-why'])}` : '';
    return `
      <header class="top sub guide">${back}<p class="kicker">${esc(g.title)}</p></header>
      ${c ? `
        ${progress(total)}
        <h1 class="step-text">Call ${esc(nick(c))}${isBackup ? ' instead' : ''}.${why}</h1>
        ${contactCall(c, g)}
        ${!isBackup && calls.length > 1 ? `<a class="btn btn-quiet" href="#/guide/${id}/backup">${esc(nick(c))} can't help? Call ${esc(nick(calls[1]))}</a>` : ''}` : `
        <h1 class="step-text">That's all the steps.</h1>`}
      <a class="btn btn-quiet" href="#/">Back to home</a>`;
  }

  // One step per screen.
  const n = Math.min(Math.max(parseInt(stepPart || '1', 10), 1), g.steps.length);
  const s = g.steps[n - 1];
  // After the last step: the call step, or Home when the guide has no one to call.
  const next = n < g.steps.length ? `#/guide/${id}/${n + 1}` : calls.length ? `#/guide/${id}/end` : '#/';
  // Where an answer to a step's question goes: next step, a given step ("step:7"),
  // another guide ("guide:no-electricity"), or a finish/call screen of this guide.
  const answerLink = (go) => go === 'next' ? next
    : go.startsWith('step:') ? `#/guide/${id}/${go.slice(5)}`
    : go.startsWith('guide:') ? `#/guide/${go.slice(6)}`
    : `#/guide/${id}/${go}`;
  return `
    <header class="top sub guide">${back}<p class="kicker">${esc(g.title)}</p></header>
    ${progress(n)}
    <p class="step-text">${richText(s.text)}</p>
    ${s.lookFor ? `<div class="note"><b>What to look for</b><p>${richText(s.lookFor)}</p></div>` : ''}
    ${s.ifNot ? `<div class="note"><b>If it doesn't work</b><p>${richText(s.ifNot)}</p></div>` : ''}
    ${photoBlock(s.photo, s.text)}
    ${videoBlock(s.video, s.text)}
    ${s.call ? contactCall(byId(content.contacts, s.call), g) : ''}
    ${s.see ? seeButton(byId(content.things, s.see)) : ''}
    ${s.map ? `<a class="btn" href="#/map/at/${s.map}">${icon('map')}<span>${esc(byId(content.things, s.map).name)}<small>Show on the map</small></span></a>` : ''}
    ${s.ask ? `
      <div class="step-nav">
        <h2 class="end-q">${esc(s.ask)}</h2>
        <div class="list">
          ${[s.yes, s.no].map((a) => `<a class="btn btn-main" href="${answerLink(a.go)}">${esc(a.label)}</a>`).join('')}
        </div>
      </div>` : n === g.steps.length && END_QUESTIONS[g.end] ? `
      <div class="step-nav">
        <h2 class="end-q">${END_QUESTIONS[g.end].q}</h2>
        <div class="list">
          <a class="btn btn-main" href="#/guide/${id}/${g.end === 'outage' ? 'wait' : 'fixed'}">${END_QUESTIONS[g.end].yes}</a>
          <a class="btn btn-main" href="#/guide/${id}/end">${END_QUESTIONS[g.end].no}</a>
        </div>
      </div>` : `
    <div class="step-nav">
      <a class="btn btn-main btn-next" href="${next}">${n < g.steps.length || calls.length ? 'Done → Next' : 'Done'}</a>
    </div>`}`;
}

// "see:" in a step: a button to a thing. Things with their own page open it
// (e.g. manual control of a thermostat); simple things open the map with that spot marked.
function seeButton(t) {
  return hasPage(t)
    ? `<a class="btn" href="#/thing/${t.id}">${icon('how')}<span>${esc(t.name)}<small>How to use it by hand</small></span></a>`
    : `<a class="btn" href="#/map/at/${t.id}">${icon('map')}<span>${esc(t.name)}<small>Show on the map</small></span></a>`;
}

// The question at the end of a guide (set by "end:" in its file), so it's always clear
// what happens next: "yes" finishes, "no" shows who to call.
const END_QUESTIONS = {
  works: { q: 'Does it work now?', yes: 'Yes, it works', no: 'No, still not working' },
  outage: { q: 'Is there an outage in our area?', yes: "Yes, there's an outage", no: 'No outage listed' },
  helped: { q: 'Did it help?', yes: 'Yes', no: 'No' },
};

// The big call button for one company (or a quiet note if the number isn't in yet).
function callButton(c) {
  return c.phone
    ? `<a class="btn btn-call" href="${telLink(c.phone)}">${icon('contact')}<span>Call ${esc(c.phone)}</span></a>`
    : `<div class="btn btn-quiet disabled">${icon('contact')}<span>Number coming soon</span></div>`;
}

// One company in one card: its name, a big call button, and the number they'll ask for.
// Only the policy number is shown here (other details stay on the Contacts page),
// so every number on screen clearly belongs to the company above it.
// "g" is the guide the card sits in: when the guide and the company both have a script,
// a "What to say" button opens it.
function contactCall(c, g) {
  const policy = (c.details ?? []).find((d) => /policy/i.test(d.label));
  const say = g?.say && c['say-intro']
    ? `<a class="btn" href="#/guide/${g.id}/say-${c.id}">${icon('how')}<span>What to say<small>In Czech, to read out</small></span></a>`
    : '';
  return `
    <div class="call-card">
      <h2>${esc(c.name)}</h2>
      ${callButton(c)}
      ${say}
      ${policy ? `<p class="ask">They will ask for:</p><p class="detail"><small>Policy number (číslo pojistné smlouvy)</small><b>${esc(policy.value)}</b></p>` : ''}
    </div>`;
}

// "What to say" for a contact on its own (e.g. booking the vet): call button on top, script below.
function contactSayScreen(id) {
  const c = byId(content.contacts, id);
  if (!c?.say) return notFound();
  return `
    <header class="top sub"><a class="back" href="javascript:history.back()">‹ Back</a><p class="kicker">${esc(c.name)}</p></header>
    <h1 class="step-text">What to say</h1>
    ${callButton(c)}
    <div class="script"><p>${esc(c.say)}</p></div>`;
}

// Pieces shared by the Contacts list and a contact's own page.
const sayButton = (c) => c.say ? `<a class="btn" href="#/contacts/say/${c.id}">${icon('how')}<span>What to say<small>In Czech, to read out</small></span></a>` : '';
const emailButton = (c) => c.email ? `<a class="btn btn-quiet" href="mailto:${esc(c.email)}">${icon('mail')}<span>Email<small>${esc(c.email)}</small></span></a>` : '';
const contactLinks = (c) => [c.link, ...(c.links ?? [])].filter(Boolean)
  .map((l) => `<a class="btn btn-quiet" href="${esc(l.url)}" target="_blank" rel="noopener">${icon(/maps/.test(l.url) ? 'map' : 'app')}<span>${esc(l.label)} ↗</span></a>`).join('');
// Does a contact have more than its card shows (numbers, opening hours, links...)? Then it gets "Details".
const hasMore = (c) => Boolean((c.details ?? []).length || (c.body ?? '').trim() || c.link || (c.links ?? []).length);
const groupId = (name) => 'g-' + name.toLowerCase().replace(/[^a-z]+/g, '-');

// Contacts list: grouped (Fix-it, Key, SVJ, Doctor & vet; set by "group:" in each file),
// with buttons on top that jump to a group. Each card is short: name, one line, call,
// "What to say". Numbers and the rest are on the contact's own page ("Details").
function contactsScreen() {
  const groups = [...new Set(content.contacts.map((c) => c.group ?? 'Other'))];
  return `
    <header class="top"><h1>Contacts</h1></header>
    <nav class="chips">${groups.map((g) => `<a class="chip" href="#/contacts#${groupId(g)}">${esc(g)}</a>`).join('')}</nav>
    ${groups.map((g) => `
      <h3 class="group-head" id="${groupId(g)}">${esc(g)}</h3>
      ${content.contacts.filter((c) => (c.group ?? 'Other') === g).map((c) => `
        <article class="card" id="${c.id}">
          <h2>${esc(c.name)}</h2>
          <p class="role">${esc(c.short ?? c.role)}</p>
          ${c.phone ? callButton(c) : ''}
          ${sayButton(c)}
          ${c.phone ? '' : emailButton(c)}
          ${hasMore(c) ? `<a class="btn btn-quiet details-btn" href="#/contacts/${c.id}">Details${icon('chevron')}</a>` : ''}
        </article>`).join('')}`).join('')}`;
}

// A contact's own page: everything about it.
function contactScreen(id) {
  const c = byId(content.contacts, id);
  if (!c) return notFound();
  return `
    <header class="top sub"><a class="back" href="javascript:history.back()">‹ Back</a><h1>${esc(c.name)}</h1></header>
    <div class="stack">
      <p class="role">${esc(c.role)}</p>
      ${c.phone ? callButton(c) : ''}
      ${sayButton(c)}
      ${emailButton(c)}
      ${(c.details ?? []).map((d) => `<p class="detail"><small>${esc(d.label)}</small><b>${esc(d.value)}</b></p>`).join('')}
      ${(c.body ?? '').trim() ? `<h2 class="group-head">More</h2>${bodyText(c.body)}` : ''}
      ${contactLinks(c)}
    </div>`;
}

// ---------- Pin page (for Lukas, not linked anywhere: open #/pins) ----------
// Pick a thing, tap the map where it is (several taps for things in several places).
// The text box at the bottom collects the result; copy it and send it to Claude,
// who adds it to the content files as "pins: [[x, y], ...]".

const PIN_STORAGE = 'flatearth-pins';
function loadPins() {
  try { return JSON.parse(localStorage.getItem(PIN_STORAGE)) || {}; } catch { return {}; }
}
function savePins(pins) {
  try { localStorage.setItem(PIN_STORAGE, JSON.stringify(pins)); } catch { /* not saved; the text box still has it */ }
}

function pinsScreen() {
  return `
    <header class="top"><h1>Place pins</h1>
      <p class="hint">1. Pick a thing. 2. Tap the map where it is (tap again for a second spot). 3. Copy the text at the bottom and send it to Claude.</p></header>
    <select id="pin-thing" class="pick">${content.things.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select>
    <div id="pin-map"></div>
    <div class="list two">
      <button class="btn btn-quiet" id="pin-undo">Undo last pin</button>
      <button class="btn btn-quiet" id="pin-clear">Clear this thing</button>
    </div>
    <h2>Result</h2>
    <textarea id="pin-out" class="out" readonly rows="8"></textarea>
    <button class="btn btn-main" id="pin-copy">Copy result</button>`;
}

function wirePins() {
  const pins = loadPins();
  const select = document.getElementById('pin-thing');
  const out = document.getElementById('pin-out');
  const draw = () => {
    const id = select.value;
    const thing = byId(content.things, id);
    // Pins of the chosen thing; its rooms are highlighted to help.
    document.getElementById('pin-map').innerHTML = floorplan(thing.rooms ?? [], true, pins[id] ?? []);
    out.value = Object.entries(pins).filter(([, list]) => list.length)
      .map(([tid, list]) => `${tid}: ${list.map(([x, y]) => `[${x}, ${y}]`).join(', ')}`).join('\n');
    // Turn a tap on the screen into floor plan coordinates.
    const svg = document.querySelector('#pin-map svg');
    svg.addEventListener('click', (event) => {
      const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(svg.getScreenCTM().inverse());
      (pins[id] ??= []).push([Math.round(point.x), Math.round(point.y)]);
      savePins(pins);
      draw();
    });
  };
  select.addEventListener('change', draw);
  document.getElementById('pin-undo').addEventListener('click', () => { pins[select.value]?.pop(); savePins(pins); draw(); });
  document.getElementById('pin-clear').addEventListener('click', () => { delete pins[select.value]; savePins(pins); draw(); });
  document.getElementById('pin-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(out.value); document.getElementById('pin-copy').textContent = 'Copied ✓'; }
    catch { out.select(); } // If copying isn't allowed, select the text so it can be copied by hand.
  });
  draw();
}

function notFound() {
  return `<header class="top"><h1>Not found</h1></header><a class="btn btn-quiet" href="#/">Back to home</a>`;
}

// ---------- Switching screens ----------

function render() {
  const [path, anchor] = location.hash.replace(/^#/, '').split('#');
  const parts = (path || '/').split('/').filter(Boolean);
  const [screen, a, b] = parts;
  let html, tab;
  if (!screen) { html = home(); tab = 'home'; }
  else if (screen === 'map') { html = mapScreen(a, b); tab = 'map'; }
  else if (screen === 'thing') {
    html = thingScreen(a);
    // Things from "How things work" (and the thermostats inside Floor heating) keep that tab lit.
    const how = howThings().some((t) => t.id === a || (t.parts ?? []).includes(a));
    tab = how ? 'how' : 'map';
  }
  else if (screen === 'how') { html = howScreen(); tab = 'how'; }
  else if (screen === 'guide') { html = guideScreen(a, b); tab = 'home'; }
  else if (screen === 'contacts') { html = a === 'say' ? contactSayScreen(b) : a ? contactScreen(a) : contactsScreen(); tab = 'contacts'; }
  else if (screen === 'pins') { html = pinsScreen(); tab = 'map'; }
  else { html = notFound(); }

  view.innerHTML = html;
  document.body.dataset.screen = screen || 'home';
  for (const t of document.querySelectorAll('.tabbar a')) t.classList.toggle('on', t.dataset.tab === tab);
  loadMedia();
  fitStep();
  wireZoom();

  // Screen-specific wiring.
  if (!screen) {
    const q = document.getElementById('q');
    q.addEventListener('input', () => showResults(q.value));
  }
  if (screen === 'map' && (!a || a === 'at')) {
    const mq = document.getElementById('mq');
    mq.addEventListener('input', () => showMapResults(mq.value));
    if (a === 'at') pickOnMap(b);
  }
  if (screen === 'map') {
    wireRooms();
  }
  if (screen === 'pins') wirePins();
  if (anchor) document.getElementById(anchor)?.scrollIntoView();
  else window.scrollTo(0, 0);
}

// ---------- Guide steps on small screens ----------
// The Done/Next buttons are pinned to the bottom of the screen (see .step-nav in style.css).
// This makes the page end with empty space as tall as those buttons, so nothing hides behind them,
// and shrinks the photo (or video) to the height that's left, so the step text, the whole photo
// and the buttons all fit on one screen without scrolling.
function fitStep() {
  const nav = view.querySelector('.step-nav');
  view.style.paddingBottom = nav ? `${nav.offsetHeight + 16}px` : '';
  const media = view.querySelector('.photo img, .photo video');
  if (!nav || !media) return;
  const top = media.getBoundingClientRect().top + window.scrollY; // where the photo starts on the page
  const free = window.innerHeight - top - nav.offsetHeight - 24;  // screen height left for it
  media.style.maxHeight = `${Math.max(free, 180)}px`;             // never smaller than 180 px
}
// The phone turned or the browser bar grew/shrank: fit again.
window.addEventListener('resize', () => fitStep());

// Tap a photo to see it full screen; tap again to close.
function wireZoom() {
  document.querySelector('.zoom')?.remove(); // a full-screen photo left open from the screen before
  for (const img of view.querySelectorAll('.photo img')) {
    img.addEventListener('click', () => {
      const box = document.createElement('div');
      box.className = 'zoom';
      box.innerHTML = `<img src="${img.src}" alt=""><span>Tap to close</span>`;
      box.addEventListener('click', () => box.remove());
      document.body.append(box);
    });
  }
}

export function start(unlockedContent, unlockedKey) {
  content = unlockedContent;
  key = unlockedKey;
  homeDog = randomDogFace();
  index = buildIndex(content);
  mapIndex = buildMapIndex(content);
  window.addEventListener('hashchange', render);
  document.querySelector('.tabbar').hidden = false;
  render();
}
