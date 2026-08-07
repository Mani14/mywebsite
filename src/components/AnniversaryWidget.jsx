import { Heart, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { getDaysUntilBirthday, getFullName } from '../utils/familyUtils';
import '../styles/BirthdayWidget.css';

const WINDOW_DAYS = 30;
const DISMISS_KEY = 'family-hierarchy-anniversary-dismissed';

// Mirrors BirthdayWidget exactly, just keyed on marriageDate instead of dob —
// getDaysUntilBirthday is really "days until this month/day next recurs", which
// is equally correct for a wedding anniversary. marriageDate is mirrored on
// BOTH spouses, so dedupe by the pair (not the person) or every couple would
// show up twice.
export default function AnniversaryWidget({ persons, onSelect }) {
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(DISMISS_KEY) === '1');

  const upcoming = useMemo(() => {
    const today = new Date();
    const seen = new Set();
    const results = [];
    Object.values(persons).forEach((person) => {
      if (!person.marriageDate || !person.spouseId) return;
      const spouse = persons[person.spouseId];
      if (!spouse) return;
      const key = [person.id, spouse.id].sort().join('|');
      if (seen.has(key)) return;
      seen.add(key);
      const days = getDaysUntilBirthday(person.marriageDate, today);
      if (days != null && days <= WINDOW_DAYS) results.push({ a: person, b: spouse, days });
    });
    return results.sort((x, y) => x.days - y.days);
  }, [persons]);

  if (dismissed || upcoming.length === 0) return null;

  const dismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  };

  return (
    <div className="birthday-widget anniversary-widget">
      <Heart size={16} className="birthday-widget-icon anniversary-widget-icon" aria-hidden="true" fill="currentColor" />
      <div className="birthday-widget-list">
        {upcoming.map(({ a, b, days }) => (
          <button
            key={a.id + b.id}
            type="button"
            className="birthday-widget-item"
            onClick={() => onSelect(a.id)}
          >
            {getFullName(a)} &amp; {getFullName(b)}
            {days === 0 ? "'s anniversary is today!" : `'s anniversary in ${days} day${days === 1 ? '' : 's'}`}
          </button>
        ))}
      </div>
      <button type="button" className="birthday-widget-close" onClick={dismiss} title="Dismiss" aria-label="Dismiss anniversary reminders">
        <X size={15} />
      </button>
    </div>
  );
}
