import { useMemo, useState } from 'react';
import { Camera } from 'lucide-react';
import { getEligibleLinkCandidates, getFullName } from '../utils/familyUtils';
import Modal from './Modal';
import '../styles/PersonForm.css';

const emptyForm = {
  firstName: '',
  lastName: '',
  gender: 'male',
  dob: '',
  dod: '',
  isAlive: true,
  work: '',
  location: '',
  phone: '',
  email: '',
  photo: '',
  notes: '',
  marriageDate: '',
};

// `persons`/`personId`/`relation`/`onLinkExisting` are only passed for add-relative flows
// (addParent/addSpouse/addChild/addSibling) — when present, a "Link Existing" tab lets the
// user attach an already-recorded person instead of creating a duplicate.
export default function PersonForm({
  title,
  initialPerson,
  showMarriageDate,
  onSave,
  onCancel,
  persons,
  personId,
  relation,
  onLinkExisting,
}) {
  const [form, setForm] = useState(() => ({ ...emptyForm, ...initialPerson }));
  const [error, setError] = useState('');
  const canLinkExisting = !!(relation && persons && personId && onLinkExisting);
  const [tab, setTab] = useState('new');
  const [linkQuery, setLinkQuery] = useState('');

  const candidates = useMemo(() => {
    if (!canLinkExisting || tab !== 'link') return [];
    const eligible = getEligibleLinkCandidates(persons, personId, relation);
    const term = linkQuery.trim().toLowerCase();
    const filtered = term ? eligible.filter((p) => getFullName(p).toLowerCase().includes(term)) : eligible;
    return filtered.slice(0, 20);
  }, [canLinkExisting, tab, persons, personId, relation, linkQuery]);

  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setField('photo', reader.result);
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError('First name and last name are required.');
      return;
    }
    onSave(form);
  };

  return (
    <Modal isOpen onClose={onCancel} title={title} width="560px">
      <form className="person-form" onSubmit={handleSubmit}>
        <h2>{title}</h2>
        {error && <p className="person-form-error">{error}</p>}

        {canLinkExisting && (
          <div className="person-form-tabs">
            <button type="button" className={tab === 'new' ? 'active' : ''} onClick={() => setTab('new')}>
              Create New
            </button>
            <button type="button" className={tab === 'link' ? 'active' : ''} onClick={() => setTab('link')}>
              Link Existing
            </button>
          </div>
        )}

        {tab === 'link' ? (
          <div className="person-form-link">
            <label>
              Search existing people
              <input
                type="text"
                autoFocus
                value={linkQuery}
                onChange={(e) => setLinkQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
                placeholder="Type a name…"
              />
            </label>
            <ul className="person-form-link-results">
              {candidates.length > 0 ? (
                candidates.map((p) => (
                  <li key={p.id}>
                    <span>{getFullName(p)}</span>
                    <button type="button" onClick={() => onLinkExisting(p.id)}>Link</button>
                  </li>
                ))
              ) : (
                <li className="person-form-link-empty">
                  {linkQuery.trim() ? 'No eligible matches' : 'No eligible people to link'}
                </li>
              )}
            </ul>
            <div className="person-form-actions">
              <button type="button" onClick={onCancel}>Cancel</button>
            </div>
          </div>
        ) : (
        <>
        <div className="person-form-photo-section">
          <div className="person-form-photo-circle">
            {form.photo ? (
              <img src={form.photo} alt="" />
            ) : (
              <span className="person-form-photo-placeholder">
                {(form.firstName[0] || '') + (form.lastName[0] || '') || '?'}
              </span>
            )}
            <label className="person-form-photo-edit" title="Change photo">
              <Camera size={13} />
              <input type="file" accept="image/*" onChange={handlePhotoChange} />
            </label>
          </div>
          {form.photo && (
            <button type="button" className="person-form-photo-remove" onClick={() => setField('photo', '')}>
              Remove photo
            </button>
          )}
        </div>

        <div className="person-form-section">
          <span className="person-form-section-title">Basic info</span>
          <div className="person-form-row">
            <label>
              First name*
              <input value={form.firstName} onChange={(e) => setField('firstName', e.target.value)} />
            </label>
            <label>
              Last name*
              <input value={form.lastName} onChange={(e) => setField('lastName', e.target.value)} />
            </label>
          </div>

          <div className="person-form-row">
            <label>
              Gender
              <select value={form.gender} onChange={(e) => setField('gender', e.target.value)}>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </label>
            {showMarriageDate && (
              <label>
                Marriage date (optional)
                <input
                  type="date"
                  value={form.marriageDate}
                  onChange={(e) => setField('marriageDate', e.target.value)}
                />
              </label>
            )}
          </div>

          <div className="person-form-row">
            <label>
              Date of birth (optional)
              <input type="date" value={form.dob} onChange={(e) => setField('dob', e.target.value)} />
            </label>
            <label className="person-form-toggle">
              <input
                type="checkbox"
                checked={!form.isAlive}
                onChange={(e) => setField('isAlive', !e.target.checked)}
              />
              <span className="person-form-toggle-track"><span className="person-form-toggle-thumb" /></span>
              Deceased
            </label>
          </div>

          {!form.isAlive && (
            <label>
              Date of death (optional)
              <input type="date" value={form.dod} onChange={(e) => setField('dod', e.target.value)} />
            </label>
          )}
        </div>

        <div className="person-form-section">
          <span className="person-form-section-title">Contact</span>
          <div className="person-form-row">
            <label>
              Work (optional)
              <input value={form.work} onChange={(e) => setField('work', e.target.value)} />
            </label>
            <label>
              Location (optional)
              <input value={form.location} onChange={(e) => setField('location', e.target.value)} />
            </label>
          </div>
          <div className="person-form-row">
            <label>
              Phone (optional)
              <input value={form.phone} onChange={(e) => setField('phone', e.target.value)} />
            </label>
            <label>
              Email (optional)
              <input type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} />
            </label>
          </div>
        </div>

        <div className="person-form-section">
          <span className="person-form-section-title">About</span>
          <label>
            Notes / Bio (optional)
            <textarea rows={3} value={form.notes} onChange={(e) => setField('notes', e.target.value)} />
          </label>
        </div>

        <div className="person-form-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="submit" className="person-form-save">Save</button>
        </div>
        </>
        )}
      </form>
    </Modal>
  );
}
