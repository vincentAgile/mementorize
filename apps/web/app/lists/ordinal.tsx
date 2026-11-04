/**
 * 1ᵉʳ (1ʳᵉ for a feminine noun: a « carte », MEM-120), 2ᵉ, 12ᵉ: the place in
 * the learning queue (MEM-62, MEM-71).
 */
export function ordinal(position: number, feminine = false) {
  return (
    <>
      {position}
      <sup>{position === 1 ? (feminine ? 're' : 'er') : 'e'}</sup>
    </>
  );
}
