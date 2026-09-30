'use client';

import '@xyflow/react/dist/style.css';
import { ReactFlow, ReactFlowProvider, useNodesState, useReactFlow } from '@xyflow/react';
import { type KeyboardEvent, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { layoutTree, subtreeIds } from '../../lib/mind-map';
import type { MindMapNode } from '../../lib/types';
import { saveMindMapAction } from './[id]/actions';
import { toFlowEdges, toFlowNodes, toStoredNodes } from './flow';
import { nodeTypes, TopicEditingContext, type TopicNodeType } from './topic-node';

const NEW_LABEL = 'Nouvelle idée';
const H_GAP = 60; // between a node and its children
const V_GAP = 64; // between two siblings

interface MindMapEditorProps {
  mapId: string;
  initialNodes: MindMapNode[];
}

export function MindMapEditor(props: MindMapEditorProps) {
  // useNodesState and the React Flow hooks need a provider above them.
  return (
    <ReactFlowProvider>
      <Editor {...props} />
    </ReactFlowProvider>
  );
}

function Editor({ mapId, initialNodes }: MindMapEditorProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<TopicNodeType>(toFlowNodes(initialNodes));
  const edges = useMemo(() => toFlowEdges(nodes), [nodes]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const wrapper = useRef<HTMLDivElement>(null);

  // --- Saving ------------------------------------------------------------
  const stored = useMemo(() => toStoredNodes(nodes), [nodes]);
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(toStoredNodes(toFlowNodes(initialNodes))));
  const dirty = JSON.stringify(stored) !== savedSnapshot;
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save() {
    if (saving || !dirty) return;
    const snapshot = JSON.stringify(stored);
    startSaving(async () => {
      const result = await saveMindMapAction(mapId, stored);
      setError(result.error ?? null);
      if (!result.error) setSavedSnapshot(snapshot);
    });
  }

  // Ctrl+S anywhere on the page (not only when the map has the focus), so
  // the browser's own "Save page" never opens by accident. The ref always
  // holds the latest save(), without re-subscribing on every render.
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Leaving the page with unsaved changes: the browser asks for confirmation.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // --- Editing the tree ----------------------------------------------------
  const selected = nodes.find((node) => node.selected);

  function addChild(parentId: string) {
    const parent = nodes.find((node) => node.id === parentId);
    if (!parent) return;
    // Below everything already hanging from this parent (children and their
    // own descendants), or level with the parent for a first child. Not a
    // full layout: "Réorganiser" tidies the whole map when needed.
    const descendants = subtreeIds(treeOf(nodes), parentId);
    descendants.delete(parentId);
    const lowest = nodes
      .filter((node) => descendants.has(node.id))
      .reduce<number | null>((y, node) => Math.max(y ?? -Infinity, node.position.y), null);
    const id = crypto.randomUUID();
    const child: TopicNodeType = {
      id,
      type: 'topic',
      position: {
        x: parent.position.x + (parent.measured?.width ?? 150) + H_GAP,
        y: lowest === null ? parent.position.y : lowest + V_GAP,
      },
      data: { label: NEW_LABEL, parentId, depth: parent.data.depth + 1 },
      selected: true,
      // React Flow hides a node (visibility: hidden) until it knows its size.
      // Giving it one up front makes it visible on the first render, so the
      // label input can take the focus right away and no keystroke is lost.
      initialWidth: 150,
      initialHeight: 40,
    };
    setNodes((current) => [...current.map((node) => ({ ...node, selected: false })), child]);
    setEditingId(id); // type the label right away
  }

  function addSibling(id: string) {
    const node = nodes.find((n) => n.id === id);
    // The root has no sibling: Enter on it adds a branch instead.
    addChild(node?.data.parentId ?? id);
  }

  function remove(id: string) {
    const node = nodes.find((n) => n.id === id);
    if (!node || node.data.parentId === null) return; // the root stays
    const removed = subtreeIds(treeOf(nodes), id);
    setNodes((current) =>
      current
        .filter((n) => !removed.has(n.id))
        .map((n) => ({ ...n, selected: n.id === node.data.parentId })), // select the parent
    );
    wrapper.current?.focus(); // the focused node is gone: keep the shortcuts working
  }

  const { fitView } = useReactFlow();

  function tidy() {
    const positions = layoutTree(nodes.map((n) => ({ id: n.id, parentId: n.data.parentId, position: n.position })));
    setNodes((current) => current.map((n) => ({ ...n, position: positions.get(n.id) ?? n.position })));
    requestAnimationFrame(() => fitView({ padding: 0.2, maxZoom: 1.2, duration: 300 }));
  }

  const editingContext = useMemo(
    () => ({
      editingId,
      commitLabel(id: string, label: string) {
        const trimmed = label.trim();
        if (trimmed) setNodes((current) => current.map((n) => (n.id === id ? { ...n, data: { ...n.data, label: trimmed } } : n)));
        setEditingId(null);
        wrapper.current?.focus(); // keyboard shortcuts keep working
      },
      cancelEditing() {
        setEditingId(null);
        wrapper.current?.focus();
      },
    }),
    [editingId, setNodes],
  );

  // Keyboard shortcuts, on the editor only (not the whole page).
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!selected || editingId || event.ctrlKey || event.metaKey || event.altKey) return;
    const shortcuts: Record<string, () => void> = {
      Tab: () => addChild(selected.id),
      Enter: () => addSibling(selected.id),
      F2: () => setEditingId(selected.id),
      Delete: () => remove(selected.id),
      Backspace: () => remove(selected.id),
    };
    const action = shortcuts[event.key];
    if (action) {
      event.preventDefault();
      action();
    }
  }

  const isRoot = selected?.data.parentId === null;

  return (
    <div className="mind-map-editor">
      <div className="mind-map-editor__toolbar" role="toolbar" aria-label="Édition de la carte">
        <button type="button" disabled={!selected} onClick={() => selected && addChild(selected.id)}>
          + Enfant <kbd>Tab</kbd>
        </button>
        <button type="button" disabled={!selected} onClick={() => selected && addSibling(selected.id)}>
          + {isRoot ? 'Branche' : 'Voisin'} <kbd>Entrée</kbd>
        </button>
        <button type="button" disabled={!selected} onClick={() => selected && setEditingId(selected.id)}>
          Renommer <kbd>F2</kbd>
        </button>
        <button type="button" disabled={!selected || isRoot} onClick={() => selected && remove(selected.id)}>
          Supprimer <kbd>Suppr</kbd>
        </button>
        <button type="button" onClick={tidy}>
          Réorganiser
        </button>
        <span className="mind-map-editor__spacer" />
        <span className="mind-map-editor__status" aria-live="polite">
          {saving ? 'Enregistrement…' : dirty ? 'Modifications non enregistrées' : 'Enregistré'}
        </span>
        <button type="button" className="mind-map-editor__save" disabled={!dirty || saving} onClick={save}>
          Enregistrer <kbd>Ctrl+S</kbd>
        </button>
      </div>

      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}

      <div ref={wrapper} className="mind-map mind-map--editor" tabIndex={-1} onKeyDown={onKeyDown}>
        <TopicEditingContext.Provider value={editingContext}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onNodeDoubleClick={(_, node) => setEditingId(node.id)}
            fitView
            fitViewOptions={{ padding: 0.2, maxZoom: 1.2 }}
            nodesConnectable={false} // the tree is built with the toolbar, so it stays a tree
            deleteKeyCode={null} // deletion is ours: it removes the whole subtree
            multiSelectionKeyCode={null}
            selectionKeyCode={null}
            zoomOnDoubleClick={false}
          />
        </TopicEditingContext.Provider>
      </div>

      <p className="mind-map-editor__help">
        Clique sur une idée pour la sélectionner, double-clique pour la renommer, fais-la glisser pour la déplacer.
        Chaque branche (idée reliée directement au sujet central) devient une carte à réviser.
      </p>
    </div>
  );
}

/** The tree structure of React Flow nodes, for the helpers of lib/mind-map. */
function treeOf(nodes: readonly TopicNodeType[]) {
  return nodes.map((node) => ({ id: node.id, parentId: node.data.parentId }));
}
