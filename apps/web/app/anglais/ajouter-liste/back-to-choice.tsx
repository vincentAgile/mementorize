import Link from 'next/link';

/** MEM-123: back to the two choices of « Ajouter une liste », at the top of each of them. */
export function BackToChoice() {
  return (
    <p className="add-list__back">
      <Link href="/anglais/ajouter-liste">← Retour au choix</Link>
    </p>
  );
}
