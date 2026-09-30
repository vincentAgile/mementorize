import type { MindMapNode } from '../item-content.js';

/**
 * Checks that a list of nodes forms a single tree. The DTOs check each node
 * on its own (types, lengths); only this function sees the whole list.
 *
 * Returns the reason why it isn't a tree, or null if it is.
 */
export function validateMindMap(nodes: readonly Pick<MindMapNode, 'id' | 'parentId'>[]): string | null {
  const ids = new Set<string>();
  for (const node of nodes) {
    if (ids.has(node.id)) return `Duplicate node id: ${node.id}`;
    ids.add(node.id);
  }

  const roots = nodes.filter((node) => node.parentId === null);
  if (roots.length !== 1) return `A mind map has exactly one root (found ${roots.length})`;

  const parentOf = new Map(nodes.map((node) => [node.id, node.parentId]));
  for (const node of nodes) {
    if (node.parentId !== null && !ids.has(node.parentId)) {
      return `Node ${node.id} has an unknown parent: ${node.parentId}`;
    }
  }

  // With one root and every parent known, the only way not to be a tree is
  // a cycle (A -> B -> A), cut off from the root. Walking up from each node
  // must reach the root in fewer steps than there are nodes.
  for (const node of nodes) {
    let current: string | null = node.id;
    for (let steps = 0; current !== null; steps++) {
      if (steps > nodes.length) return `Node ${node.id} is part of a cycle`;
      current = parentOf.get(current) ?? null;
    }
  }

  return null;
}
