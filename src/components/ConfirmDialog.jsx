import { AlertTriangle } from 'lucide-react';
import Modal from './Modal';
import '../styles/ConfirmDialog.css';

// A single deliberate step for actions that are hard to walk back (deleting a
// person, linking your account to one) — used in place of native window.confirm
// so it can't be reflexively dismissed the way stacked OK/Cancel popups can, and
// so a `danger` action reads as clearly destructive (red) rather than neutral.
// `icon`/`cancelLabel` are overridable so this same shell also covers friendlier,
// non-destructive prompts (e.g. the "add yourself" welcome nudge) without them
// looking like a warning.
export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  icon: Icon = AlertTriangle,
  danger,
  onConfirm,
  onCancel,
}) {
  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={title} width={380} className="confirm-dialog">
      <div className={`confirm-dialog-icon${danger ? ' confirm-dialog-icon-danger' : ''}`}>
        <Icon size={20} />
      </div>
      <h3 className="confirm-dialog-title">{title}</h3>
      <p className="confirm-dialog-message">{message}</p>
      <div className="confirm-dialog-actions">
        <button type="button" className="confirm-dialog-cancel" onClick={onCancel}>
          {cancelLabel}
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
