import { useMemo, useState } from 'react';
import { getFullName } from '../utils/familyUtils';
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
  photo: '',
  notes: '',
  marriageDate: '',
};

// `linkExisting`, when provided, adds a "Link Existing" tab alongside the normal
// create-new form — for relations where the other person might already be in the
// tree under a separate branch (e.g. a parent added before the link was known).
// Shape: { relationLabel: 'parent', candidates: Person[], onLink: (id) => void }.
export default function PersonForm({ title, initialPerson, showMarriageDate, onSave, onCancel, linkExisting }) {
  const [form, setForm] = useState(() => ({ ...emptyForm, ...initialPerson }));
  const [error, setError] = useState('');
  const [tab, setTab] = useState('create'); // 'create' | 'link'
  const [linkQuery, setLinkQuery] = useState('');
  const [selectedLinkId, setSelectedLinkId] = useState('');

  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const linkMatches = useMemo(() => {
    if (!linkExisting) return [];
    const term = linkQuery.trim().toLowerCase();
    const pool = linkExisting.candidates;
    return term ? pool.filter((p) => getFullName(p).toLowerCase().includes(term)) : pool;
  }, [linkExisting, linkQuery]);

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

  const handleLinkSubmit = (e) => {
    e.preventDefault();
    if (!selectedLinkId) {
      setError(`Choose an existing person to link as ${linkExisting.relationLabel}.`);
      return;
    }
    linkExisting.onLink(selectedLinkId);
  };

  return (
    <div className="person-form-overlay" onClick={onCancel}>
      <div className="person-form" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {error && <p className="person-form-error">{error}</p>}

        {linkExisting && (
          <div className="person-form-tabs">
            <button
              type="button"
              className={tab === 'create' ? 'active' : ''}
              onClick={() => { setTab('create'); setError(''); }}
            >
              Create New
            </button>
            <button
              type="button"
              className={tab === 'link' ? 'active' : ''}
              onClick={() => { setTab('link'); setError(''); }}
            >
              Link Existing
            </button>
          </div>
        )}

        {tab === 'link' && linkExisting ? (
          <form onSubmit={handleLinkSubmit}>
            <label>
              Search existing people
              <input
                type="text"
                autoFocus
                placeholder="Type a name…"
                value={linkQuery}
                onChange={(e) => setLinkQuery(e.target.value)}
              />
            </label>
            <ul className="person-form-link-results">
              {linkMatches.length > 0 ? (
                linkMatches.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className={selectedLinkId === p.id ? 'active' : ''}
                      onClick={() => setSelectedLinkId(p.id)}
                    >
                      {getFullName(p)}
                    </button>
                  </li>
                ))
              ) : (
                <li className="person-form-link-empty">No eligible matches</li>
              )}
            </ul>
            <div className="person-form-actions">
              <button type="button" onClick={onCancel}>Cancel</button>
              <button type="submit" className="person-form-save" disabled={!selectedLinkId}>
                Link as {linkExisting.relationLabel}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSubmit}>
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
              <label className="person-form-checkbox">
                <input
                  type="checkbox"
                  checked={!form.isAlive}
                  onChange={(e) => setField('isAlive', !e.target.checked)}
                />
                Deceased
              </label>
            </div>

            {!form.isAlive && (
              <label>
                Date of death (optional)
                <input type="date" value={form.dod} onChange={(e) => setField('dod', e.target.value)} />
              </label>
            )}

            <div className="person-form-row">
              <label>
                Work (optional)
                <input value={form.work} onChange={(e) => setField('work', e.target.value)} />
              </label>
              <label>
                Location (optional)
                <input value={form.location} onChange={(e) => setField('location', e.target.value)} />
              </label>
              <label>
                Phone (optional)
                <input value={form.phone} onChange={(e) => setField('phone', e.target.value)} />
              </label>
            </div>

            <label>
              Photo (optional)
              <input type="file" accept="image/*" onChange={handlePhotoChange} />
            </label>
            {form.photo && (
              <div className="person-form-photo-preview">
                <img src={form.photo} alt="Preview" />
                <button type="button" onClick={() => setField('photo', '')}>Remove photo</button>
              </div>
            )}

            <label>
              Notes / Bio (optional)
              <textarea rows={3} value={form.notes} onChange={(e) => setField('notes', e.target.value)} />
            </label>

            <div className="person-form-actions">
              <button type="button" onClick={onCancel}>Cancel</button>
              <button type="submit" className="person-form-save">Save</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
