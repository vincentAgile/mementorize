import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Utilisateurs' };

// The home page of the console: the list of the users comes with MEM-84.
export default function AdminHomePage() {
  return (
    <>
      <h1>Utilisateurs</h1>
      <p className="admin__empty">La liste des utilisateurs arrive avec MEM-84.</p>
    </>
  );
}
