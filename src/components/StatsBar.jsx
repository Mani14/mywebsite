import { ChevronRight } from 'lucide-react';
import { useMemo } from 'react';
import { computeFamilyStats } from '../utils/familyUtils';
import '../styles/StatsBar.css';

// Always-visible, compact one-line summary of the whole family dataset.
// A "Full Stats" button opens the more detailed StatsPanel modal.
export default function StatsBar({ persons, onOpenDetails }) {
  const stats = useMemo(() => computeFamilyStats(persons), [persons]);

  return (
    <div className="stats-bar">
      <span className="stats-bar-item">
        <strong>{stats.totalMembers}</strong> member{stats.totalMembers === 1 ? '' : 's'}
      </span>
      <span className="stats-bar-item">
        <strong>{stats.generationCount}</strong> generation{stats.generationCount === 1 ? '' : 's'}
      </span>
      <span className="stats-bar-item">
        <strong>{stats.alive}</strong> living / <strong>{stats.deceased}</strong> deceased
      </span>
      <span className="stats-bar-item">
        <strong>{stats.marriedCouples}</strong> couple{stats.marriedCouples === 1 ? '' : 's'}
      </span>
      {stats.avgLifespanYears != null && (
        <span className="stats-bar-item">
          avg lifespan <strong>{stats.avgLifespanYears}</strong> yrs
        </span>
      )}
      <button type="button" className="stats-bar-link" onClick={onOpenDetails}>
        Full Stats <ChevronRight size={13} />
      </button>
    </div>
  );
}
