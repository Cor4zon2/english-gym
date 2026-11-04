const IRREGULAR: Record<string, string[]> = {
  be: ['am', 'is', 'are', 'was', 'were', 'been', 'being'],
  bring: ['brought'],
  buy: ['bought'],
  catch: ['caught'],
  come: ['came'],
  deal: ['dealt'],
  do: ['did', 'done', 'does'],
  find: ['found'],
  get: ['got', 'gotten'],
  give: ['gave', 'given'],
  go: ['went', 'gone', 'goes'],
  have: ['had', 'has'],
  hold: ['held'],
  keep: ['kept'],
  know: ['knew', 'known'],
  leave: ['left'],
  make: ['made'],
  run: ['ran'],
  see: ['saw', 'seen'],
  set: [],
  take: ['took', 'taken'],
  think: ['thought'],
  throw: ['threw', 'thrown'],
  withdraw: ['withdrew', 'withdrawn'],
};

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Regex alternatives for the inflected forms of a single word. */
function forms(word: string): string {
  const w = word.toLowerCase();
  const alts = new Set<string>([`${esc(w)}(?:s|es|d|ed|ing|ly|er|est)?`]);
  if (w.length > 3 && w.endsWith('e')) alts.add(`${esc(w.slice(0, -1))}(?:ed|ing|er|est)`);
  if (/[^aeiou]y$/.test(w)) alts.add(`${esc(w.slice(0, -1))}(?:ies|ied|ier|iest|ily)`);
  if (/[^aeiou][aeiou][bdgklmnprt]$/.test(w)) {
    alts.add(`${esc(w)}${esc(w.slice(-1))}(?:ed|ing|er|est)`);
  }
  for (const f of IRREGULAR[w] ?? []) alts.add(esc(f));
  return `(?:${[...alts].join('|')})`;
}

/** Replace the word or phrase (with simple inflections) in an example with a blank. */
export function blankOut(example: string, word: string): string {
  const parts = word.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return example;
  // Inflect the first word only ("gave up", "looking forward to").
  const pattern = [forms(parts[0]), ...parts.slice(1).map(esc)].join('\\s+');
  return example.replace(new RegExp(`\\b${pattern}\\b`, 'gi'), '___');
}
