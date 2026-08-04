import { motion } from 'framer-motion';
import { BadgeCheck, Baby, Briefcase, Cake, Crown, HeartHandshake, Mail, MapPin, PartyPopper, Pencil, Phone, Sparkles, Trash2, UserPlus, X, XCircle } from 'lucide-react';
import {
  getAgeInfo,
  getChildren,
  getDaysUntilBirthday,
  getFamilyStats,
  getFullName,
  getInitials,
  getParents,
  getRelationshipLabel,
  getSiblings,
  getSpouse,
} from '../utils/familyUtils';
import '../styles/PersonDetail.css';

function RelationList({ title, people, onNavigate, onUnlink }) {
  if (people.length === 0) return null;
  return (
    <div className="detail-relation">
      <span className="detail-relation-title">{title}</span>
      <div className="detail-relation-links">
        {people.map((p) => (
          <span key={p.id} className="detail-link-row">
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
  rootPersonId,
  isHighlighted,
  meId,
  onSetMe,
  onClose,
  onNavigate,
  onEdit,
  onAddChild,
  onAddSpouse,
  onAddParent,
  onDelete,
  onSetRoot,
  onUnlinkSpouse,
  onUnlinkParent,
  onUnlinkChild,
  onHighlightLineage,
  onClearHighlight,
}) {
  if (!person) return null;

  const spouse = getSpouse(persons, person);
  const parents = getParents(persons, person);
  const children = getChildren(persons, person);
  const siblings = getSiblings(persons, person);
  const ageInfo = getAgeInfo(person);
  const relationshipLabel = getRelationshipLabel(persons, person.id, rootPersonId);
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
      <button type="button" className="detail-close" onClick={onClose} aria-label="Close">
        <X size={18} />
      </button>

      <div className="detail-header">
        <span className={`avatar avatar-${person.gender} detail-avatar`}>
          {person.photo ? <img src={person.photo} alt="" /> : getInitials(person)}
        </span>
        <div>
          <h2 className="detail-name">
            {!person.isAlive && <span className="dagger">†</span>}
            {getFullName(person)}
          </h2>
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
        {person.dob && <div className="detail-field"><Cake size={14} /> {person.dob}</div>}
        {!person.isAlive && person.dod && <div className="detail-field">🕊️ {person.dod}</div>}
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
          title={spouse ? `Spouse${person.marriageDate ? ` (m. ${person.marriageDate})` : ''}` : ''}
          people={spouse ? [spouse] : []}
          onNavigate={onNavigate}
          onUnlink={onUnlinkSpouse}
        />
        <RelationList title="Parents" people={parents} onNavigate={onNavigate} onUnlink={onUnlinkParent} />
        <RelationList title="Children" people={children} onNavigate={onNavigate} onUnlink={onUnlinkChild} />
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
        {!isRoot && (
          <button type="button" onClick={onSetRoot}><Crown size={14} /> Set as Root</button>
        )}
        {isHighlighted ? (
          <button type="button" onClick={onClearHighlight}><XCircle size={14} /> Clear Highlight</button>
        ) : (
          <button type="button" onClick={() => onHighlightLineage(person.id)}><Sparkles size={14} /> Highlight Lineage</button>
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
