/**
 * Language Registry — Insight Chronicles
 * Single source of truth for all supported languages.
 * @module languages
 */

// ── Registry ──────────────────────────────────────────────────────

/** @type {Array<{code:string, englishName:string, nativeName:string, locale:string, direction:string}>} */
const RAW_LANGUAGES = [
  { code: "en",  englishName: "English",            nativeName: "English",              locale: "en-US",  direction: "ltr" },
  { code: "hi",  englishName: "Hindi",              nativeName: "हिन्दी",               locale: "hi-IN",  direction: "ltr" },
  { code: "bn",  englishName: "Bengali",            nativeName: "বাংলা",               locale: "bn-IN",  direction: "ltr" },
  { code: "mr",  englishName: "Marathi",            nativeName: "मराठी",               locale: "mr-IN",  direction: "ltr" },
  { code: "te",  englishName: "Telugu",             nativeName: "తెలుగు",              locale: "te-IN",  direction: "ltr" },
  { code: "ta",  englishName: "Tamil",              nativeName: "தமிழ்",               locale: "ta-IN",  direction: "ltr" },
  { code: "gu",  englishName: "Gujarati",           nativeName: "ગુજરાતી",            locale: "gu-IN",  direction: "ltr" },
  { code: "ur",  englishName: "Urdu",               nativeName: "اردو",                locale: "ur-IN",  direction: "rtl" },
  { code: "kn",  englishName: "Kannada",            nativeName: "ಕನ್ನಡ",               locale: "kn-IN",  direction: "ltr" },
  { code: "or",  englishName: "Odia",               nativeName: "ଓଡ଼ିଆ",              locale: "or-IN",  direction: "ltr" },
  { code: "ml",  englishName: "Malayalam",          nativeName: "മലയാളം",             locale: "ml-IN",  direction: "ltr" },
  { code: "pa",  englishName: "Punjabi",            nativeName: "ਪੰਜਾਬੀ",              locale: "pa-IN",  direction: "ltr" },
  { code: "as",  englishName: "Assamese",           nativeName: "অসমীয়া",             locale: "as-IN",  direction: "ltr" },
  { code: "mai", englishName: "Maithili",           nativeName: "मैथिली",              locale: "mai-IN", direction: "ltr" },
  { code: "sat", englishName: "Santali",            nativeName: "ᱥᱟᱱᱛᱟᱲᱤ",            locale: "sat-IN", direction: "ltr" },
  { code: "ks",  englishName: "Kashmiri",           nativeName: "कॉशुर",               locale: "ks-IN",  direction: "ltr" },
  { code: "ne",  englishName: "Nepali",             nativeName: "नेपाली",              locale: "ne-IN",  direction: "ltr" },
  { code: "gom", englishName: "Konkani",            nativeName: "कोंकणी",              locale: "gom-IN", direction: "ltr" },
  { code: "sd",  englishName: "Sindhi",             nativeName: "سنڌي",                locale: "sd-IN",  direction: "rtl" },
  { code: "doi", englishName: "Dogri",              nativeName: "डोगरी",               locale: "doi-IN", direction: "ltr" },
  { code: "mni", englishName: "Manipuri (Meitei)",  nativeName: "ꯃꯤꯇꯩ ꯂꯣꯟ",          locale: "mni-IN", direction: "ltr" },
  { code: "brx", englishName: "Bodo",               nativeName: "बरʼ",                 locale: "brx-IN", direction: "ltr" },
  { code: "sa",  englishName: "Sanskrit",           nativeName: "संस्कृतम्",           locale: "sa-IN",  direction: "ltr" },
];

// ── Validation ────────────────────────────────────────────────────

(function validate() {
  const seen = new Set();
  for (const lang of RAW_LANGUAGES) {
    if (seen.has(lang.code)) {
      throw new Error(`Duplicate language code in registry: "${lang.code}"`);
    }
    seen.add(lang.code);
    // Guard: required fields
    if (!lang.code || !lang.englishName || !lang.nativeName) {
      throw new Error(`Language entry missing required fields: ${JSON.stringify(lang)}`);
    }
  }
})();

// ── Derived maps ──────────────────────────────────────────────────

/** @type {Map<string, object>} */
const _byCode = new Map();
for (const lang of RAW_LANGUAGES) {
  _byCode.set(lang.code, Object.freeze({ ...lang }));
}

/** Frozen array of all language objects. */
const ALL = Object.freeze(
  RAW_LANGUAGES.map((l) => Object.freeze({ ...l }))
);

/** Frozen array of language codes in definition order. */
const CODES = Object.freeze(RAW_LANGUAGES.map((l) => l.code));

// ── Public API ────────────────────────────────────────────────────

/**
 * Returns the full language object for a given code.
 * @param {string} code — e.g. "hi", "te"
 * @returns {object|undefined} language object or undefined if not found
 */
export function getLanguage(code) {
  return _byCode.get(code);
}

/**
 * Returns all supported languages as a frozen array.
 * @returns {Array<{code, englishName, nativeName, locale, direction}>}
 */
export function getAllLanguages() {
  return ALL;
}

/**
 * Checks if a language code is supported.
 * @param {string} code
 * @returns {boolean}
 */
export function isSupported(code) {
  return _byCode.has(code);
}

/**
 * Returns all supported language codes in definition order.
 * @returns {string[]}
 */
export function getLanguageCodes() {
  return CODES;
}

// ── Named export of the raw definitions (read-only convenience) ──

/** Frozen array of all language definitions. */
export const LANGUAGES = ALL;
