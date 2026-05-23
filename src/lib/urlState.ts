// Encodes/decodes the shareable `?prompt=<base64>` URL parameter. Uses
// URL-safe base64 (RFC 4648 §5) so that the link is safe to drop in tweets.
//
// Note: we cap encoded length at ~6000 chars so accidental novels don't blow
// up the URL bar. The Analyze button still works with arbitrarily long input;
// only the share link refuses.

const MAX_URL_PROMPT_BYTES = 4500; // ≈ 6000 base64url chars

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Tolerant base64url decoder. Returns null on any decode failure rather than
 *  throwing — callers in this module turn that into a null-return path. */
function fromBase64Url(str: string): Uint8Array | null {
  try {
    const padded = str.replace(/-/g, "+").replace(/_/g, "/");
    const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
    const bin = atob(padded + pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export function encodePromptToUrl(prompt: string): string {
  const bytes = new TextEncoder().encode(prompt);
  if (bytes.length > MAX_URL_PROMPT_BYTES) {
    throw new Error(
      `Prompt is too long to share via URL (${bytes.length} bytes; limit ${MAX_URL_PROMPT_BYTES})`
    );
  }
  return toBase64Url(bytes);
}

export function decodePromptFromUrl(encoded: string): string | null {
  const bytes = fromBase64Url(encoded);
  if (!bytes) return null;
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return null;
  }
}

export function readPromptFromLocation(): string | null {
  const url = new URL(window.location.href);
  const encoded = url.searchParams.get("prompt");
  if (!encoded) return null;
  return decodePromptFromUrl(encoded);
}

export function writePromptToLocation(prompt: string, replace = true) {
  const url = new URL(window.location.href);
  url.searchParams.set("prompt", encodePromptToUrl(prompt));
  if (replace) window.history.replaceState({}, "", url);
  else window.history.pushState({}, "", url);
}

export function clearPromptFromLocation() {
  const url = new URL(window.location.href);
  url.searchParams.delete("prompt");
  window.history.replaceState({}, "", url);
}

export function buildShareUrl(prompt: string): string {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("prompt", encodePromptToUrl(prompt));
  return url.toString();
}
