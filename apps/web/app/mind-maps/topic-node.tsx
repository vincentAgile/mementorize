'use client';

import { Handle, type Node, type NodeProps, Position } from '@xyflow/react';
import { createContext, useContext, useEffect, useRef } from 'react';

/** What React Flow carries for each node of a mind map (`node.data`). */
export type TopicData = {
  label: string;
  parentId: string | null;
  depth: number; // 0 = root, 1 = branch, 2+ = details: drives the style
  masked?: boolean; // review: label hidden, to be recalled
  highlighted?: boolean; // review: the branch that was asked
};

export type TopicNodeType = Node<TopicData, 'topic'>;

/**
 * Editing callbacks, provided by the editor only. The review screen renders
 * the same nodes without this context, so they stay read-only.
 */
export const TopicEditingContext = createContext<{
  editingId: string | null;
  commitLabel: (id: string, label: string) => void;
  cancelEditing: () => void;
} | null>(null);

// Declared outside of any component: React Flow expects a stable object.
export const nodeTypes = { topic: TopicNode };

function TopicNode({ id, data, selected }: NodeProps<TopicNodeType>) {
  const editing = useContext(TopicEditingContext);
  const isEditing = editing?.editingId === id;

  const classes = [
    'topic',
    `topic--depth-${Math.min(data.depth, 2)}`,
    selected && 'is-selected',
    data.masked && 'topic--masked',
    data.highlighted && 'topic--highlighted',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
      {/* Edges attach here; links are made with the toolbar, not by dragging. */}
      {data.parentId !== null && <Handle type="target" position={Position.Left} isConnectable={false} />}
      {isEditing && editing ? (
        <LabelInput
          initial={data.label}
          onCommit={(label) => editing.commitLabel(id, label)}
          onCancel={editing.cancelEditing}
        />
      ) : data.masked ? (
        <span className="topic__mask" aria-label="Élément masqué">
          {data.depth === 1 ? '?' : '…'}
        </span>
      ) : (
        data.label
      )}
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
}

function LabelInput({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (label: string) => void;
  onCancel: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  // Enter and Escape unmount the input, which then fires a blur: this flag
  // keeps that blur from committing a second time (or after a cancel).
  const done = useRef(false);

  useEffect(() => {
    input.current?.focus();
    input.current?.select(); // typing replaces the current label
  }, []);

  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    if (commit) onCommit(input.current?.value ?? initial);
    else onCancel();
  };

  return (
    <input
      ref={input}
      className="topic__input nodrag" // nodrag: selecting text doesn't move the node
      defaultValue={initial}
      maxLength={200}
      aria-label="Libellé"
      onKeyDown={(event) => {
        event.stopPropagation(); // the editor's shortcuts (Tab, Suppr…) don't apply while typing
        if (event.key === 'Enter') finish(true);
        if (event.key === 'Escape') finish(false);
      }}
      onBlur={() => finish(true)}
    />
  );
}
