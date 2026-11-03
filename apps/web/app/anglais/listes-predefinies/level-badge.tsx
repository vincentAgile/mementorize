import { levelLabel } from '../../../lib/catalog';
import type { LanguageLevel } from '../../../lib/types';

/** MEM-118: the level of a list, its label written out (never the colour alone): « A2 · Élémentaire ». */
export function LevelBadge({ level }: { level: LanguageLevel }) {
  return <span className={`level-badge level-badge--${level[0].toLowerCase()}`}>{levelLabel(level)}</span>;
}
