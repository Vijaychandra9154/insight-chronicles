// translator/js/rtlStyles.js — RTL language support (vanilla ES module)
'use strict';

const RTL_LANGS = new Set(['ur', 'sd']);
const RTL_CLASS = 'rtl';

// ---- private helpers -------------------------------------------------------

function normCode(code) {
  return typeof code === 'string' ? code.trim().toLowerCase() : '';
}

function isValidElement(el) {
  return el && typeof el.setAttribute === 'function' && typeof el.classList === 'object';
}

// ---- public API ------------------------------------------------------------

/**
 * Check whether a language code maps to a supported RTL language.
 * @param {string} languageCode  e.g. "ur", "sd", "SD"
 * @returns {boolean}
 */
export function isRTL(languageCode) {
  return RTL_LANGS.has(normCode(languageCode));
}

/**
 * Return the writing direction for a language code.
 * @param {string} languageCode
 * @returns {'rtl'|'ltr'}
 */
export function getDirection(languageCode) {
  return isRTL(languageCode) ? 'rtl' : 'ltr';
}

/**
 * Apply RTL (or LTR) styling to a root DOM element.
 *
 * - Sets the `dir` attribute (rtl / ltr).
 * - Sets the `lang` attribute to the given language code.
 * - Adds the `.rtl` CSS class for RTL languages; removes it for LTR.
 * - Preserves all pre-existing classes on the element.
 *
 * @param {Element} rootElement   DOM node to modify
 * @param {string}  languageCode  e.g. "ur", "sd"
 * @returns {boolean} true on success, false on invalid input
 */
export function applyRTL(rootElement, languageCode) {
  if (!isValidElement(rootElement) || !languageCode) return false;

  const code = normCode(languageCode);
  if (!code) return false;

  const rtl = RTL_LANGS.has(code);
  rootElement.setAttribute('dir', rtl ? 'rtl' : 'ltr');
  rootElement.setAttribute('lang', code);
  rootElement.classList.toggle(RTL_CLASS, rtl);

  return true;
}

/**
 * Restore LTR state on a root element.
 *
 * - Sets `dir` to "ltr".
 * - Removes the `lang` attribute.
 * - Removes the `.rtl` CSS class.
 *
 * @param {Element} rootElement
 * @returns {boolean} true on success, false on invalid input
 */
export function removeRTL(rootElement) {
  if (!isValidElement(rootElement)) return false;

  rootElement.setAttribute('dir', 'ltr');
  rootElement.removeAttribute('lang');
  rootElement.classList.remove(RTL_CLASS);

  return true;
}
