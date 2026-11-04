import { csvDownload } from '../../../csv/export-route';

/** MEM-122: the vocabulary as a CSV file to download, from « Ma liste » (the same file as /anglais/import-export/export). */
export function GET() {
  return csvDownload('Vocabulary');
}
