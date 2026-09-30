import { contentOf, type MindMapContent } from '../item-content.js';
import type { ItemWithCards } from '../items.service.js';

export function toMindMapView(item: ItemWithCards) {
  const { nodes } = contentOf(item as ItemWithCards & { type: 'MindMap' });
  return {
    id: item.id,
    title: nodes.find((node) => node.parentId === null)?.label ?? '',
    nodes,
    userId: item.userId,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    cards: item.cards.map(({ id, nodeId, due, state }) => ({ id, nodeId, due, state })),
  };
}

/** What gets stored: plain objects (not DTO instances), with rounded positions. */
export function toMindMapContent(nodes: MindMapContent['nodes']): MindMapContent {
  return {
    nodes: nodes.map(({ id, parentId, label, position }) => ({
      id,
      parentId,
      label,
      position: { x: Math.round(position.x), y: Math.round(position.y) },
    })),
  };
}
