import { NODE_H } from '../hooks/useTreeLayout';

// Draws orthogonal parent-to-child connectors as a single SVG path.
export default function ConnectorLines({ links, width, height }) {
  if (!links.length) return null;

  const d = links
    .map(({ fromX, fromY, toX, toY }) => {
      const midY = (fromY + toY) / 2;
      return `M ${fromX} ${fromY} V ${midY} H ${toX} V ${toY}`;
    })
    .join(' ');

  return (
    <svg
      className="connector-svg"
      width={Math.max(width, 1)}
      height={Math.max(height + NODE_H, 1)}
      style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', overflow: 'visible' }}
    >
      <path d={d} fill="none" stroke="var(--color-connector)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
