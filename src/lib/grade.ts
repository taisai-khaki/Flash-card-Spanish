/**
 * The answer checker.
 *
 * This is what lets a flash card hide its answer: the user types (or dictates)
 * their own Mexican-Spanish translation and this module decides whether it is
 * right, without ever showing the stored answer first.
 *
 * Two modes, switchable in Settings:
 *   strict — the answer must match the stored one exactly once case,
 *            accents, punctuation, articles and spacing are ignored.
 *   smart  — additionally accepts synonyms (see src/data/synonyms.es.ts),
 *            plural/singular differences, number words ("tres" == "3") and
 *            small typos, and explains *how close* it was.
 */

import { SYNONYM_GROUPS } from '../data/synonyms.es';
import {
  SPANISH_NUMBER_WORDS,
  SPANISH_STOPWORDS,
  foldPlural,
  guardAccentedPronouns,
  normalizeUnicode,
  similarity,
  stripDiacritics,
  tokenize,
} from './text';

export type GradeMode = 'strict' | 'smart';
export type Verdict = 'correct' | 'close' | 'incorrect' | 'empty';

export interface DiffToken {
  type: 'same' | 'extra' | 'missing';
  text: string;
}

export interface GradeResult {
  verdict: Verdict;
  /** 0..1 confidence that the answer means the same thing. */
  score: number;
  /** Short human explanation, e.g. "matched the synonym «carro»". */
  reason: string;
  /** The stored answer variant that scored best (used to explain the result). */
  matchedAgainst: string;
  diff: DiffToken[];
}

/** Word counts above this are compared as whole sentences, not word by word. */
const MAX_PHRASE_TOKENS = 5;

/** Thresholds used by the smart mode. */
export const SMART_CORRECT_AT = 0.9;
export const SMART_CLOSE_AT = 0.5;

let phraseMap: Map<string, string> | null = null;

/**
 * Builds the "everything that means the same thing maps here" table.
 * Keys are diacritic-free lowercase phrases, values are canonical tokens.
 */
function getPhraseMap(): Map<string, string> {
  if (phraseMap) return phraseMap;
  const map = new Map<string, string>();

  for (const group of SYNONYM_GROUPS) {
    const canonical = stripDiacritics(
      normalizeUnicode(group.canonical),
    ).trim();
    if (!canonical) continue;
    map.set(canonical, canonical);
    for (const variant of group.variants) {
      const key = stripDiacritics(normalizeUnicode(variant)).trim();
      if (!key) continue;
      map.set(key, canonical);
    }
  }

  phraseMap = map;
  return map;
}

/** Longest phrase in the dictionary, used to bound the n-gram search. */
function maxPhraseLength(): number {
  let max = 1;
  for (const key of getPhraseMap().keys()) {
    const words = key.split(' ').length;
    if (words > max) max = words;
  }
  return Math.min(max, MAX_PHRASE_TOKENS);
}

export interface PhraseRewrite {
  from: string;
  to: string;
}

/**
 * Replaces known phrases with their canonical token, greedily, longest first.
 * "agua de cola" -> "refresco", but a lonely "cola" is left alone.
 * The rewrites are kept so the UI can say *why* an answer was accepted.
 */
function collapsePhrases(tokens: string[]): { tokens: string[]; rewrites: PhraseRewrite[] } {
  const map = getPhraseMap();
  const maxLen = maxPhraseLength();
  const out: string[] = [];
  const rewrites: PhraseRewrite[] = [];

  for (let i = 0; i < tokens.length; ) {
    let matched = false;
    for (let n = Math.min(maxLen, tokens.length - i); n >= 1; n--) {
      const key = tokens.slice(i, i + n).join(' ');
      const canonical = map.get(key);
      if (canonical !== undefined) {
        if (key !== canonical) rewrites.push({ from: key, to: canonical });
        out.push(canonical);
        i += n;
        matched = true;
        break;
      }
    }
    if (!matched) {
      out.push(tokens[i]);
      i += 1;
    }
  }
  return { tokens: out, rewrites };
}

/** "tres" -> "3", "primero" -> "1" so number words and digits compare equal. */
function canonicalNumbers(tokens: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const current = SPANISH_NUMBER_WORDS[tokens[i]] ?? tokens[i];
    // "treinta y dos" -> "32"
    const next = tokens[i + 1];
    const afterNext = SPANISH_NUMBER_WORDS[tokens[i + 2]];
    if (
      next === 'y' &&
      afterNext !== undefined &&
      /^\d/.test(current) &&
      current.length <= 3
    ) {
      const tens = Number(current);
      const units = Number(afterNext);
      if (tens > 1 && tens % 10 === 0 && units > 0 && units < 10) {
        out.push(String(tens + units));
        i += 2;
        continue;
      }
    }
    out.push(current);
  }
  return out;
}

export interface NormalizedAnswer {
  /** Content words without plural folding: what strict mode compares. */
  loose: string;
  /** Content words, canonicalised and plural-folded: used for smart matching. */
  content: string[];
  /** Content words before plural folding (for nicer diffs). */
  display: string[];
  /** Original words, in order, for the diff view. */
  original: string[];
  /** Which words the synonym table rewrote, e.g. coche → carro. */
  rewrites: PhraseRewrite[];
}

/** Runs the full normalisation pipeline over a raw Spanish answer. */
export function normalizeAnswer(raw: string): NormalizedAnswer {
  const original = tokenize(stripDiacritics(guardAccentedPronouns(normalizeUnicode(raw))));

  // Strict comparison uses the words as written — no synonym table, no
  // number folding — so "coche" can never quietly pass for "carro".
  const loose = original.filter((token) => !SPANISH_STOPWORDS.has(token)).join(' ');

  const { tokens: collapsed, rewrites } = collapsePhrases(original);
  const numbered = canonicalNumbers(collapsed);
  const content = numbered
    .filter((token) => !SPANISH_STOPWORDS.has(token))
    .map((token) => foldPlural(token));

  return { loose, content, display: numbered, original, rewrites };
}

/** Multiset intersection size between two token lists. */
function multisetOverlap(a: string[], b: string[]): { matched: number; leftover: string[] } {
  const pool = [...b];
  const leftover: string[] = [];
  let matched = 0;
  for (const token of a) {
    const index = pool.indexOf(token);
    if (index >= 0) {
      pool.splice(index, 1);
      matched += 1;
    } else {
      leftover.push(token);
    }
  }
  return { matched, leftover };
}

interface VariantScore {
  score: number;
  coveredAll: boolean;
  extra: string[];
  missing: string[];
}

function scoreAgainst(user: NormalizedAnswer, reference: NormalizedAnswer): VariantScore {
  const { matched, leftover } = multisetOverlap(user.content, reference.content);
  const referenceCount = reference.content.length;
  const userCount = user.content.length;

  const coverage = referenceCount === 0 ? (userCount === 0 ? 1 : 0) : matched / referenceCount;
  const extraRatio = userCount === 0 ? 0 : leftover.length / userCount;
  // Extra words are penalised, but far less than missing ones: a slightly
  // longer sentence is much more often right than a slightly wrong one.
  const tokenScore = coverage * (1 - 0.3 * extraRatio);

  const charScore = similarity(user.content.join(' '), reference.content.join(' '));
  const blended = 0.5 * tokenScore + 0.5 * charScore;

  const coveredAll = referenceCount > 0 && matched === referenceCount;
  const score = coveredAll && leftover.length === 0 ? 1 : Math.max(tokenScore, blended);

  const referenceLeftover = multisetOverlap(reference.content, user.content).leftover;

  return { score, coveredAll, extra: leftover, missing: referenceLeftover };
}

/** Longest-common-subsequence word diff, so the UI can point at the mistake. */
export function wordDiff(user: string[], reference: string[]): DiffToken[] {
  const n = user.length;
  const m = reference.length;
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] =
        user[i] === reference[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const out: DiffToken[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (user[i] === reference[j]) {
      out.push({ type: 'same', text: user[i] });
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      out.push({ type: 'extra', text: user[i] });
      i++;
    } else {
      out.push({ type: 'missing', text: reference[j] });
      j++;
    }
  }
  while (i < n) out.push({ type: 'extra', text: user[i++] });
  while (j < m) out.push({ type: 'missing', text: reference[j++] });
  return out;
}

export interface GradeInput {
  /** What the learner typed or said. */
  answer: string;
  /** The stored Mexican-Spanish answer, hidden until the check is done. */
  reference: string;
  /** Extra accepted phrasings from the CSV's "also accept" column. */
  alternates?: string[];
  mode?: GradeMode;
}

function describe(
  userRaw: string,
  referenceRaw: string,
  user: NormalizedAnswer,
  reference: NormalizedAnswer,
): string {
  if (user.loose === reference.loose) return 'exact match';

  // The synonym table rewrote something the learner typed: say what was
  // accepted rather than pretending the words simply matched.
  if (user.rewrites.length > 0) {
    const accepted = [...new Set(user.rewrites.map((rewrite) => rewrite.to))];
    return `accepted alternative: ${accepted.join(', ')}`;
  }
  if (user.content.length !== reference.content.length) {
    return `you wrote ${user.content.length} content word${
      user.content.length === 1 ? '' : 's'
    }, the answer has ${reference.content.length}`;
  }
  if (normalizeUnicode(userRaw) !== normalizeUnicode(referenceRaw)) {
    return 'only accents, punctuation or articles differ — counts as correct';
  }
  return 'small differences in spelling';
}

/**
 * Grades the learner's answer against the stored one.
 * Never throws; an empty answer comes back as `verdict: 'empty'`.
 */
export function gradeAnswer(input: GradeInput): GradeResult {
  const mode: GradeMode = input.mode ?? 'smart';
  const answerRaw = (input.answer ?? '').trim();
  const referenceRaw = (input.reference ?? '').trim();

  if (!answerRaw) {
    return {
      verdict: 'empty',
      score: 0,
      reason: 'No answer yet.',
      matchedAgainst: referenceRaw,
      diff: [],
    };
  }

  const variants = [referenceRaw, ...(input.alternates ?? [])].filter(Boolean);
  const user = normalizeAnswer(answerRaw);

  let best: { variant: string; normalized: NormalizedAnswer; result: VariantScore } | null = null;
  let strictHit: string | null = null;

  for (const variant of variants) {
    const normalized = normalizeAnswer(variant);
    if (strictHit === null && user.loose === normalized.loose) {
      strictHit = variant;
    }
    const result = scoreAgainst(user, normalized);
    if (!best || result.score > best.result.score) {
      best = { variant, normalized, result };
    }
  }

  if (!best) {
    return {
      verdict: 'incorrect',
      score: 0,
      reason: 'This card has no stored answer to check against.',
      matchedAgainst: '',
      diff: [],
    };
  }

  const diff = wordDiff(user.display, best.normalized.display);

  // Strict mode: only a normalised exact match counts, nothing else.
  if (mode === 'strict') {
    const isExact = strictHit !== null;
    return {
      verdict: isExact ? 'correct' : 'incorrect',
      score: isExact ? 1 : best.result.score,
      reason: isExact ? 'exact match' : 'strict mode needs a word-for-word match',
      matchedAgainst: isExact ? (strictHit as string) : best.variant,
      diff,
    };
  }

  const { score, coveredAll, extra, missing } = best.result;

  if (strictHit !== null || score >= SMART_CORRECT_AT || (coveredAll && extra.length === 0)) {
    return {
      verdict: 'correct',
      score: 1,
      reason: describe(answerRaw, best.variant, user, best.normalized),
      matchedAgainst: best.variant,
      diff,
    };
  }

  if (score >= SMART_CLOSE_AT) {
    const reason =
      missing.length > 0
        ? `almost — missing: ${missing.join(', ')}`
        : extra.length > 0
          ? `almost — extra: ${extra.join(', ')}`
          : `almost (${Math.round(score * 100)}% match)`;
    return { verdict: 'close', score, reason, matchedAgainst: best.variant, diff };
  }

  return {
    verdict: 'incorrect',
    score,
    reason: missing.length > 0 ? `missing: ${missing.join(', ')}` : 'not the same meaning',
    matchedAgainst: best.variant,
    diff,
  };
}
