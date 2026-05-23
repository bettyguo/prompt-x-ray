// Tokenizer-panel data extraction. Pulls GPT-2 BPE token ids, recovers a
// per-token char span back into the original prompt, and flags "surprising"
// boundaries using a small set of heuristics documented in HOW-TO-READ.md.

import type { PreTrainedTokenizer } from "@huggingface/transformers";
import type { SurprisingReason, TokenInfo } from "../types";

// Heuristic constants. Picked conservatively — better to under-flag than to
// cry wolf, since the warn-amber ring is a strong visual signal.
const LOW_FREQ_THRESHOLD = 30000;
const COMMON_PUNCT = new Set([
  ".",
  ",",
  "!",
  "?",
  ":",
  ";",
  '"',
  "'",
  "-",
  "(",
  ")",
]);

export interface TokenizationResult {
  ids: number[];
  tokens: TokenInfo[];
}

export function tokenizePrompt(
  tokenizer: PreTrainedTokenizer,
  text: string
): TokenizationResult {
  const ids: number[] = tokenizer.encode(text);

  // GPT-2 uses byte-level BPE. tokenizer.decode(ids[i]) gives the text piece
  // including its leading space if any. We walk the prompt char-by-char to
  // recover real char offsets — this is robust to byte-level merges that
  // would mis-align if we just sum decoded lengths blindly.
  const tokens: TokenInfo[] = [];
  let cursor = 0;
  for (let i = 0; i < ids.length; i++) {
    const raw = tokenizer.decode([ids[i]], { skip_special_tokens: false });
    const display = raw;

    // Locate this piece in the prompt. Usually it's a direct match at cursor;
    // for tokens that decode oddly (rare unicode, NFC/NFD drift) we fall back
    // to a best-effort recovery that walks codepoint-by-codepoint so non-ASCII
    // input doesn't silently produce wrong offsets.
    let foundAt = text.indexOf(display, cursor);
    if (foundAt < 0) {
      foundAt = cursor;
    }
    const charStart = foundAt;
    let charEnd = foundAt + display.length;

    if (foundAt === cursor && text.slice(cursor, cursor + display.length) !== display) {
      // Drift: advance the cursor by the common-prefix codepoint length of
      // `display` and the remaining text. This keeps subsequent tokens
      // approximately aligned without inventing characters that aren't there.
      const remaining = text.slice(cursor);
      let advance = 0;
      const dispChars = Array.from(display);
      const remChars = Array.from(remaining);
      const limit = Math.min(dispChars.length, remChars.length);
      for (let k = 0; k < limit; k++) {
        if (dispChars[k] !== remChars[k]) break;
        advance += dispChars[k].length;
      }
      if (advance === 0) advance = Math.min(display.length, remaining.length);
      charEnd = Math.min(cursor + advance, text.length);
    }
    charEnd = Math.min(charEnd, text.length);
    cursor = charEnd;

    const surprising_reasons: SurprisingReason[] = [];

    const vocabId = ids[i]; // GPT-2 vocab is roughly frequency-ordered; close enough for v1.
    if (vocabId > LOW_FREQ_THRESHOLD) surprising_reasons.push("low-frequency");

    if (
      i > 0 &&
      !display.startsWith(" ") &&
      isWordChar(display[0]) &&
      charStart > 0 &&
      isWordChar(text[charStart - 1])
    ) {
      surprising_reasons.push("midword-split");
    }

    if (display.length === 1 && !COMMON_PUNCT.has(display) && !isWordChar(display) && !/\s/.test(display)) {
      surprising_reasons.push("uncommon-punctuation");
    }

    // Byte-fallback shows up as funky-looking single-byte pieces. transformers.js
    // decode produces the actual unicode, so we can't directly detect this; we
    // rely on low frequency + non-word as a proxy here.
    if (raw.length === 1 && raw.charCodeAt(0) < 32) {
      surprising_reasons.push("byte-fallback");
    }

    tokens.push({
      id: ids[i],
      text: display,
      raw,
      charStart,
      charEnd,
      vocabId,
      surprising_boundary: surprising_reasons.length > 0,
      surprising_reasons,
    });
  }

  return { ids, tokens };
}

function isWordChar(c: string | undefined): boolean {
  if (!c) return false;
  return /[A-Za-z0-9_]/.test(c);
}
