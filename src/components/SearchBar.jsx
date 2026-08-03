import { useMemo, useState } from 'react';
import { getFullName } from '../utils/familyUtils';
import '../styles/SearchBar.css';

const MAX_RESULTS = 8;

export default function SearchBar({ persons, onSelect }) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return [];
    return Object.values(persons)
      .filter((person) => getFullName(person).toLowerCase().includes(term))
      .slice(0, MAX_RESULTS);
  }, [persons, query]);

  const handleSelect = (id) => {
    onSelect(id);
    setQuery('');
    setIsOpen(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setQuery('');
      setIsOpen(false);
    } else if (e.key === 'Enter' && matches.length > 0) {
      handleSelect(matches[0].id);
    }
  };

  return (
    <div className="search-bar">
      <input
        type="text"
        className="search-bar-input"
        placeholder="Search by name…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setTimeout(() => setIsOpen(false), 150)}
        onKeyDown={handleKeyDown}
      />
      {isOpen && query.trim() && (
        <ul className="search-bar-results">
          {matches.length > 0 ? (
            matches.map((person) => (
              <li key={person.id}>
                <button type="button" onClick={() => handleSelect(person.id)}>
                  {getFullName(person)}
                </button>
              </li>
            ))
          ) : (
            <li className="search-bar-empty">No matches</li>
          )}
        </ul>
      )}
    </div>
  );
}
