import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import QRCode from 'qrcode';
import { adminEnrollment } from '../../../../lib/admin-api';
import { getAdminStep } from '../../../../lib/admin-session';
import { AdminBanner } from '../../admin-banner';
import { Activation } from './activation';

export const metadata: Metadata = { title: 'Double authentification' };

/**
 * MEM-86: the first login of an account activates the two-step login: the
 * key to add to the authenticator app, as a QR code and as text, then a
 * first code to confirm it.
 */
export default async function AdminActivationPage() {
  const challenge = await getAdminStep();
  if (!challenge) redirect('/admin/connexion?etape=expiree');
  const enrollment = await adminEnrollment(challenge);
  if (enrollment === 'expired' || enrollment === null) redirect('/admin/connexion?etape=expiree');

  // 'active': just activated here; the page is rendered again, the recovery codes stay on screen.
  const key =
    enrollment === 'active'
      ? null
      : {
          email: enrollment.email,
          secret: enrollment.secret,
          qrCode: await QRCode.toString(enrollment.otpauthUri, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }),
        };
  return (
    <>
      <AdminBanner />
      <main className="admin__main admin__main--narrow">
        <h1>Double authentification</h1>
        <Activation enrollment={key} />
      </main>
    </>
  );
}
