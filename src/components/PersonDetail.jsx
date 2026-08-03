import {
  getAgeInfo,
  getChildren,
  getFullName,
  getInitials,
  getParents,
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
}) {
  if (!person) return null;

  const spouse = getSpouse(persons, person);
  const parents = getParents(persons, person);
  const children = getChildren(persons, person);
  const siblings = getSiblings(persons, person);
  const ageInfo = getAgeInfo(person);

  return (
    <aside className="person-detail">
      <button type="button" className="detail-close" onClick={onClose} aria-label="Close">
        ×
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
          {ageInfo && (
            <span className="detail-age">
              {ageInfo.label}: {ageInfo.value}
            </span>
          )}
        </div>
      </div>

      <div className="detail-fields">
        {person.dob && <div className="detail-field">🎂 {person.dob}</div>}
        {!person.isAlive && person.dod && <div className="detail-field">🕊️ {person.dod}</div>}
        {person.work && <div className="detail-field">💼 {person.work}</div>}
        {person.location && <div className="detail-field">📍 {person.location}</div>}
        {person.phone && <div className="detail-field">📞 {person.phone}</div>}
      </div>

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
        <button type="button" onClick={onEdit}>Edit</button>
        <button type="button" onClick={onAddChild}>Add Child</button>
        {!spouse && (
          <button type="button" onClick={onAddSpouse}>Add Spouse</button>
        )}
        {parents.length < 2 && (
          <button type="button" onClick={onAddParent}>Add Parent</button>
        )}
        {!isRoot && (
          <button type="button" onClick={onSetRoot}>Set as Root</button>
        )}
        <button type="button" className="detail-delete" onClick={onDelete}>Delete</button>
      </div>
    </aside>
  );
}
