/**
 * XENA AI — Contextual Normalization Engine
 * 
 * Provides post-transcription understanding, phonetic normalization,
 * and user correction processing for both Voice and Text inputs.
 */

export interface NormalizedInputResult {
  rawTranscript: string;
  finalTranscript: string;
  wasCorrected: boolean;
  correctionReason?: string;
}

/**
 * Normalizes user input (Voice transcription or Text) before intent classification.
 */
export function normalizeUserInput(rawInput: string, userContext?: any): NormalizedInputResult {
  if (!rawInput || typeof rawInput !== 'string') {
    return { rawTranscript: '', finalTranscript: '', wasCorrected: false };
  }

  const trimmed = rawInput.trim();
  let text = trimmed;
  let wasCorrected = false;
  let correctionReason: string | undefined = undefined;

  // 1. Explicit User Correction Handling (High Priority)
  // Example: "I said Vault, not Volt" or "I said CSC305, not CS305"
  const correctionPattern = /^(?:i\s+said\s+|i\s+meant\s+|no,\s+i\s+said\s+|actually\s+i\s+said\s+)([A-Za-z0-9_\-\s]+?)(?:\s*,?\s*not\s+([A-Za-z0-9_\-\s]+))?$/i;
  const matchCorr = text.match(correctionPattern);
  if (matchCorr) {
    const desiredTerm = matchCorr[1].trim();
    if (desiredTerm) {
      // Return normalized desired term directly or clean sentence
      text = desiredTerm;
      wasCorrected = true;
      correctionReason = `Applied explicit user correction: "${desiredTerm}"`;
    }
  }

  // 2. Speech Hesitation Cleaning
  // Remove filler words when they appear as isolated tokens
  const hesitationRegex = /\b(um+s?|uh+s?|err+s?|you\s+know|like|ah+s?)\b/gi;
  const deHesitated = text.replace(hesitationRegex, ' ').replace(/\s+/g, ' ').trim();
  if (deHesitated !== text && deHesitated.length > 0) {
    text = deHesitated;
    wasCorrected = true;
  }

  // 3. Application Vocabulary & Phonetic Normalization (Vault Memory context)
  // Examples: "Volt", "Volts", "Vaults", "Valts", "Bolts", "Faults" -> "Vault"
  // Rule: If word sounds like Vault and occurs in Memory Vault contexts
  const lower = text.toLowerCase();
  
  // Check if text starts with phonetic variant of Vault or contains memory keywords
  const isVaultPrefix = /^(volt|volts|vaults|valts|bolts|faults)([\s,.:;!]+.*|$)/i.test(text);
  const containsMemoryContext = (
    lower.includes('save') ||
    lower.includes('remember') ||
    lower.includes('keep in mind') ||
    lower.includes('store') ||
    lower.includes('memory') ||
    lower.includes('my deadline') ||
    lower.includes('passport') ||
    lower.includes('exam is')
  );

  if (isVaultPrefix || (containsMemoryContext && /\b(volt|volts|vaults|valts|bolts|faults)\b/i.test(text))) {
    const normalizedVaultText = text.replace(/\b(volt|volts|vaults|valts|bolts|faults)\b/gi, (match, word, offset) => {
      // Avoid replacing electrical units if specifically contextually talking about electrical voltage
      if (/voltage|electrical|electric|circuit|amps|watts|battery/i.test(text)) {
        return match;
      }
      return 'Vault';
    });

    if (normalizedVaultText !== text) {
      text = normalizedVaultText;
      wasCorrected = true;
      correctionReason = 'Phonetically normalized Vault Memory term';
    }
  }

  // 4. Common Course Code Normalization (e.g., CS305 -> CSC305 if in context)
  if (userContext?.courseCodes && Array.isArray(userContext.courseCodes)) {
    for (const code of userContext.courseCodes) {
      const relaxed = code.replace(/[^A-Za-z0-9]/g, '');
      const regex = new RegExp(`\\b${relaxed.replace(/^([A-Za-z]+)(\d+)$/, '$1\\s*$2')}\\b`, 'gi');
      if (regex.test(text)) {
        text = text.replace(regex, code);
        wasCorrected = true;
      }
    }
  }

  return {
    rawTranscript: trimmed,
    finalTranscript: text,
    wasCorrected,
    correctionReason
  };
}

/**
 * Clean and extract Vault Memory content.
 * User says: "Vault, remember that my project deadline is Friday."
 * Returns: "My project deadline is Friday."
 */
export function extractVaultContent(input: string): { title: string; content: string } {
  if (!input) return { title: 'Saved Vault Note', content: '' };

  let text = input.trim();

  // Strip leading Vault / Volt markers
  text = text.replace(/^(vault|volt|volts|vaults|valts|xena|nexa|assistant)[:\s,.-]*/i, '').trim();

  // Strip Vault action command wrappers
  const commandPatterns = [
    /^(please\s+)?remember\s+that\s+/i,
    /^(please\s+)?remember\s+/i,
    /^(please\s+)?keep\s+in\s+mind\s+that\s+/i,
    /^(please\s+)?keep\s+in\s+mind\s+/i,
    /^(please\s+)?keep\s+this\s+(information\s+)?(in\s+mind|for\s+later)\s+/i,
    /^(please\s+)?save\s+that\s+/i,
    /^(please\s+)?save\s+this\s+(information\s+)?(in\s+my\s+memory|in\s+memory|for\s+later)?\s+/i,
    /^(please\s+)?save\s+(it\s+)?in\s+(my\s+)?(vault|memory)\s+/i,
    /^(please\s+)?save\s+/i,
    /^(please\s+)?keep\s+/i,
    /^(please\s+)?store\s+that\s+/i,
    /^(please\s+)?store\s+/i,
    /^(please\s+)?note\s+that\s+/i,
    /^(please\s+)?note\s+/i,
  ];

  for (const pat of commandPatterns) {
    text = text.replace(pat, '');
  }

  text = text.trim();

  // Remove trailing politeness
  text = text.replace(/,?\s*please\.?$/i, '').trim();

  // Capitalize first letter
  if (text.length > 0) {
    text = text[0].toUpperCase() + text.slice(1);
  } else {
    text = input.trim();
  }

  // Generate title (up to 50 chars or whole content)
  const title = text.length > 50 ? text.slice(0, 47) + '...' : text;

  return {
    title: title || 'Saved Vault Note',
    content: text || input.trim()
  };
}
