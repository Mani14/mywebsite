import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForestLayout, usePedigreeLayout } from '../hooks/useTreeLayout';
import { getForestRoots } from '../utils/familyUtils';
import ConnectorLines from './ConnectorLines';
import TreeNode from './TreeNode';
import '../styles/FamilyTree.css';

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2;

// Renders either every family in the dataset side by side (mode="forest", not just
// the one connected to the focus person) or one person's ancestors-above +
// descendants-below "hourglass" (mode="pedigree"), with `rootId` as the focus.
// `priorityId` anchors which lineage wins ownership of a shared descendant (e.g.
// Kesavamoorthy/Vanaja) — it defaults to `rootId` but should normally be given the
// PERSISTED root person (App.jsx's rootPersonId), not the transient focus. Ownership
// needs to stay stable as you click around the tree; keying it to whoever you're
// currently looking at would let ownership flip mid-session — e.g. clicking someone
// whose lineage traces to a tiny satellite cluster would shove that cluster to the
// front of the claim order, stealing a shared branch away from the real family and
// making it vanish entirely once that tiny cluster gets excluded as a satellite.
export default function FamilyTree({ persons, rootId, priorityId, collapsed, mode = 'forest', onSelect, onToggle, onQuickAdd, onJumpTo }) {
  const rootIds = useMemo(
    () => getForestRoots(persons, priorityId ?? rootId),
    [persons, priorityId, rootId]
  );
  const forestLayout = useForestLayout(persons, rootIds, collapsed);
  const pedigreeLayout = usePedigreeLayout(persons, rootId, collapsed);
  const layout = mode === 'pedigree' ? pedigreeLayout : forestLayout;

  // Every person/spouse id actually drawn on THIS canvas right now — used to
  // suppress a spouse's jump-link badge when their own parent (what the jump
  // would take you to) is already visible here, making the jump redundant.
  const renderedIds = useMemo(
    () => new Set(layout.nodes.flatMap((n) => (n.spouse ? [n.id, n.spouse.id] : [n.id]))),
    [layout]
  );
  const containerRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 40 });
  const drag = useRef(null);
  const didCenter = useRef(false);
  // Gates the CSS transition below — on while zooming (buttons/wheel) so the jump
  // eases in smoothly, off while drag-panning so the tree tracks the cursor instantly.
  const [isDragging, setIsDragging] = useState(false);
  // Mirrors `zoom` for synchronous reads inside zoomAt/handleWheel/zoomBy, since those
  // need the up-to-date value without waiting for a re-render (state setter callbacks
  // firing back-to-back, e.g. rapid wheel events, would otherwise read a stale `zoom`).
  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  // Centres the viewport on the focus person's node (falls back to tree centre).
  const centerTree = useCallback(() => {
    const el = containerRef.current;
    if (!el || !layout.width) return;
    const focusNode = layout.nodes.find((n) => n.person.id === rootId || n.spouse?.id === rootId);
    if (focusNode) {
      setPan({
        x: el.clientWidth / 2 - focusNode.x,
        y: el.clientHeight / 2 - focusNode.y - 60,
      });
    } else {
      setPan({ x: Math.max((el.clientWidth - layout.width) / 2, 20), y: 40 });
    }
  }, [layout, rootId]);

  // Re-centre whenever the focus person changes (e.g. after "Set as Root"), and reset
  // zoom back to 1 at the same time. Without the zoom reset, a level carried over
  // from whatever was previously on screen (a different person's Pedigree View, or a
  // zoomed-out Full Tree View) breaks the auto-centring math for the new layout:
  // centerTree()'s pan formula assumes zoom 1, so at any other zoom the computed pan
  // lands the content off-screen — it looks blank until "reset view" is clicked
  // (which resets zoom AND pan together, masking the bug). Also reset on a pure mode
  // switch (forest <-> pedigree) even when rootId happens to stay the same, since the
  // two layouts are entirely different shapes.
  useEffect(() => {
    didCenter.current = false;
    setZoom(1);
  }, [rootId]);

  useEffect(() => {
    didCenter.current = false;
    setZoom(1);
  }, [mode]);

  useEffect(() => {
    if (!didCenter.current && layout.width) {
      centerTree();
      didCenter.current = true;
    }
  }, [layout.width, centerTree]);

  // Changes zoom while keeping the world point under (anchorX, anchorY) — a
  // viewport-relative pixel coordinate — visually fixed in place. `.tree-world`'s
  // transform-origin is 0 0, so scaling always pivots on the far corner of the
  // whole tree; without this pan correction any zoom change (buttons or wheel)
  // would visibly yank the content toward/away from that corner instead of the
  // point the user is actually looking at, which is what made zoom feel "random".
  const zoomAt = useCallback((anchorX, anchorY, nextZoom) => {
    // Captured now, not read inside the setPan updater below — that callback runs
    // later during React's commit, by which point a same-tick zoomRef mutation
    // would already read as `nextZoom`, collapsing the ratio to 1 and silently
    // disabling the anchor correction (the bug that made zoom drift off-centre).
    const prevZoom = zoomRef.current;
    setPan((p) => ({
      x: anchorX - (anchorX - p.x) * (nextZoom / prevZoom),
      y: anchorY - (anchorY - p.y) * (nextZoom / prevZoom),
    }));
    zoomRef.current = nextZoom;
    setZoom(nextZoom);
  }, []);

  const handleWheel = useCallback(
    (e) => {
      e.preventDefault();
      const el = containerRef.current;
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomRef.current - e.deltaY * 0.0015));
      // Anchor on the viewport centre (not the cursor) so wheel zoom matches the
      // +/- buttons and always zooms toward what's currently in the middle of the screen.
      zoomAt(el.clientWidth / 2, el.clientHeight / 2, next);
    },
    [zoomAt]
  );

  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    // Don't hijack clicks on cards/toggle buttons — only pan when starting on empty canvas.
    if (e.target.closest('button')) return;
    drag.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMouseMove = (e) => {
    if (!drag.current) return;
    setPan({
      x: drag.current.panX + (e.clientX - drag.current.startX),
      y: drag.current.panY + (e.clientY - drag.current.startY),
    });
  };
  const endDrag = (e) => {
    drag.current = null;
    setIsDragging(false);
    if (e?.currentTarget?.releasePointerCapture && e.pointerId != null) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  // Anchored on the viewport centre so the +/- buttons zoom toward/away from whatever
  // is currently in the middle of the screen, matching what the wheel zoom does at
  // the cursor — instead of leaving pan untouched, which pivots around the tree's
  // top-left corner (transform-origin 0 0) and feels like the view jumps randomly.
  const zoomBy = useCallback(
    (delta) => {
      const el = containerRef.current;
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomRef.current + delta));
      if (!el) {
        zoomRef.current = next;
        setZoom(next);
        return;
      }
      zoomAt(el.clientWidth / 2, el.clientHeight / 2, next);
    },
    [zoomAt]
  );

  const resetView = () => {
    setZoom(1);
    zoomRef.current = 1;
    centerTree();
  };

  return (
    <div className="tree-viewport">
      <div
        ref={containerRef}
        className="tree-canvas"
        onWheel={handleWheel}
        onPointerDown={onMouseDown}
        onPointerMove={onMouseMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div
          className="tree-world"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transition: isDragging ? 'none' : 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          <ConnectorLines links={layout.links} width={layout.width} height={layout.height} />
          {layout.nodes.map((node) => (
            <TreeNode
              key={node.id}
              node={node}
              focusId={rootId}
              renderedIds={renderedIds}
              onSelect={onSelect}
              onToggle={onToggle}
              onQuickAdd={onQuickAdd}
              onJumpTo={onJumpTo}
            />
          ))}
        </div>
      </div>

      <div className="tree-controls">
        <button type="button" onClick={() => zoomBy(0.15)} title="Zoom in">+</button>
        <button type="button" onClick={() => zoomBy(-0.15)} title="Zoom out">{'\u2212'}</button>
        <button type="button" onClick={resetView} title="Reset view">{'\u21BB'}</button>
      </div>
    </div>
  );
}
