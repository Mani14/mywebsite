import { useMemo } from 'react';
import { computeFamilyStats } from '../utils/familyUtils';
import Modal from './Modal';
import '../styles/StatsPanel.css';

// Detailed breakdown modal, opened from StatsBar's "Full Stats" link.
export default function StatsPanel({ persons, isOpen, onClose }) {
  const stats = useMemo(() => computeFamilyStats(persons), [persons]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Family Statistics" width="480px" className="stats-panel">
        <h2>Family Statistics</h2>

        <div className="stats-panel-grid">
          <div className="stats-panel-card">
            <span className="stats-panel-value">{stats.totalMembers}</span>
            <span className="stats-panel-label">Total members</span>
          </div>
          <div className="stats-panel-card">
            <span className="stats-panel-value">{stats.generationCount}</span>
            <span className="stats-panel-label">Generations</span>
          </div>
          <div className="stats-panel-card">
            <span className="stats-panel-value">{stats.marriedCouples}</span>
            <span className="stats-panel-label">Married couples</span>
          </div>
          <div className="stats-panel-card">
            <span className="stats-panel-value">{stats.alive}</span>
            <span className="stats-panel-label">Living</span>
          </div>
          <div className="stats-panel-card">
            <span className="stats-panel-value">{stats.deceased}</span>
            <span className="stats-panel-label">Deceased</span>
          </div>
          <div className="stats-panel-card">
            <span className="stats-panel-value">{stats.verifiedProfiles}</span>
            <span className="stats-panel-label">Verified profiles</span>
          </div>
        </div>

        <div className="stats-panel-row">
          <span className="stats-panel-row-label">By gender</span>
          <span>{stats.males} male, {stats.females} female{stats.other ? `, ${stats.other} other` : ''}</span>
        </div>

        {stats.topLastNames?.length > 0 && (
          <div className="stats-panel-section">
            <h3>Top last names</h3>
            <ul>
              {stats.topLastNames.map(({ name, count }) => (
                <li key={name}>{name} <span className="stats-panel-count">{count}</span></li>
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
