import { getAdministrator } from '../../../lib/admin-api';
import { adminLogoutAction } from '../actions';
import { AdminBanner } from '../admin-banner';

/** The pages of the console behind its login (MEM-82): who is logged in, and « Déconnexion ». */
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const administrator = await getAdministrator();
  return (
    <>
      <AdminBanner>
        <div className="admin-banner__account">
          <span>{administrator.email}</span>
          <span
            className={`admin-banner__codes${administrator.recoveryCodesLeft <= 3 ? ' is-low' : ''}`}
            title="Codes de secours restants (MEM-86)"
          >
            {administrator.recoveryCodesLeft === 0
              ? 'Plus aucun code de secours'
              : `${administrator.recoveryCodesLeft} code${administrator.recoveryCodesLeft > 1 ? 's' : ''} de secours`}
          </span>
          <form action={adminLogoutAction}>
            <button type="submit" className="admin-banner__logout">
              Déconnexion
            </button>
          </form>
        </div>
      </AdminBanner>
      <main className="admin__main">{children}</main>
    </>
  );
}
