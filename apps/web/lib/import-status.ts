/** The statuses of the lines of a file to import (MEM-53), and the filter of the grid: the users' and the console's (MEM-117). */
export type ImportStatus = 'new' | 'duplicate' | 'error';
export type StatusFilter = 'all' | ImportStatus;

export const STATUS_LABELS: Record<ImportStatus, string> = { new: 'À importer', duplicate: 'Doublon', error: 'Erreur' };

export const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Toutes les lignes' },
  { value: 'new', label: 'À importer' },
  { value: 'duplicate', label: 'Doublons' },
  { value: 'error', label: 'Erreurs' },
];
