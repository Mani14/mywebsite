import { useMemo, useState } from 'react';
import Modal from './Modal';
import { getDisplayName } from '../utils/familyUtils';
import '../styles/AttachYourself.css';

const MAX_RESULTS = 8;

// Search-and-pick modal for "Find Connection" — just one step (search, pick),
// unlike AttachYourself's two-step wizard, since there's no relation to choose
// here: the path itself IS the answer (see App's handleConnectionPicked).
// Reuses AttachYourself's own CSS classes rather than duplicating an almost
// identical "search for a person" stylesheet.
export default function FindConnectionModal({ persons, fromId, onPick, onCancel }) {
  const [query, setQuery] = useState('');

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return [];
    return Object.values(persons)
      .filter((p) => p.id !== fromId && !p.isPlaceholder && getDisplayName(p).toLowerCase().includes(term))
      .slice(0, MAX_RESULTS);
  }, [persons, query, fromId]);

  return (
    <Modal isOpen onClose={onCancel} title="Find Connection" width={420} className="attach-yourself-modal">
      <div className="attach-step">
        <p className="attach-step-hint">Search for the person you want to see the connection to.</p>
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
            {matches.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => onPick(p.id)}>
                  {getDisplayName(p)}
                </button>
              </li>
            ))}
          </ul>
        )}
        {query.trim() && matches.length === 0 && <p className="attach-step-empty">No matches found.</p>}
      </div>
    </Modal>
  );
}
