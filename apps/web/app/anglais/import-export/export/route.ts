import { csvDownload } from '../../../csv/export-route';

/** The vocabulary as a CSV file to download (MEM-52). */
export function GET() {
  return csvDownload('Vocabulary');
}
