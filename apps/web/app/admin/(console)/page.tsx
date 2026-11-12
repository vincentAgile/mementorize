import type { Metadata } from 'next';
import { getAdminUsers } from '../../../lib/admin-api';
import { UsersTable } from './users-table';

export const metadata: Metadata = { title: 'Utilisateurs' };

/**
 * The home page of the console (MEM-84): the users, their last activity
 * and the number of their items, per space and per state. Read only.
 * `?recherche=`: searched on an e-mail, the « fiche » of a user (MEM-143).
 */
export default async function AdminHomePage({ searchParams }: { searchParams: Promise<{ recherche?: string }> }) {
  const [{ users, totals }, params] = await Promise.all([getAdminUsers(), searchParams]);
  return (
    <>
      <h1>Utilisateurs</h1>
      <UsersTable
        users={users}
        totals={totals}
        now={new Date().toISOString()}
        initialSearch={typeof params.recherche === 'string' ? params.recherche : ''}
      />
    </>
  );
}
