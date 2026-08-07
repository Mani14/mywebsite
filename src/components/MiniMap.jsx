import { useRef, useCallback } from 'react';
import '../styles/MiniMap.css';

const MAP_W = 170;
const MAP_H = 120;
const PADDING = 8;

// Small always-on overview of the whole tree in the bottom-left corner of the
// viewport — every node is a dot, the current visible area is a highlighted
// rectangle, and clicking/dragging anywhere on it re-centres the main view
// there. Purely a navigation aid; it never affects the actual layout.
export default function MiniMap({ nodes, treeWidth, treeHeight, pan, zoom, viewportSize, onNavigate }) {
  const mapRef = useRef(null);

  const ready = nodes.length > 0 && treeWidth > 0 && treeHeight > 0 && viewportSize.width > 0;

  const scale = ready
    ? Math.min((MAP_W - PADDING * 2) / treeWidth, (MAP_H - PADDING * 2) / treeHeight)
    : 1;
  const offsetX = ready ? (MAP_W - treeWidth * scale) / 2 : 0;
  const offsetY = ready ? (MAP_H - treeHeight * scale) / 2 : 0;
  // A dot fixed at one size regardless of `scale` reads fine for a small family,
  // but as the tree grows, `scale` shrinks (more world packed into the same
  // MAP_W x MAP_H box) and a still-full-size dot then covers proportionally more
  // of that shrunken space — nearby people's dots start overlapping into an
  // unreadable smear. Scaling the radius down alongside it keeps dots roughly as
  // visually distinct at any family size, not just the one this was tuned for.
  const dotRadius = Math.max(0.8, Math.min(2.2, scale * 30));

  // Current visible area, converted from screen/pan/zoom space into tree-space.
  const viewX = -pan.x / zoom;
  const viewY = -pan.y / zoom;
  const viewW = viewportSize.width / zoom;
  const viewH = viewportSize.height / zoom;

  const navigateFromEvent = useCallback(
    (e) => {
      const rect = mapRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      onNavigate((mx - offsetX) / scale, (my - offsetY) / scale);
    },
    [offsetX, offsetY, scale, onNavigate]
  );

  const handlePointerDown = (e) => {
    navigateFromEvent(e);
    const onMove = (moveEvent) => navigateFromEvent(moveEvent);
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  if (!ready) return null;

  return (
    <div
      className="mini-map"
      ref={mapRef}
      onPointerDown={handlePointerDown}
      title="Click or drag to jump around the tree"
    >
      <svg width={MAP_W} height={MAP_H}>
        {nodes.map((n) => (
          <circle key={n.id} className="mini-map-dot" cx={offsetX + n.x * scale} cy={offsetY + n.y * scale} r={dotRadius} />
        ))}
        <rect
          className="mini-map-viewport"
          x={offsetX + viewX * scale}
          y={offsetY + viewY * scale}
          width={Math.max(viewW * scale, 4)}
          height={Math.max(viewH * scale, 4)}
        />
      </svg>
    </div>
  );
}
