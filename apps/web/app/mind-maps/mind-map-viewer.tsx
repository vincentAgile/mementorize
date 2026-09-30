'use client';

import '@xyflow/react/dist/style.css';
import { ReactFlow } from '@xyflow/react';
import { useMemo } from 'react';
import { type DisplayNode, toFlowEdges, toFlowNodes } from './flow';
import { nodeTypes } from './topic-node';

/**
 * Read-only mind map, used on the review screen. Panning and zooming stay
 * possible (a large map may not fit), but nothing can be moved or edited.
 */
export function MindMapViewer({ nodes }: { nodes: DisplayNode[] }) {
  const flowNodes = useMemo(() => toFlowNodes(nodes), [nodes]);
  const edges = useMemo(() => toFlowEdges(flowNodes), [flowNodes]);

  return (
    <div className="mind-map mind-map--viewer">
      <ReactFlow
        nodes={flowNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1.2 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        zoomOnScroll={false} // the page must keep scrolling normally
        zoomOnDoubleClick={false}
        panActivationKeyCode={null} // Space reveals the answer on this screen
        deleteKeyCode={null}
      />
    </div>
  );
}
