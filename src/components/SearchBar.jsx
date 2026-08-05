import { AnimatePresence, motion } from 'framer-motion';
import { BadgeCheck, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getFullName } from '../utils/familyUtils';
import '../styles/SearchBar.css';

const MAX_RESULTS = 8;

export default function SearchBar({ persons, onLocate, onViewDetails, meId, onSetMe }) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  // Distinguishes a single click (locate) from a double click (view details): the
  // first click waits briefly to see if a second one lands before acting.
  const clickTimerRef = useRef(null);

  useEffect(() => () => clearTimeout(clickTimerRef.current), []);

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return [];
    return Object.values(persons)
      .filter((person) => getFullName(person).toLowerCase().includes(term))
      .slice(0, MAX_RESULTS);
  }, [persons, query]);

  const close = () => {
    setQuery('');
    setIsOpen(false);
  };

  const handleResultClick = (id) => {
    if (clickTimerRef.current) return; // a double-click is in progress
    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null;
      onLocate(id);
      close();
    }, 250);
  };

  const handleResultDoubleClick = (id) => {
    clearTimeout(clickTimerRef.current);
    clickTimerRef.current = null;
    onViewDetails(id);
    close();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      close();
    } else if (e.key === 'Enter' && matches.length > 0) {
      onViewDetails(matches[0].id);
      close();
    }
  };

  return (
    <div className="search-bar">
      <Search size={14} className="search-bar-icon" />
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
      <AnimatePresence>
        {isOpen && query.trim() && (
          <motion.ul
            className="search-bar-results glass-surface"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
          >
            {matches.length > 0 ? (
              matches.map((person) => {
                const isMe = !!meId && meId === person.id;
                return (
                  <li key={person.id} className="search-bar-result-row">
                    <button
                      type="button"
                      onClick={() => handleResultClick(person.id)}
                      onDoubleClick={() => handleResultDoubleClick(person.id)}
                      title="Click to locate · double-click for details"
                    >
                      {getFullName(person)}
                    </button>
                    {onSetMe && (
                      <button
                        type="button"
                        className={`search-bar-mark-me${isMe ? ' is-me' : ''}`}
                        title={isMe ? 'This is you' : 'Mark as Me'}
                        aria-label={isMe ? `${getFullName(person)} is marked as you` : `Mark ${getFullName(person)} as you`}
                        onClick={() => onSetMe(isMe ? null : person.id)}
                      >
                        <BadgeCheck size={14} />
                      </button>
                    )}
                  </li>
                );
              })
            ) : (
              <li className="search-bar-empty">No matches</li>
            )}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
