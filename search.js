// search.js: finds things, problems and contacts from what she types, in English or Czech.
//
// It is forgiving on purpose:
//   - Accents don't matter: "zasuvka" finds "zásuvka".
//   - Upper/lower case doesn't matter.
//   - Part of a word is enough: "pojist" finds "pojistky".
//   - Small typos are fine: "boyler" finds "boiler", "jistik" finds "jistič".
//     But typos (and matches in the middle of a word) are only a fallback: they count only when
//     no entry matches that word properly, so "veter" finds the vet and not "meter".
//   - Vague searches still work: "electricity box" finds the fuse box, because each entry has
//     a hidden list of search words (the "search:" line in its content file).

// Make text comparable: lower case, no accents, only letters and digits separated by spaces.
// "Zásuvky v obýváku!" -> "zasuvky v obyvaku"
export function normalize(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '') // split "á" into "a" + accent, then drop the accent
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// How many single-letter changes turn word a into word b (typos, swapped letters).
// Stops early and returns a big number once it's clearly more than "max".
function typoDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prevPrev = null;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      // Two neighbouring letters swapped ("boilre") counts as one change.
      if (prevPrev && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        cur[j] = Math.min(cur[j], prevPrev[j - 2] + 1);
      }
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prevPrev = prev;
    prev = cur;
  }
  return prev[b.length];
}

// How well one typed word matches one word of an entry (0 = not at all).
// 2 or more = a proper match (whole word or its start); below 2 = middle of a word or a typo.
function wordScore(typed, word) {
  if (typed === word) return 3;
  if (word.startsWith(typed) && typed.length >= 2) return 2.5;        // "pojist" -> "pojistky"
  // "boilers" -> "boiler": only for longer words and short endings, so "downstairs" doesn't match "down".
  if (typed.startsWith(word) && word.length >= 5 && typed.length - word.length <= 3) return 2;
  if (typed.length >= 4 && word.includes(typed)) return 1.5;          // "fridge" in "minifridge" (not "vet" in "svetla")
  if (typed.length >= 4) {
    const allowed = typed.length >= 7 ? 2 : 1;                         // longer words may have more typos
    // Compare with the same-length start of the word too, so "zasuvk" ~ "zasuvky" and endings don't matter.
    const d = Math.min(typoDistance(typed, word, allowed), typoDistance(typed, word.slice(0, typed.length), allowed));
    if (d <= allowed) return d === 1 ? 1.5 : 1;
  }
  return 0;
}

// Build the list of searchable entries once, from the content.
// The Map search uses only things, by their name and search words (not where they are,
// not breaker labels), so "bat" doesn't bring up everything in the bathroom.
// Things outside the flat (no pin, e.g. the main breaker downstairs) aren't on the map, so they're left out.
export function buildMapIndex(content) {
  return content.things.filter((t) => (t.pins ?? []).length).map((t) => {
    const phrases = [t.name, ...(t.search ?? [])].map(normalize).filter(Boolean);
    return { type: 'thing', id: t.id, title: t.name, titleWords: normalize(t.name).split(' '), phrases,
      words: [...new Set(phrases.flatMap((p) => p.split(' ')))], weakWords: [] };
  });
}

export function buildIndex(content) {
  const entries = [];
  // "weak" words count less, so the fuse box doesn't outrank the dryer itself for "dryer".
  const add = (type, item, title, extra, weak = []) => {
    const titleWords = normalize(title).split(' ');
    const phrases = [title, ...(item.search ?? []), ...extra].map(normalize).filter(Boolean);
    const words = new Set(phrases.flatMap((p) => p.split(' ')));
    const weakWords = new Set(weak.map(normalize).flatMap((p) => p.split(' ')).filter((w) => !words.has(w)));
    entries.push({ type, id: item.id, title, titleWords, phrases, words: [...words], weakWords: [...weakWords] });
  };
  for (const p of content.problems) if (!p.hidden) add('problem', p, p.title, []);
  for (const t of content.things) {
    // The fuse box is also found by what its breakers power ("myčka", "oven"...).
    const breakerWords = (t.breakers ?? []).flatMap((b) => [b.en, b.cs]);
    add('thing', t, t.name, [t.where ?? ''], breakerWords);
  }
  for (const c of content.contacts) add('contact', c, c.name, [c.role ?? '']);
  return entries;
}

// Return the best matches for what she typed, best first (at most "limit").
export function search(index, query, limit = 8) {
  const q = normalize(query);
  if (!q) return [];
  const typedWords = q.split(' ');
  // For each typed word: does any entry match it properly? If so, typos and
  // middle-of-word matches of that word are ignored everywhere (they're only a fallback).
  const hasProper = typedWords.map((typed) => index.some((e) =>
    [...e.words, ...e.weakWords].some((w) => wordScore(typed, w) >= 2)));
  const results = [];
  for (const entry of index) {
    let score = 0, matched = 0;
    for (const [i, typed] of typedWords.entries()) {
      const min = hasProper[i] ? 2 : 0; // lowest word score that still counts
      const ok = (x) => (x >= min ? x : 0);
      let best = 0;
      for (const word of entry.words) best = Math.max(best, ok(wordScore(typed, word)));
      for (const word of entry.weakWords) best = Math.max(best, ok(wordScore(typed, word)) * 0.5);
      if (best > 0) {
        matched++;
        score += best;
        if (entry.titleWords.some((w) => wordScore(typed, w) >= 2.5)) score += 0.5; // matches in the name count a bit more
      }
    }
    if (!matched) continue;
    if (entry.phrases.some((p) => p.includes(q))) score += 2; // the whole phrase appears as typed
    results.push({ entry, matched, score });
  }
  // Entries that match more of the typed words come first, then the higher score.
  results.sort((a, b) => b.matched - a.matched || b.score - a.score);
  // Drop weak extras: keep only results that match as many words as the best one.
  const top = results.length ? results[0].matched : 0;
  return results.filter((r) => r.matched === top).slice(0, limit).map((r) => r.entry);
}
