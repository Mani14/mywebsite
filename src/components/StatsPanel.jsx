import { useMemo, useState } from 'react';
import { computeFamilyStats, getDaysUntilBirthday, getFullName } from '../utils/familyUtils';
import Modal from './Modal';
import '../styles/StatsPanel.css';

// Generation index (0 = topmost ancestor) by walking up the primary parent line.
function generationOf(persons, id) {
  let depth = 0;
  let cur = persons[id];
  const seen = new Set([id]);
  while (cur && cur.parentIds[0] && persons[cur.parentIds[0]] && !seen.has(cur.parentIds[0])) {
    seen.add(cur.parentIds[0]);
    cur = persons[cur.parentIds[0]];
    depth += 1;
  }
  return depth;
}

const byName = (a, b) => getFullName(a).localeCompare(getFullName(b));

// Detailed breakdown modal, opened from the header's stats icon. Every stat value is a
// link that reveals the actual people behind the number; clicking a name jumps to them.
export default function StatsPanel({ persons, isOpen, onClose, onSelect }) {
  const stats = useMemo(() => computeFamilyStats(persons), [persons]);
  const [openKey, setOpenKey] = useState(null);

  const lists = useMemo(() => {
    const all = Object.values(persons);
    const couples = [];
    const seen = new Set();
    for (const p of all) {
      if (p.spouseId && persons[p.spouseId]) {
        const key = [p.id, p.spouseId].sort().join('|');
        if (!seen.has(key)) {
          seen.add(key);
          couples.push([p, persons[p.spouseId]]);
        }
      }
    }
    const generations = new Map();
    for (const p of all) {
      const g = generationOf(persons, p.id);
      if (!generations.has(g)) generations.set(g, []);
      generations.get(g).push(p);
    }
    const upcomingBirthdays = all
      .filter((p) => p.isAlive)
      .map((p) => ({ person: p, days: getDaysUntilBirthday(p.dob) }))
      .filter((entry) => entry.days != null)
      .sort((a, b) => a.days - b.days)
      .slice(0, 10);
    return {
      total: all,
      alive: all.filter((p) => p.isAlive),
      deceased: all.filter((p) => !p.isAlive),
      verified: all.filter((p) => p.verifiedEmail),
      males: all.filter((p) => p.gender === 'male'),
      females: all.filter((p) => p.gender === 'female'),
      other: all.filter((p) => p.gender !== 'male' && p.gender !== 'female'),
      couples,
      generations,
      upcomingBirthdays,
    };
  }, [persons]);

  const go = (id) => {
    onSelect?.(id);
    onClose?.();
  };

  const NameButton = ({ person }) => (
    <button type="button" className="stats-panel-name" onClick={() => go(person.id)}>
      {getFullName(person)}
    </button>
  );

  const NameList = ({ people }) => (
    <div className="stats-panel-names-list">
      {[...people].sort(byName).map((p) => (
        <NameButton key={p.id} person={p} />
      ))}
    </div>
  );

  const cards = [
    { key: 'total', value: stats.totalMembers, label: 'Total members' },
    { key: 'generations', value: stats.generationCount, label: 'Generations' },
    { key: 'couples', value: stats.marriedCouples, label: 'Married couples' },
    { key: 'alive', value: stats.alive, label: 'Living' },
    { key: 'deceased', value: stats.deceased, label: 'Deceased' },
    { key: 'verified', value: stats.verifiedProfiles, label: 'Verified profiles' },
  ];

  const toggle = (key) => setOpenKey((prev) => (prev === key ? null : key));

  const renderDetail = () => {
    if (!openKey) return null;
    if (openKey === 'couples') {
      return (
        <div className="stats-panel-names">
          <h3>Married couples</h3>
          <div className="stats-panel-names-list">
            {lists.couples
              .slice()
              .sort((a, b) => byName(a[0], b[0]))
              .map(([a, b]) => (
                <span key={a.id + b.id} className="stats-panel-couple">
                  <button type="button" className="stats-panel-name" onClick={() => go(a.id)}>{getFullName(a)}</button>
                  <span className="stats-panel-amp"> &amp; </span>
                  <button type="button" className="stats-panel-name" onClick={() => go(b.id)}>{getFullName(b)}</button>
                </span>
              ))}
          </div>
        </div>
      );
    }
    if (openKey === 'generations') {
      const gens = [...lists.generations.entries()].sort((a, b) => a[0] - b[0]);
      return (
        <div className="stats-panel-names">
          <h3>By generation</h3>
          {gens.map(([g, people]) => (
            <div key={g} className="stats-panel-gen-group">
              <span className="stats-panel-gen-title">Generation {g + 1} <span className="stats-panel-count">{people.length}</span></span>
              <NameList people={people} />
            </div>
          ))}
        </div>
      );
    }
    const titles = { total: 'All members', alive: 'Living', deceased: 'Deceased', verified: 'Verified profiles', males: 'Male', females: 'Female', other: 'Other' };
    return (
      <div className="stats-panel-names">
        <h3>{titles[openKey]}</h3>
        <NameList people={lists[openKey] || []} />
      </div>
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Family Statistics" width="480px" className="stats-panel">
        <h2>Family Statistics</h2>

        <div className="stats-panel-grid">
          {cards.map(({ key, value, label }) => (
            <button
              key={key}
              type="button"
              className={`stats-panel-card${openKey === key ? ' is-open' : ''}`}
              onClick={() => toggle(key)}
            >
              <span className="stats-panel-value">{value}</span>
              <span className="stats-panel-label">{label}</span>
            </button>
          ))}
        </div>

        <div className="stats-panel-row">
          <span className="stats-panel-row-label">By gender</span>
          <span>
            <button type="button" className="stats-panel-gender" onClick={() => toggle('males')}>{stats.males} male</button>
            {', '}
            <button type="button" className="stats-panel-gender" onClick={() => toggle('females')}>{stats.females} female</button>
            {stats.other ? (<>{', '}<button type="button" className="stats-panel-gender" onClick={() => toggle('other')}>{stats.other} other</button></>) : ''}
          </span>
        </div>

        {renderDetail()}

        {lists.upcomingBirthdays.length > 0 && (
          <div className="stats-panel-section">
            <h3>Upcoming birthdays <span className="stats-panel-count">{lists.upcomingBirthdays.length} people</span></h3>
            <ul>
              {lists.upcomingBirthdays.map(({ person, days }) => (
                <li key={person.id}>
                  <button type="button" className="stats-panel-name" onClick={() => go(person.id)}>{getFullName(person)}</button>
                  <span className="stats-panel-count">{days === 0 ? 'Today' : `${days}d`}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {stats.topLocations?.length > 0 && (
          <div className="stats-panel-section">
            <h3>Top locations</h3>
            <ul>
              {stats.topLocations.map(({ name, count }) => (
                <li key={name}>{name} <span className="stats-panel-count">{count}</span></li>
              ))}
            </ul>
          </div>
        )}
    </Modal>
  );
}
