// Tiny platform detection. `navigator.platform` is empty in modern Chrome and
// iPadOS Safari, so prefer `userAgentData.platform` when present and fall back
// to a regex over the legacy `navigator.platform` string.

interface UserAgentDataLike {
  platform?: string;
}

export function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  const uaData = (navigator as Navigator & { userAgentData?: UserAgentDataLike }).userAgentData;
  const plat = uaData?.platform ?? navigator.platform ?? "";
  return /Mac|iPhone|iPad|iPod/.test(plat);
}
