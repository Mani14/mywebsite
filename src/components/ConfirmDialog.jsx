import { AlertTriangle } from 'lucide-react';
import Modal from './Modal';
import '../styles/ConfirmDialog.css';

// A single deliberate step for actions that are hard to walk back (deleting a
// person, linking your account to one) — used in place of native window.confirm
// so it can't be reflexively dismissed the way stacked OK/Cancel popups can, and
// so a `danger` action reads as clearly destructive (red) rather than neutral.
export default function ConfirmDialog({ isOpen, title, message, confirmLabel = 'Confirm', danger, onConfirm, onCancel }) {
  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={title} width={380} className="confirm-dialog">
      <div className={`confirm-dialog-icon${danger ? ' confirm-dialog-icon-danger' : ''}`}>
        <AlertTriangle size={20} />
      </div>
      <h3 className="confirm-dialog-title">{title}</h3>
      <p className="confirm-dialog-message">{message}</p>
      <div className="confirm-dialog-actions">
        <button type="button" className="confirm-dialog-cancel" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className={`confirm-dialog-confirm${danger ? ' confirm-dialog-confirm-danger' : ''}`}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
