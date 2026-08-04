import { useMemo } from 'react';
import { runDataHealthCheck, getFullName } from '../utils/familyUtils';
import Modal from './Modal';
import '../styles/DataHealthCheck.css';

// Modal listing every issue found by runDataHealthCheck (orphaned refs,
// asymmetric relationships, duplicate names, circular ancestry, etc). Clicking
// a linked person navigates the tree to them and closes the modal.
export default function DataHealthCheck({ persons, onNavigate, isOpen, onClose }) {
  const issues = useMemo(() => runDataHealthCheck(persons), [persons]);
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.length - errorCount;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Data Health Check" width="520px" className="data-health-check">
        <h2>Data Health Check</h2>

        {issues.length === 0 ? (
          <p className="data-health-empty">✓ No issues found — the family data looks consistent.</p>
        ) : (
          <>
            <p className="data-health-summary">
              {errorCount} error{errorCount === 1 ? '' : 's'}, {warningCount} warning{warningCount === 1 ? '' : 's'}
            </p>
            <ul className="data-health-list">
              {issues.map((issue, i) => (
                <li key={i} className={`data-health-item data-health-${issue.severity}`}>
                  <span className="data-health-icon" aria-hidden="true">
                    {issue.severity === 'error' ? '⛔' : '⚠️'}
                  </span>
                  <div className="data-health-body">
                    <span className="data-health-message">{issue.message}</span>
                    {issue.personIds?.length > 0 && (
                      <span className="data-health-links">
                        {issue.personIds.map(
                          (pid) =>
                            persons[pid] && (
                              <button
                                key={pid}
                                type="button"
                                onClick={() => {
                                  onNavigate(pid);
                                  onClose();
                                }}
                              >
                                {getFullName(persons[pid])}
                              </button>
                            )
                        )}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
    </Modal>
  );
}
