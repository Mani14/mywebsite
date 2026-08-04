import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useForestLayout, usePedigreeLayout } from '../hooks/useTreeLayout';
import { getForestRoots, getLineageRootIds } from '../utils/familyUtils';
import ConnectorLines from './ConnectorLines';
import MiniMap from './MiniMap';
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
const FamilyTree = forwardRef(function FamilyTree(
  { persons, rootId, priorityId, collapsed, mode = 'forest', highlightedIds, meId, onSelect, onToggle, onQuickAdd, onJumpTo },
  exportRef
) {
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

  // Every "parentId|childId" pair where both ends are on the highlighted
  // lineage-to-root chain — handed to ConnectorLines so it can draw that
  // specific run of connectors a second time, in the highlight colour.
  // A couple's connector is always anchored to whichever spouse the layout used
  // as its placement id, which isn't necessarily the one getAncestorChain walked
  // through (parentIds[0]) — so a link also counts as highlighted when its
  // parentId's SPOUSE is the chain member, not just an exact id match.
  const highlightedPairs = useMemo(() => {
    if (!highlightedIds?.size) return null;
    const pairs = new Set();
    layout.links.forEach(({ parentId, childId }) => {
      if (!parentId || !childId || !highlightedIds.has(childId)) return;
      const parentOnChain =
        highlightedIds.has(parentId) || highlightedIds.has(persons[parentId]?.spouseId);
      if (parentOnChain) pairs.add(`${parentId}|${childId}`);
    });
    return pairs;
  }, [layout.links, highlightedIds, persons]);

  // Dad-side/mom-side highlighting: whichever two lineage trees are the current
  // focus person's father's and mother's, tinted so their halves of the diagram
  // (or, in Full Tree View, just their two trees among everyone else's) stand out.
  const { fatherRootId, motherRootId } = useMemo(() => getLineageRootIds(persons, rootId), [persons, rootId]);
  const sideOf = useCallback(
    (node) => {
      if (!node.treeRootId) return null;
      if (node.treeRootId === fatherRootId) return 'father';
      if (node.treeRootId === motherRootId) return 'mother';
      return null;
    },
    [fatherRootId, motherRootId]
  );

  const containerRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 40 });
  const drag = useRef(null);
  const didCenter = useRef(false);
  // Gates the CSS transition below — on while zooming via the +/- buttons so the jump
  // eases in smoothly, off while drag-panning so the tree tracks the cursor instantly.
  const [isDragging, setIsDragging] = useState(false);
  // Also off while wheel/trackpad-zooming: a wheel burst fires many ticks per second,
  // and re-triggering the 220ms ease on every tick made the view visibly lag ~250ms
  // behind the input (each new tick restarts the ease from the current in-flight
  // position toward a new target). Wheel zoom instead tracks 1:1, like dragging.
  const [isWheeling, setIsWheeling] = useState(false);
  const wheelTimeoutRef = useRef(null);
  // Mirrors `zoom` for synchronous reads inside zoomAt/handleWheel/zoomBy, since those
  // need the up-to-date value without waiting for a re-render (state setter callbacks
  // firing back-to-back, e.g. rapid wheel events, would otherwise read a stale `zoom`).
  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  // Tracked purely for the mini-map, so its viewport rectangle stays accurate
  // across window/panel resizes without the main pan/zoom logic depending on it.
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const update = () => setViewportSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
      setIsWheeling(true);
      clearTimeout(wheelTimeoutRef.current);
      wheelTimeoutRef.current = setTimeout(() => setIsWheeling(false), 150);
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

  // Mini-map click/drag: re-centre the viewport on the tree-space point clicked,
  // at whatever zoom level is currently active.
  const handleMiniMapNavigate = useCallback((treeX, treeY) => {
    const el = containerRef.current;
    if (!el) return;
    setPan({
      x: el.clientWidth / 2 - treeX * zoomRef.current,
      y: el.clientHeight / 2 - treeY * zoomRef.current,
    });
  }, []);

  // Exposed to App.jsx (via ref) for the Export Image/PDF buttons — captures
  // exactly what's currently visible in the viewport, not the whole tree, since
  // large trees can be enormous once fully unrolled.
  useImperativeHandle(exportRef, () => ({
    async exportImage() {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(containerRef.current, { backgroundColor: null });
      const link = document.createElement('a');
      link.download = 'family-tree.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    },
    async exportPDF() {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
      const canvas = await html2canvas(containerRef.current, { backgroundColor: '#ffffff' });
      const orientation = canvas.width >= canvas.height ? 'landscape' : 'portrait';
      const pdf = new jsPDF({ orientation, unit: 'px', format: [canvas.width, canvas.height] });
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, canvas.width, canvas.height);
      pdf.save('family-tree.pdf');
    },
  }));

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
            transition: isDragging || isWheeling ? 'none' : 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          <ConnectorLines links={layout.links} width={layout.width} height={layout.height} highlightedPairs={highlightedPairs} />
          {layout.nodes.map((node, index) => (
            <TreeNode
              key={node.id}
              node={node}
              index={index}
              focusId={rootId}
              renderedIds={renderedIds}
              side={sideOf(node)}
              highlightedIds={highlightedIds}
              meId={meId}
              onSelect={onSelect}
              onToggle={onToggle}
              onQuickAdd={onQuickAdd}
              onJumpTo={onJumpTo}
            />
          ))}
        </div>
      </div>

      <MiniMap
        nodes={layout.nodes}
        treeWidth={layout.width}
        treeHeight={layout.height}
        pan={pan}
        zoom={zoom}
        viewportSize={viewportSize}
        onNavigate={handleMiniMapNavigate}
      />

      <div className="tree-controls">
        <button type="button" onClick={() => zoomBy(0.15)} title="Zoom in">+</button>
        <button type="button" onClick={() => zoomBy(-0.15)} title="Zoom out">{'\u2212'}</button>
        <button type="button" onClick={resetView} title="Reset view">{'\u21BB'}</button>
      </div>
    </div>
  );
});

export default FamilyTree;
