import { NODE_H } from '../hooks/useTreeLayout';

function pathFor(links) {
  return links
    .map(({ fromX, fromY, toX, toY }) => {
      const midY = (fromY + toY) / 2;
      return `M ${fromX} ${fromY} V ${midY} H ${toX} V ${toY}`;
    })
    .join(' ');
}

// Draws orthogonal parent-to-child connectors as a single SVG path. When
// `highlightedPairs` (a Set of "parentId|childId" strings) is given, links whose
// parentId/childId are both part of the highlighted lineage chain are additionally
// drawn a second time, on top, in the highlight colour.
export default function ConnectorLines({ links, width, height, highlightedPairs }) {
  if (!links.length) return null;

  const d = pathFor(links);
  const highlighted = highlightedPairs?.size
    ? links.filter((l) => l.parentId && l.childId && highlightedPairs.has(`${l.parentId}|${l.childId}`))
    : [];

  return (
    <svg
      className="connector-svg"
      width={Math.max(width, 1)}
      height={Math.max(height + NODE_H, 1)}
      style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', overflow: 'visible' }}
    >
      <path d={d} fill="none" stroke="var(--color-connector)" strokeWidth="2.5" strokeLinecap="round" />
      {highlighted.length > 0 && (
        <path
          key="highlight"
          className="connector-highlight"
          d={pathFor(highlighted)}
          fill="none"
          stroke="var(--color-highlight)"
          strokeWidth="4"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
