import { redirect } from 'next/navigation';
import { exportCatalogCsv } from '../../../../../../lib/admin-api';

/**
 * MEM-117: « Exporter en CSV » is a plain link to this route, which asks the
 * API for the file with the administration token (the browser never calls
 * the API) and passes it on, with its name.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const file = await exportCatalogCsv((await params).id);
  if (!file.ok) {
    if (file.status === 401) redirect('/admin/session-expiree');
    if (file.status === 404 || file.status === 400) return new Response('Liste introuvable.', { status: 404 });
    return new Response('Export impossible pour le moment.', { status: 502 });
  }
  return new Response(file.body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': file.disposition,
      'Cache-Control': 'private, no-store',
    },
  });
}
