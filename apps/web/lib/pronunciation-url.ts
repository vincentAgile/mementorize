/**
 * Address of the audio of a vocabulary item (MEM-39), served by
 * app/prononciation/[id]/route.ts. It carries a hash of the English: when
 * the English is edited, the address changes, so the browser never plays an
 * audio kept in its cache for the former English.
 */
export function pronunciationUrl(itemId: string, english: string): string {
  return `/prononciation/${encodeURIComponent(itemId)}?v=${fnv1a(english)}`;
}

/** FNV-1a, 32 bits, in base 36: short, stable, enough to tell versions apart. */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
