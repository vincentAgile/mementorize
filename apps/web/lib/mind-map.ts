import type { MindMapNode } from './types';

// Tree helpers shared by the editor, the review screen and the home page.
// Plain functions over the stored nodes: no React, no React Flow.

type TreeNode = Pick<MindMapNode, 'id' | 'parentId'>;

export function rootOf<T extends TreeNode>(nodes: readonly T[]): T | undefined {
  return nodes.find((node) => node.parentId === null);
}

export function childrenOf<T extends TreeNode>(nodes: readonly T[], id: string): T[] {
  return nodes.filter((node) => node.parentId === id);
}

/** Branches = children of the root. Each one is reviewed on its own card. */
export function branchesOf<T extends TreeNode>(nodes: readonly T[]): T[] {
  const root = rootOf(nodes);
  return root ? childrenOf(nodes, root.id) : [];
}

/** The node and all of its descendants. */
export function subtreeIds(nodes: readonly TreeNode[], id: string): Set<string> {
  const ids = new Set([id]);
  // Nodes are not sorted parent-first: repeat until nothing new is added.
  let grew = true;
  while (grew) {
    grew = false;
    for (const node of nodes) {
      if (node.parentId !== null && ids.has(node.parentId) && !ids.has(node.id)) {
        ids.add(node.id);
        grew = true;
      }
    }
  }
  return ids;
}

type LaidOutNode = TreeNode & { position: { x: number; y: number } };

/**
 * Tidy layout, growing to the right: one column per depth, one row per
 * leaf, each parent vertically centred on its children. Siblings keep their
 * current top-to-bottom order, so the layout respects how the user arranged
 * them. Returns the new position of every node, the root staying in place.
 */
export function layoutTree(
  nodes: readonly LaidOutNode[],
  { columnWidth = 260, rowHeight = 56 } = {},
): Map<string, { x: number; y: number }> {
  const root = rootOf(nodes);
  const positions = new Map<string, { x: number; y: number }>();
  if (!root) return positions;

  let nextRow = 0;
  const place = (node: LaidOutNode, depth: number): number => {
    const children = childrenOf(nodes, node.id).sort((a, b) => a.position.y - b.position.y);
    let y: number;
    if (children.length === 0) {
      y = nextRow++ * rowHeight;
    } else {
      const ys = children.map((child) => place(child, depth + 1));
      y = (ys[0] + ys[ys.length - 1]) / 2;
    }
    positions.set(node.id, { x: depth * columnWidth, y });
    return y;
  };
  place(root, 0);

  // Shift everything so the root doesn't move on screen.
  const rootPosition = positions.get(root.id)!;
  const dx = root.position.x - rootPosition.x;
  const dy = root.position.y - rootPosition.y;
  for (const [id, { x, y }] of positions) {
    positions.set(id, { x: Math.round(x + dx), y: Math.round(y + dy) });
  }
  return positions;
}
