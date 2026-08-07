import { useState } from 'react';
import { motion } from 'framer-motion';
import { BadgeCheck, Baby, Briefcase, Cake, ChevronDown, ChevronUp, Crown, GitBranch, HeartHandshake, Mail, MapPin, PartyPopper, Pencil, Phone, Route, Sparkles, Trash2, UserPlus, Users, X, XCircle } from 'lucide-react';
import {
  formatDateDisplay,
  getAgeInfo,
  getChildren,
  getDaysUntilBirthday,
  getFamilyStats,
  getFullName,
  getInitials,
  getParents,
  getRelationshipLabel,
  getRelationshipLabelTamil,
  getSiblings,
  getSpouse,
} from '../utils/familyUtils';
import '../styles/PersonDetail.css';

// `onReorder` (Children only — order is meaningless for Spouse/Parents/Siblings)
// moves a child earlier/later among ITS OWN siblings, kept in sync across every
// one of the child's recorded parents (see useFamily's reorderChild) — the only
// way to capture birth order when exact DOB isn't known. Drag-and-drop is layered
// on top of the same one-step-at-a-time primitive: a drop just replays it enough
// times to walk the dragged child from its old index to the new one, rather than
// needing a separate "move to index" data operation. Native HTML5 drag doesn't
// fire from touch, so it's a mouse-only shortcut — the arrows stay the only way
// to reorder on a phone, which is why they're never removed.
function RelationList({ title, people, onNavigate, onUnlink, onReorder }) {
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);
  if (people.length === 0) return null;

  const handleDrop = (index) => {
    if (dragIndex !== null && dragIndex !== index) {
      const steps = index - dragIndex;
      const direction = steps > 0 ? 'down' : 'up';
      const draggedId = people[dragIndex].id;
      // One call for the whole drag, not one per slot moved — see reorderChild's
      // own comment for why (each call is its own undo-history entry).
      onReorder(draggedId, direction, Math.abs(steps));
    }
    setDragIndex(null);
    setOverIndex(null);
  };

  return (
    <div className="detail-relation">
      <span className="detail-relation-title">
        {title}
        {onReorder && people.length > 1 && (
          <span className="detail-relation-hint">— drag, or use ▲▼, to reorder</span>
        )}
      </span>
      <div className="detail-relation-links">
        {people.map((p, index) => (
          <span
            key={p.id}
            className={[
              'detail-link-row',
              dragIndex === index && 'detail-link-row-dragging',
              overIndex === index && dragIndex !== null && dragIndex !== index && 'detail-link-row-drop-target',
            ].filter(Boolean).join(' ')}
            draggable={!!onReorder}
            onDragStart={onReorder ? () => setDragIndex(index) : undefined}
            onDragOver={onReorder ? (e) => { e.preventDefault(); setOverIndex(index); } : undefined}
            onDrop={onReorder ? (e) => { e.preventDefault(); handleDrop(index); } : undefined}
            onDragEnd={onReorder ? () => { setDragIndex(null); setOverIndex(null); } : undefined}
          >
            {onReorder && (
              <span className="detail-reorder">
                <button
                  type="button"
                  className="detail-reorder-btn"
                  disabled={index === 0}
                  title={`Move ${getFullName(p)} earlier`}
                  onClick={() => onReorder(p.id, 'up')}
                >
                  <ChevronUp size={12} />
                </button>
                <button
                  type="button"
                  className="detail-reorder-btn"
                  disabled={index === people.length - 1}
                  title={`Move ${getFullName(p)} later`}
                  onClick={() => onReorder(p.id, 'down')}
                >
                  <ChevronDown size={12} />
                </button>
              </span>
            )}
            <button type="button" className="detail-link" onClick={() => onNavigate(p.id)}>
              {getFullName(p)}
            </button>
            {onUnlink && (
              <button
                type="button"
                className="detail-unlink"
                title={`Remove ${getFullName(p)}`}
                onClick={() => onUnlink(p.id)}
              >
                ×
              </button>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function PersonDetail({
  person,
  persons,
  isRoot,
  anchorId,
  anchorContext,
  isHighlighted,
  meId,
  onSetMe,
  onClose,
  onNavigate,
  onEdit,
  onAddChild,
  onAddSpouse,
  onAddParent,
  onAddSibling,
  onDelete,
  onSetRoot,
  onViewTree,
  onUnlinkSpouse,
  onUnlinkParent,
  onUnlinkChild,
  onReorderChild,
  onHighlightLineage,
  onClearHighlight,
  onFindConnection,
}) {
  if (!person) return null;

  const spouse = getSpouse(persons, person);
  const parents = getParents(persons, person);
  const children = getChildren(persons, person);
  const siblings = getSiblings(persons, person);
  const ageInfo = getAgeInfo(person);
  const baseRelationship = anchorId ? getRelationshipLabel(persons, person.id, anchorId) : null;
  const tamilRelationship = anchorId ? getRelationshipLabelTamil(persons, person.id, anchorId) : null;
  const relationshipLabel = baseRelationship
    ? `${tamilRelationship ? `${tamilRelationship} · ` : ''}${baseRelationship} (to ${anchorContext})`
    : null;
  const daysUntilBirthday = person.isAlive ? getDaysUntilBirthday(person.dob) : null;
  const stats = getFamilyStats(persons, person);
  const hasStats = stats && (stats.childrenCount > 0 || stats.grandchildrenCount > 0 || stats.siblingsCount > 0);
  const isMe = !!meId && meId === person.id;

  return (
    <motion.aside
      className="person-detail glass-surface"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
    >
      <div className="detail-header">
        <button type="button" className="detail-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
        <span className={`avatar avatar-${person.gender} detail-avatar`}>
          {person.photo ? <img src={person.photo} alt="" /> : getInitials(person)}
        </span>
        <div>
          <div className="detail-name-row">
            <h2 className="detail-name">
              {!person.isAlive && <span className="dagger">†</span>}
              {getFullName(person)}
              {person.petName?.trim() && <span className="detail-pet-name">({person.petName.trim()})</span>}
            </h2>
            <button type="button" className="detail-edit-btn" onClick={onEdit} title="Edit" aria-label="Edit">
              <Pencil size={13} />
            </button>
          </div>
          {!person.isAlive && <span className="detail-badge">Passed Away</span>}
          {relationshipLabel && (
            <span className="detail-badge detail-badge-relation">{relationshipLabel}</span>
          )}
          {ageInfo && (
            <span className="detail-age">
              {ageInfo.label}: {ageInfo.value}
            </span>
          )}
        </div>
      </div>

      <div className="detail-fields">
        {person.dob && <div className="detail-field"><Cake size={14} /> {formatDateDisplay(person.dob)}</div>}
        {!person.isAlive && person.dod && <div className="detail-field">🕊️ {formatDateDisplay(person.dod)}</div>}
        {person.work && <div className="detail-field"><Briefcase size={14} /> {person.work}</div>}
        {person.location && <div className="detail-field"><MapPin size={14} /> {person.location}</div>}
        {person.phone && <div className="detail-field"><Phone size={14} /> {person.phone}</div>}
        {person.email && <div className="detail-field"><Mail size={14} /> {person.email}</div>}
        {daysUntilBirthday != null && (
          <div className="detail-field">
            <PartyPopper size={14} />{' '}
            {daysUntilBirthday === 0 ? 'Birthday is today!' : `Birthday in ${daysUntilBirthday} day${daysUntilBirthday === 1 ? '' : 's'}`}
          </div>
        )}
      </div>

      {hasStats && (
        <div className="detail-stats">
          {stats.childrenCount > 0 && (
            <span className="detail-stat">
              <strong>{stats.childrenCount}</strong> Child{stats.childrenCount === 1 ? '' : 'ren'}
            </span>
          )}
          {stats.grandchildrenCount > 0 && (
            <span className="detail-stat">
              <strong>{stats.grandchildrenCount}</strong> Grandchild{stats.grandchildrenCount === 1 ? '' : 'ren'}
            </span>
          )}
          {stats.siblingsCount > 0 && (
            <span className="detail-stat">
              <strong>{stats.siblingsCount}</strong> Sibling{stats.siblingsCount === 1 ? '' : 's'}
            </span>
          )}
        </div>
      )}

      {person.notes && (
        <div className="detail-notes">
          <span className="detail-relation-title">Notes</span>
          <p>{person.notes}</p>
        </div>
      )}

      <div className="detail-relations">
        <RelationList
          title={spouse ? `Spouse${person.marriageDate ? ` (m. ${formatDateDisplay(person.marriageDate)})` : ''}` : ''}
          people={spouse ? [spouse] : []}
          onNavigate={onNavigate}
          onUnlink={onUnlinkSpouse}
        />
        <RelationList title="Parents" people={parents} onNavigate={onNavigate} onUnlink={onUnlinkParent} />
        <RelationList
          title="Children"
          people={children}
          onNavigate={onNavigate}
          onUnlink={onUnlinkChild}
          onReorder={onReorderChild}
        />
        <RelationList title="Siblings" people={siblings} onNavigate={onNavigate} />
      </div>

      <div className="detail-actions">
        <button type="button" onClick={onEdit}><Pencil size={14} /> Edit</button>
        <button type="button" onClick={onAddChild}><Baby size={14} /> Add Child</button>
        {!spouse && (
          <button type="button" onClick={onAddSpouse}><HeartHandshake size={14} /> Add Spouse</button>
        )}
        {parents.length < 2 && (
          <button type="button" onClick={onAddParent}><UserPlus size={14} /> Add Parent</button>
        )}
        {onAddSibling && (
          <button type="button" onClick={onAddSibling}><Users size={14} /> Add Sibling</button>
        )}
        {onViewTree && (
          <button type="button" onClick={() => onViewTree(person.id)}><GitBranch size={14} /> View Tree</button>
        )}
        {!isRoot && (
          <button type="button" onClick={onSetRoot}><Crown size={14} /> Set as Root</button>
        )}
        {isHighlighted ? (
          <button type="button" onClick={onClearHighlight}><XCircle size={14} /> Clear Highlight</button>
        ) : (
          <button type="button" onClick={() => onHighlightLineage(person.id)}><Sparkles size={14} /> Highlight Lineage</button>
        )}
        {onFindConnection && (
          <button type="button" onClick={() => onFindConnection(person.id)}><Route size={14} /> Find Connection</button>
        )}
        {onSetMe && (
          <button type="button" onClick={() => onSetMe(isMe ? null : person.id)}>
            <BadgeCheck size={14} /> {isMe ? 'This is You ✓' : 'Mark as Me'}
          </button>
        )}
        <button type="button" className="detail-delete" onClick={onDelete}><Trash2 size={14} /> Delete</button>
      </div>
    </motion.aside>
  );
}
