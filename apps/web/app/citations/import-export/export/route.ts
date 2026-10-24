import { csvDownload } from '../../../csv/export-route';

/** The quotes as a CSV file to download (MEM-72). */
export function GET() {
  return csvDownload('Quote');
}
