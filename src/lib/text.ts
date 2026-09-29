/**
 * Text normalization helpers shared by the CSV parser, the answer grader and
 * the spaced-repetition scheduler.
 *
 * The goal of every function in this file is the same: turn two human written
 * Spanish sentences into the *same* token list when they mean the same thing,
 * so that "El carro es rojo.", "el carro rojo" and "CARRO ROJO!" are all
 * treated as one correct answer.
 */

const PERSIAN_DIGITS: Record<string, string> = {
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
};

const ARABIC_DIGITS: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};

const PERSIAN_LETTER_FIXES: Record<string, string> = {
  'ي': 'ی', // ARABIC YEH -> FARSI YEH
  'ى': 'ی', // ALEF MAKSURA -> FARSI YEH
  'ك': 'ک', // ARABIC KAF -> KEHEH
  'ۀ': 'ه', // HEH WITH YEH ABOVE -> HEH
  'ة': 'ه', // TEH MARBUTA -> HEH
  'أ': 'ا', // ALEF WITH HAMZA ABOVE -> ALEF
  'إ': 'ا', // ALEF WITH HAMZA BELOW -> ALEF
  'آ': 'ا', // ALEF WITH MADDA -> ALEF
  'ؤ': 'و', // WAW WITH HAMZA -> WAW
  'ئ': 'ی', // YEH WITH HAMZA -> FARSI YEH
  'ـ': ' ', // TATWEEL (kashida) -> space
};

/** Characters that carry no meaning for grading. */
const PUNCTUATION_RE = /[.,;:!?"'`´“”‘’«»()\[\]{}<>/\\|~@#$%^&*_+=\-–—…،؛؟۔¡¿]/g;

/**
 * Unicode cleanup that works for Latin *and* Persian/Arabic scripts:
 * normalises digits, folds Persian letter variants, drops Arabic
 * presentation forms, apostrophes and punctuation.
 */
export function normalizeUnicode(input: string): string {
  let out = input.normalize('NFKC').replace(/\u200c|\u200d|\ufeff/g, ' ');

  out = out.replace(/[۰-۹]/g, (c) => PERSIAN_DIGITS[c] ?? c);
  out = out.replace(/[٠-٩]/g, (c) => ARABIC_DIGITS[c] ?? c);
  out = out.replace(/[يىكۀةأإآؤئـ]/g, (c) => PERSIAN_LETTER_FIXES[c] ?? c);

  // "dámelo" -> "da me lo", "d'água" -> "d agua"
  out = out.replace(/['’ʼ`´]/g, ' ');

  out = out.toLowerCase();
  out = out.replace(PUNCTUATION_RE, ' ');
  return out.replace(/\s+/g, ' ').trim();
}

/** "manana" and "mañana" and "mañaNA" all become "manana". */
export function stripDiacritics(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u064b-\u0652\u0670]/g, ''); // Arabic/Persian harakat
}

/** True when the text contains Persian/Arabic script characters. */
export function containsPersian(input: string): boolean {
  return /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/.test(input);
}

/**
 * Very light Spanish plural folding so that "amigo" and "amigos" compare equal.
 * Deliberately conservative: it is only used by the *smart* grader, never by
 * the strict one.
 */
export function foldPlural(token: string): string {
  if (token.length <= 3) return token;
  if (token.endsWith('ces')) return `${token.slice(0, -3)}z`;
  if (token.endsWith('ss')) return token;
  if (token.endsWith('es') && token.length > 4) return token.slice(0, -2);
  if (token.endsWith('s')) return token.slice(0, -1);
  return token;
}

export const SPANISH_NUMBER_WORDS: Record<string, string> = {
  cero: '0', un: '1', uno: '1', una: '1', uns: '1', unas: '1',
  dos: '2', tres: '3', cuatro: '4', cinco: '5', seis: '6', siete: '7',
  ocho: '8', nueve: '9', diez: '10', once: '11', doce: '12', trece: '13',
  catorce: '14', quince: '15', dieciseis: '16', diecisiete: '17',
  dieciocho: '18', diecinueve: '19', veinte: '20',
  treinta: '30', cuarenta: '40', cincuenta: '50', sesenta: '60',
  setenta: '70', ochenta: '80', noventa: '90',
  cien: '100', ciento: '100', cientos: '100',
  mil: '1000', millón: '1000000', millon: '1000000', millones: '1000000',
  primer: '1', primero: '1', primera: '1',
  segundo: '2', segunda: '2', tercero: '3', tercera: '3',
  cuarto: '4', cuarta: '4', quinto: '5', quinta: '5',
  sexto: '6', sexta: '6', septimo: '7', septima: '7',
  octavo: '8', octava: '8', noveno: '9', novena: '9', decimo: '10', decima: '10',
  veintiuno: '21', veintiuna: '21', veintidos: '22', veintitres: '23',
  veinticuatro: '24', veinticinco: '25', veintiseis: '26', veintisiete: '27',
  veintiocho: '28', veintinueve: '29',
};

/**
 * Words that carry the grammar rather than the meaning. Removing them lets
 * "el perro" match "perro", "de la casa" match "casa" and — just as
 * importantly for Mexican Spanish — "mi cuate" match "amigo".
 *
 * Only genuine filler belongs here. Words like "todo" or "nada" are safe
 * because both sides of a comparison get the same treatment.
 */
export const SPANISH_STOPWORDS = new Set([
  // articles
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'lo', 'al', 'del',
  // prepositions, conjunctions, question words
  'y', 'e', 'o', 'u', 'de', 'a', 'en', 'con', 'por', 'para', 'que', 'como',
  'cual', 'cuales', 'cuando', 'donde', 'cuyo',
  // possessives and pronouns
  'mi', 'mis', 'tu', 'tus', 'su', 'sus', 'nuestro', 'nuestra', 'nuestros',
  'nuestras', 'vuestro', 'vuestra', 'me', 'te', 'se', 'nos', 'os', 'le', 'les',
  'esto', 'eso', 'aquello', 'aqui', 'alli', 'ahi', 'alla', 'ya',
  // determiners and quantifiers
  'este', 'esta', 'estos', 'estas', 'ese', 'esa', 'esos', 'esas', 'aquel',
  'aquella', 'cada', 'todo', 'toda', 'todos', 'todas', 'otro', 'otra', 'otros',
  'otras', 'mucho', 'mucha', 'muchos', 'muchas', 'poco', 'poca', 'varios',
  'varias', 'cierto', 'cierta', 'mismo', 'misma', 'tan', 'tanto', 'muy',
  // common verbs that appear as scaffolding
  'es', 'son', 'hay', 'ser', 'estar', 'tiene', 'tienen',
]);

/**
 * Spanish has four pairs of words that are only different by an accent, and
 * getting them backwards changes the meaning of a sentence:
 *
 *     él (he)   ≠ el (the)        mí (me)  ≠ mi (my)
 *     tú (you)  ≠ tu (your)       sí (yes) ≠ si (if)
 *
 * Diacritic stripping would collapse each pair onto its homograph and the
 * second word would then be thrown away as filler, so "él es mi hermana"
 * ("he is my sister") would be accepted for "ella es mi hermana". Renaming the
 * accented ones to sentinels keeps them as real content words.
 */
const ACCENTED_PRONOUNS: Record<string, string> = {
  'él': 'pro_el',
  'tú': 'pro_tu',
  'mí': 'pro_mi',
  'sí': 'pro_si',
};

/** Protects the accented pronouns before diacritics are stripped away. */
export function guardAccentedPronouns(normalized: string): string {
  if (!/[\u00e1\u00e9\u00ed\u00f3\u00fa]/.test(normalized)) return normalized;
  return normalized
    .split(' ')
    .map((token) => ACCENTED_PRONOUNS[token] ?? token)
    .join(' ');
}

/** Tokenise already-normalised text. */
export function tokenize(normalized: string): string[] {
  return normalized.length === 0 ? [] : normalized.split(' ').filter(Boolean);
}

/** Levenshtein distance with a small fast path for equal strings. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/** Normalised edit similarity in the 0..1 range. */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  return 1 - levenshtein(a, b) / max;
}
