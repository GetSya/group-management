/**
 * Script detection for Alphabet filtering
 */
const SCRIPT_RANGES = {
  LATIN: /[A-Za-z]/,
  CYRILLIC: /[\u0400-\u04FF]/,
  ARABIC: /[\u0600-\u06FF\u0750-\u077F]/,
  CHINESE: /[\u4E00-\u9FFF]/,
  JAPANESE: /[\u3040-\u309F\u30A0-\u30FF]/,
  KOREAN: /[\uAC00-\uD7AF\u1100-\u11FF]/,
};

function detectScripts(text) {
  if (!text) return [];
  const detected = [];
  for (const [script, regex] of Object.entries(SCRIPT_RANGES)) {
    if (regex.test(text)) {
      detected.push(script);
    }
  }
  return detected;
}

function isScriptAllowed(text, allowedScripts = ['LATIN']) {
  if (!text) return true;
  // Ignore purely numbers, punctuation, emojis
  const cleanText = text.replace(/[\d\s\p{P}\p{S}]/gu, '');
  if (!cleanText) return true;

  const detected = detectScripts(cleanText);
  if (detected.length === 0) return true;

  // Check if any detected script is not in allowedScripts
  const disallowed = detected.filter(s => !allowedScripts.includes(s));
  return disallowed.length === 0;
}

module.exports = {
  SCRIPT_RANGES,
  detectScripts,
  isScriptAllowed,
};
