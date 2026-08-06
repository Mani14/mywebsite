import { useMemo } from 'react';
import { AlertTriangle, Info, ShieldCheck, Wrench } from 'lucide-react';
import { runDataHealthCheck } from '../utils/dataHealth';
import { getFullName } from '../utils/familyUtils';
import Modal from './Modal';
import '../styles/DataHealthPanel.css';

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 };
const SEVERITY_LABEL = { error: 'Error', warning: 'Warning', info: 'Info' };

// Applies a fix descriptor from dataHealth.js against the LIVE persons object
// (read fresh here, not whatever it was when the issue was first detected) so a
// fix is never computed from data that's since moved on.
function applyFix(persons, updatePerson, fix) {
  if (!fix) return;
  switch (fix.action) {
    case 'removeSelfParent': {
      const p = persons[fix.personId];
      if (p) updatePerson(fix.personId, { parentIds: p.parentIds.filter((pid) => pid !== fix.personId) });
      break;
    }
    case 'removeSelfChild': {
      const p = persons[fix.personId];
      if (p) updatePerson(fix.personId, { childrenIds: p.childrenIds.filter((cid) => cid !== fix.personId) });
      break;
    }
    case 'removeSelfSpouse': {
      updatePerson(fix.personId, { spouseId: '' });
      break;
    }
    case 'removeDanglingParent': {
      const p = persons[fix.personId];
      if (p) updatePerson(fix.personId, { parentIds: p.parentIds.filter((pid) => pid !== fix.missingId) });
      break;
    }
    case 'removeDanglingChild': {
      const p = persons[fix.personId];
      if (p) updatePerson(fix.personId, { childrenIds: p.childrenIds.filter((cid) => cid !== fix.missingId) });
      break;
    }
    case 'removeDanglingSpouse': {
      updatePerson(fix.personId, { spouseId: '' });
      break;
    }
    case 'dedupeParents': {
      const p = persons[fix.personId];
      if (p) updatePerson(fix.personId, { parentIds: [...new Set(p.parentIds)] });
      break;
    }
    case 'dedupeChildren': {
      const p = persons[fix.personId];
      if (p) updatePerson(fix.personId, { childrenIds: [...new Set(p.childrenIds)] });
      break;
    }
    case 'addChildBackLink': {
      const parent = persons[fix.parentId];
      if (parent && !parent.childrenIds.includes(fix.childId)) {
        updatePerson(fix.parentId, { childrenIds: [...parent.childrenIds, fix.childId] });
      }
      break;
    }
    case 'addParentBackLink': {
      const child = persons[fix.childId];
      if (child && child.parentIds.length < 2 && !child.parentIds.includes(fix.parentId)) {
        updatePerson(fix.childId, { parentIds: [...child.parentIds, fix.parentId] });
      }
      break;
    }
    case 'syncSpouseLink': {
      const spouse = persons[fix.spouseId];
      if (spouse && !spouse.spouseId) {
        updatePerson(fix.spouseId, { spouseId: fix.personId });
      }
      break;
    }
    default:
      break;
  }
}

// Scans the dataset for relationship inconsistencies (dangling references,
// duplicate array entries, asymmetric links, unfilled placeholders) — the exact
// shape of bug that otherwise only surfaces indirectly, as a missing jump badge or
// a floating disconnected cluster, and normally takes exporting the data to diagnose.
export default function DataHealthPanel({ persons, isOpen, onClose, onSelect, updatePerson }) {
  const issues = useMemo(() => (isOpen ? runDataHealthCheck(persons) : []), [isOpen, persons]);
  const sorted = useMemo(
    () => [...issues].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]),
    [issues]
  );

  const go = (id) => {
    onSelect?.(id);
    onClose?.();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Data Health Check" width="540px" className="data-health-panel">
      <h2>Data Health Check</h2>

      {sorted.length === 0 ? (
        <div className="data-health-empty">
          <ShieldCheck size={32} />
          <p>No issues found — every relationship in the tree is consistent.</p>
        </div>
      ) : (
        <>
          <p className="data-health-summary">{sorted.length} issue{sorted.length === 1 ? '' : 's'} found</p>
          <ul className="data-health-list">
            {sorted.map((issue) => (
              <li key={issue.id} className={`data-health-item data-health-${issue.severity}`}>
                {issue.severity === 'info' ? <Info size={16} /> : <AlertTriangle size={16} />}
                <div className="data-health-body">
                  <span className="data-health-category">
                    {issue.category} <span className="data-health-severity">{SEVERITY_LABEL[issue.severity]}</span>
                  </span>
                  <p className="data-health-message">{issue.message}</p>
                  <div className="data-health-actions">
                    {issue.personIds.filter((pid) => persons[pid]).map((pid) => (
                      <button key={pid} type="button" className="data-health-view" onClick={() => go(pid)}>
                        View {getFullName(persons[pid])}
                      </button>
                    ))}
                    {issue.fix && (
                      <button
                        type="button"
                        className="data-health-fix"
                        onClick={() => applyFix(persons, updatePerson, issue.fix)}
                      >
                        <Wrench size={12} /> {issue.fix.label}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}
