import { useEffect, useRef, useState } from 'react';
import { NODE_W, NODE_H, COUPLE_GAP, AVATAR_SIZE } from '../hooks/useTreeLayout';
import { getFullName, getInitials } from '../utils/familyUtils';

// Half of the empty space beside the avatar within a card, so the link can reach the circle's edge.
const CARD_SIDE_GAP = (NODE_W - AVATAR_SIZE) / 2;

const QUICK_ADD_OPTIONS = [
  // Covers both the first and second parent — dashed Add father/mother circles
  // are reserved for the auto-created "no linkage found" placeholder (see
  // TreeNode's isPlaceholder branch), not for every parentless real person.
  { mode: 'addParent', label: 'Add Parent', show: (p) => p.parentIds.length < 2 },
  { mode: 'addSpouse', label: 'Add Spouse', show: (p, hasSpouse) => !hasSpouse },
  { mode: 'addChild', label: 'Add Child', show: () => true },
  // Works even with no recorded parents yet — addSibling creates a clearly-
  // labeled "Unknown Parent" placeholder behind the scenes in that case.
  { mode: 'addSibling', label: 'Add Sibling', show: () => true },
];

function MiniCard({ person, isFocus, hasSpouse, showJumpLink, onSelect, onQuickAdd, onJumpTo }) {
  const genderClass = `avatar avatar-${person.gender}`;
  const deceased = !person.isAlive;
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef(null);

  // Closes the quick-add menu on any click outside this card.
  useEffect(() => {
    if (!menuOpen) return;
    const handlePointerDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [menuOpen]);

  const options = QUICK_ADD_OPTIONS.filter((opt) => opt.show(person, hasSpouse));

  return (
    <div
      className={`mini-card-wrap${isFocus ? ' mini-card-wrap-focus' : ''}${menuOpen ? ' mini-card-wrap-menu-open' : ''}`}
      ref={wrapRef}
    >
      <button
        type="button"
        className={`mini-card${deceased ? ' mini-card-deceased' : ''}${isFocus ? ' mini-card-focus' : ''}`}
        style={{ width: NODE_W, height: NODE_H }}
        onClick={() => onSelect(person.id)}
        title={getFullName(person)}
      >
        <span className={genderClass}>
          {person.photo ? <img src={person.photo} alt="" /> : getInitials(person)}
        </span>
        <span className="mini-name">
          {deceased && <span className="dagger">†</span>}
          {getFullName(person)}
        </span>
      </button>

      {showJumpLink && (
        <button
          type="button"
          className="mini-card-jump"
          title="Has their own family recorded — jump to their family tree"
          onClick={(e) => {
            e.stopPropagation();
            onJumpTo(person.id);
          }}
        >
          🔗
        </button>
      )}

      {options.length > 0 && (
        <div className="mini-card-add-anchor">
          <button
            type="button"
            className="mini-card-add"
            title="Add relative"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((open) => !open);
            }}
          >
            +
          </button>

          {menuOpen && (
            <div className="mini-card-menu">
              {options.map((opt) => (
                <button
                  key={opt.mode}
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onQuickAdd(person.id, opt.mode);
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// A positioned node holding a person (and optional spouse) plus an expand toggle.
export default function TreeNode({ node, focusId, onSelect, onToggle, onQuickAdd, onJumpTo }) {
  const { person, spouse, x, y, coupleWidth } = node;
  const left = x - coupleWidth / 2;

  // A shared placeholder parent auto-created by "Add Sibling" (see useFamily's
  // addSibling) is never drawn as its own card — instead its row shows the same
  // "Add father"/"Add mother" boxes a true lineage root would, so filling either
  // one in edits this placeholder in place rather than adding a brand new person.
  if (person.isPlaceholder) {
    return (
      <div className="tree-node" style={{ left, top: y, width: coupleWidth }}>
        <div className="couple parent-only-node">
          <button
            type="button"
            className="parent-placeholder"
            onClick={(e) => {
              e.stopPropagation();
              onQuickAdd(person.id, 'fillPlaceholderParent', 'father');
            }}
          >
            <span className="parent-placeholder-box">+</span>
            <span className="parent-placeholder-label">Add father</span>
          </button>
          <span className="parent-placeholder-bar" aria-hidden="true" />
          <button
            type="button"
            className="parent-placeholder"
            onClick={(e) => {
              e.stopPropagation();
              onQuickAdd(person.id, 'fillPlaceholderParent', 'mother');
            }}
          >
            <span className="parent-placeholder-box">+</span>
            <span className="parent-placeholder-label">Add mother</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="tree-node" style={{ left, top: y, width: coupleWidth }}>
      <div className="couple">
        <MiniCard
          person={person}
          isFocus={person.id === focusId}
          hasSpouse={!!spouse}
          onSelect={onSelect}
          onQuickAdd={onQuickAdd}
          onJumpTo={onJumpTo}
        />
        {spouse && (
          <span
            className="couple-link"
            style={{
              width: COUPLE_GAP + CARD_SIDE_GAP * 2,
              marginLeft: -CARD_SIDE_GAP,
              marginRight: -CARD_SIDE_GAP,
            }}
            aria-hidden="true"
          />
        )}
        {spouse && (
          <MiniCard
            person={spouse}
            isFocus={spouse.id === focusId}
            hasSpouse
            // Anyone married in who has their own recorded parents has a family
            // tree of their own somewhere — always offer a jump link to it,
            // regardless of whether that family happens to be rendered on this
            // same canvas (Full Tree View) or is entirely out of view (Pedigree
            // View only ever shows the focus person's own two lineages).
            showJumpLink={spouse.parentIds.length > 0}
            onSelect={onSelect}
            onQuickAdd={onQuickAdd}
            onJumpTo={onJumpTo}
          />
        )}
      </div>

      {node.hasChildren && (
        <button
          type="button"
          className="toggle-btn"
          onClick={() => onToggle(person.id)}
          title={node.collapsed ? 'Expand children' : 'Collapse children'}
        >
          {node.collapsed ? '+' : '\u2212'}
        </button>
      )}
    </div>
  );
}
