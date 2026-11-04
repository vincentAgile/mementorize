import { csvDownload } from '../../../csv/export-route';

/** MEM-122: the vocabulary as a CSV file to download, from « Ma liste » (the former address of the tab « Import / export » answers the same, MEM-123). */
export function GET() {
  return csvDownload('Vocabulary');
}
