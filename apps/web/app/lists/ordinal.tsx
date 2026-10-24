/** 1ᵉʳ, 2ᵉ, 12ᵉ: the place in the learning queue (MEM-62, MEM-71). */
export function ordinal(position: number) {
  return (
    <>
      {position}
      <sup>{position === 1 ? 'er' : 'e'}</sup>
    </>
  );
}
