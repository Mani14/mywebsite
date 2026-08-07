import { useMemo, useState } from 'react';
import Modal from './Modal';
import { getDisplayName, getFullName } from '../utils/familyUtils';
import '../styles/AttachYourself.css';

const MAX_RESULTS = 8;

// Relation options offered for the chosen anchor person, mirroring TreeNode's
// QUICK_ADD_OPTIONS eligibility rules (can't add a 2nd parent or a 2nd spouse).
const RELATION_OPTIONS = [
  { mode: 'addChild', label: 'Their Child', show: () => true },
  { mode: 'addParent', label: 'Their Parent', show: (p) => p.parentIds.length < 2 },
  { mode: 'addSpouse', label: 'Their Spouse', show: (p) => !p.spouseId },
  { mode: 'addSibling', label: 'Their Sibling', show: () => true },
];

// Two-step guided wizard for a signed-in user who isn't in the tree yet:
// 1) search + pick an existing relative to anchor onto, 2) choose your relation
// to them (or, if the anchor already IS you, mark them as "me" directly).
// Confirming a relation calls onAttach(anchorId, mode) so App.jsx can open the
// normal add-relative form (prefilled with the Google profile's name/photo) and
// auto-link the result as "me" once saved.
export default function AttachYourself({ persons, onAttach, onMarkAsMe, onCancel }) {
  const [query, setQuery] = useState('');
  const [anchorId, setAnchorId] = useState(null);

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return [];
    return Object.values(persons)
      .filter((person) => !person.isPlaceholder && getDisplayName(person).toLowerCase().includes(term))
      .slice(0, MAX_RESULTS);
  }, [persons, query]);

  const anchor = anchorId ? persons[anchorId] : null;
  const options = anchor ? RELATION_OPTIONS.filter((opt) => opt.show(anchor)) : [];

  return (
    <Modal isOpen onClose={onCancel} title="Add Yourself to the Tree" width={420} className="attach-yourself-modal">
      {!anchor ? (
        <div className="attach-step">
          <p className="attach-step-hint">Search for a relative already in the tree to attach yourself near.</p>
          <input
            type="text"
            autoFocus
            placeholder="Search by name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="attach-search-input"
          />
          {matches.length > 0 && (
            <ul className="attach-search-results">
              {matches.map((person) => (
                <li key={person.id}>
                  <button type="button" onClick={() => setAnchorId(person.id)}>
                    {getDisplayName(person)}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {query.trim() && matches.length === 0 && <p className="attach-step-empty">No matches found.</p>}
        </div>
      ) : (
        <div className="attach-step">
          <p className="attach-step-hint">
            How are you related to <strong>{getFullName(anchor)}</strong>?
          </p>
          {onMarkAsMe && (
            <button type="button" className="attach-this-is-me-btn" onClick={() => onMarkAsMe(anchor.id)}>
              ✓ This is me — I'm already in the tree
            </button>
          )}
          <div className="attach-relation-options">
            {options.map((opt) => (
              <button key={opt.mode} type="button" onClick={() => onAttach(anchor.id, opt.mode)}>
                {opt.label}
              </button>
            ))}
          </div>
          <button type="button" className="attach-back-btn" onClick={() => setAnchorId(null)}>
            ← Choose a different relative
          </button>
        </div>
      )}
    </Modal>
  );
}
