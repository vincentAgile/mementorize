import { getAdministrator } from '../../../lib/admin-api';
import { adminLogoutAction } from '../actions';
import { AdminBanner } from '../admin-banner';
import { AdminNav } from '../admin-nav';

/** The pages of the console behind its login (MEM-82): who is logged in, and « Déconnexion ». */
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const administrator = await getAdministrator();
  return (
    <>
      <AdminBanner>
        <AdminNav />
        <div className="admin-banner__account">
          <span>{administrator.email}</span>
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
