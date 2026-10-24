import { redirect } from 'next/navigation';
import { exportCsv } from '../../lib/api';
import type { ListType } from '../../lib/types';

/**
 * The items of a space as a CSV file to download (MEM-52, MEM-72): the
 * button of the Import / export tab is a plain link to the export route of
 * the space, which forwards the request to the API with the session's token
 * (the browser never calls the API) and passes the file on, with its name.
 */
export async function csvDownload(type: ListType): Promise<Response> {
  const file = await exportCsv(type);
  if (!file.ok) {
    if (file.status === 401) redirect('/session-expired');
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
