import type { Edge } from '@xyflow/react';
import type { MindMapNode } from '../../lib/types';
import type { TopicNodeType } from './topic-node';

// Conversions between the stored tree (MindMapNode: what the API keeps) and
// what React Flow draws (nodes + edges). The stored shape stays independent
// from the library: React Flow adds its own fields (selected, measured…)
// that have nothing to do in the database.

/** A stored node, plus how the review screen wants it drawn. */
export type DisplayNode = MindMapNode & { masked?: boolean; highlighted?: boolean };

export function toFlowNodes(nodes: readonly DisplayNode[]): TopicNodeType[] {
  const parentOf = new Map(nodes.map((node) => [node.id, node.parentId]));
  const depthOf = (id: string) => {
    let depth = 0;
    for (let parent = parentOf.get(id); parent != null && depth < nodes.length; parent = parentOf.get(parent)) depth++;
    return depth;
  };

  return nodes.map(({ id, parentId, label, position, masked, highlighted }) => ({
    id,
    type: 'topic',
    position,
    data: { label, parentId, depth: depthOf(id), masked, highlighted },
  }));
}

/** Edges aren't stored: each one is drawn from a node to its parent. */
export function toFlowEdges(nodes: readonly Pick<TopicNodeType, 'id' | 'data'>[]): Edge[] {
  return nodes
    .filter((node) => node.data.parentId !== null)
    .map((node) => ({
      id: `${node.data.parentId}->${node.id}`,
      source: node.data.parentId!,
      target: node.id,
      focusable: false,
    }));
}

export function toStoredNodes(nodes: readonly TopicNodeType[]): MindMapNode[] {
  return nodes.map(({ id, data, position }) => ({
    id,
    parentId: data.parentId,
    label: data.label,
    position: { x: Math.round(position.x), y: Math.round(position.y) },
  }));
}
