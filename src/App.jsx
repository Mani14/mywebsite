import { useCallback, useEffect, useState } from 'react';
import { useFamily } from './hooks/useFamily';
import FamilyTree from './components/FamilyTree';
import SearchBar from './components/SearchBar';
import PersonDetail from './components/PersonDetail';
import PersonForm from './components/PersonForm';
import BirthdayWidget from './components/BirthdayWidget';
import ImportExport from './components/ImportExport';
import ThemeToggle from './components/ThemeToggle';
import { getPerson, getFullName } from './utils/familyUtils';
import './styles/App.css';

export default function App() {
  const {
    persons,
    rootPersonId,
    setRoot,
    saveState,
    addPerson,
    updatePerson,
    deletePerson,
    addChild,
    addSpouse,
    addParent,
    addSibling,
    removeSpouse,
    removeParent,
    removeChild,
    replaceAll,
    exportData,
  } = useFamily();
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [selectedId, setSelectedId] = useState(null);
  const [focusId, setFocusId] = useState(null);
  const [viewMode, setViewMode] = useState('forest'); // 'forest' (everyone) | 'pedigree' (focus person's ancestors + descendants)
  const [formState, setFormState] = useState(null); // { mode: 'edit'|'addChild'|'addSpouse', personId }

  const toggleCollapse = useCallback((id) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Selecting a person opens their detail panel, and in Forest View also shifts the
  // highlighted focus + re-centres the view on them — harmless there, since the
  // forest's layout doesn't depend on who's focused. In Pedigree View the focus IS
  // the diagram's root, so changing it on every click would re-root (and reshuffle)
  // the whole tree just from opening someone's details; only explicit navigation
  // (search, jump-to-family, Set as Root) should do that there.
  const handleSelect = useCallback((id) => {
    setSelectedId(id);
    if (viewMode === 'forest') setFocusId(id);
  }, [viewMode]);

  // "Jump to their family" (the 🔗 badge on anyone married in who has their own
  // recorded parents) opens a dedicated Pedigree View centred on THAT person,
  // showing their own father's-side + mother's-side lineages. TreeNode only shows
  // the badge when that parent ISN'T already drawn on the current canvas (see
  // FamilyTree.jsx's renderedIds) — e.g. it's suppressed once the parent (or
  // placeholder parent) is already visible one row up in the same view.
  const handleJumpToFamily = useCallback((id) => {
    setViewMode('pedigree');
    setSelectedId(id);
    setFocusId(id);
  }, []);

  // Persists the selected person as the tree's default root (survives page refresh)
  // and immediately switches to Pedigree View for them — centred in the middle,
  // father's side to the left, mother's side to the right, generic to whoever is
  // set as root (not specific to any one person).
  const handleSetAsRoot = useCallback(() => {
    if (!selectedId) return;
    setRoot(selectedId);
    setViewMode('pedigree');
  }, [selectedId, setRoot]);

  const closeDetail = useCallback(() => setSelectedId(null), []);
  const closeForm = useCallback(() => setFormState(null), []);

  const handleFormSave = useCallback((data) => {
    if (!formState) return;
    if (formState.mode === 'edit') {
      const person = getPerson(persons, formState.personId);
      updatePerson(formState.personId, data);
      if (person?.spouseId && data.marriageDate !== person.marriageDate) {
        updatePerson(person.spouseId, { marriageDate: data.marriageDate });
      }
    } else if (formState.mode === 'addChild') {
      const newId = addChild(formState.personId, data);
      handleSelect(newId);
    } else if (formState.mode === 'addSpouse') {
      const newId = addSpouse(formState.personId, data);
      updatePerson(formState.personId, { marriageDate: data.marriageDate });
      handleSelect(newId);
    } else if (formState.mode === 'addParent') {
      const newId = addParent(formState.personId, data);
      handleSelect(newId);
    } else if (formState.mode === 'fillPlaceholderParent') {
      updatePerson(formState.personId, { ...data, isPlaceholder: false });
      handleSelect(formState.personId);
    } else if (formState.mode === 'addSibling') {
      const newId = addSibling(formState.personId, data);
      handleSelect(newId);
    } else if (formState.mode === 'addFirst') {
      const newId = addPerson(data);
      setRoot(newId);
      handleSelect(newId);
    }
    closeForm();
  }, [formState, persons, updatePerson, addChild, addSpouse, addParent, addSibling, addPerson, setRoot, handleSelect, closeForm]);

  // Opens the add-relative form directly from a tree node's quick-add menu.
  // `parentGender` ('father'|'mother') comes from the dedicated placeholder boxes
  // on a lineage-root person, so the form can prefill gender and label itself
  // accordingly instead of a generic "Add Parent".
  const handleQuickAdd = useCallback((personId, mode, parentGender) => {
    setFormState({ mode, personId, parentGender });
  }, []);

  const handleAddFirstPerson = useCallback(() => {
    setFormState({ mode: 'addFirst', personId: null });
  }, []);

  // Escape closes whichever layer is on top (modal takes priority over the detail panel);
  // ignored while typing in the search box, which handles its own Escape to clear.
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key !== 'Escape') return;
      if (document.activeElement?.classList.contains('search-bar-input')) return;
      if (formState) closeForm();
      else if (selectedId) closeDetail();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [formState, selectedId, closeForm, closeDetail]);

  const handleDelete = useCallback((id) => {
    if (!window.confirm('Delete this person? This cannot be undone.')) return;
    deletePerson(id);
    setSelectedId((prev) => (prev === id ? null : prev));
    setFocusId((prev) => (prev === id ? null : prev));
  }, [deletePerson]);

  // Uncollapses every ancestor of a person so a search jump always lands on a visible node.
  const revealAncestors = useCallback((id) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      let current = getPerson(persons, id);
      while (current?.parentIds?.[0]) {
        next.delete(current.parentIds[0]);
        current = getPerson(persons, current.parentIds[0]);
      }
      return next;
    });
  }, [persons]);

  // Search is explicit navigation intent regardless of view mode, unlike a plain
  // canvas click (handleSelect), so it always moves the focus/pedigree root.
  const handleSearchSelect = useCallback((id) => {
    revealAncestors(id);
    setSelectedId(id);
    setFocusId(id);
  }, [revealAncestors]);

  // Import replaces the whole dataset, then re-syncs any open selection/focus.
  const handleImport = useCallback((data) => {
    replaceAll(data);
    setSelectedId(null);
    setFocusId(null);
    setCollapsed(new Set());
  }, [replaceAll]);

  const selected = getPerson(persons, selectedId);
  const isAlreadyRoot = selectedId === rootPersonId;
  const focusedPerson = getPerson(persons, focusId || rootPersonId);

  // Unlink actions remove one relationship without deleting either person. `selected`
  // is always the person currently open in the detail panel; the argument is whoever
  // they're linked to (only relevant for parent/child, since spouse is unambiguous).
  const handleUnlinkSpouse = useCallback(() => {
    if (!selected?.spouseId) return;
    const spouse = getPerson(persons, selected.spouseId);
    if (!window.confirm(`Remove the spouse link between ${getFullName(selected)} and ${getFullName(spouse)}?`)) return;
    removeSpouse(selected.id);
  }, [selected, persons, removeSpouse]);

  const handleUnlinkParent = useCallback((parentId) => {
    if (!selected) return;
    const parent = getPerson(persons, parentId);
    if (!window.confirm(`Remove ${getFullName(parent)} as ${getFullName(selected)}'s parent?`)) return;
    removeParent(selected.id, parentId);
  }, [selected, persons, removeParent]);

  const handleUnlinkChild = useCallback((childId) => {
    if (!selected) return;
    const child = getPerson(persons, childId);
    if (!window.confirm(`Remove ${getFullName(child)} as ${getFullName(selected)}'s child?`)) return;
    removeChild(selected.id, childId);
  }, [selected, persons, removeChild]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Family Tree</h1>
        <SearchBar persons={persons} onSelect={handleSearchSelect} />
        <div className="app-header-actions">
          {saveState === 'saved' && <span className="app-save-indicator">Saved ✓</span>}
          <button
            type="button"
            className="view-mode-toggle"
            onClick={() => setViewMode((m) => (m === 'forest' ? 'pedigree' : 'forest'))}
            title={viewMode === 'forest' ? 'Show ancestry + descendants for the focused person' : 'Show the full family forest'}
          >
            {viewMode === 'forest' ? 'Pedigree View' : 'Full Tree View'}
          </button>
          <ImportExport exportData={exportData} onImport={handleImport} />
          <ThemeToggle />
        </div>
      </header>

      {viewMode === 'pedigree' && (
        <div className="pedigree-breadcrumb">
          <button
            type="button"
            className="pedigree-breadcrumb-back"
            onClick={() => setViewMode('forest')}
          >
            ← Back to Full Tree
          </button>
          {focusedPerson && (
            <span className="pedigree-breadcrumb-label">
              Viewing: {getFullName(focusedPerson)}'s family
            </span>
          )}
        </div>
      )}

      <BirthdayWidget persons={persons} onSelect={handleSearchSelect} />

      <main className="app-main">
        {rootPersonId ? (
          <FamilyTree
            persons={persons}
            rootId={focusId || rootPersonId}
            priorityId={rootPersonId}
            collapsed={collapsed}
            mode={viewMode}
            onSelect={handleSelect}
            onToggle={toggleCollapse}
            onQuickAdd={handleQuickAdd}
            onJumpTo={handleJumpToFamily}
          />
        ) : Object.keys(persons).length === 0 ? (
          <div className="app-empty-state">
            <p>No family members yet.</p>
            <button type="button" onClick={handleAddFirstPerson}>Add First Person</button>
          </div>
        ) : (
          <p style={{ padding: 24 }}>Loading…</p>
        )}

        {selected && !formState && (
          <PersonDetail
            person={selected}
            persons={persons}
            isRoot={isAlreadyRoot}
            onClose={closeDetail}
            onNavigate={handleSelect}
            onEdit={() => setFormState({ mode: 'edit', personId: selected.id })}
            onAddChild={() => setFormState({ mode: 'addChild', personId: selected.id })}
            onAddSpouse={() => setFormState({ mode: 'addSpouse', personId: selected.id })}
            onAddParent={() => setFormState({ mode: 'addParent', personId: selected.id })}
            onDelete={() => handleDelete(selected.id)}
            onSetRoot={handleSetAsRoot}
            onUnlinkSpouse={handleUnlinkSpouse}
            onUnlinkParent={handleUnlinkParent}
            onUnlinkChild={handleUnlinkChild}
          />
        )}
      </main>

      {formState && formState.mode === 'edit' && (
        <PersonForm
          title="Edit Person"
          initialPerson={getPerson(persons, formState.personId)}
          showMarriageDate={!!getPerson(persons, formState.personId)?.spouseId}
          onSave={handleFormSave}
          onCancel={closeForm}
        />
      )}
      {formState && formState.mode === 'addChild' && (
        <PersonForm
          title="Add Child"
          initialPerson={{}}
          showMarriageDate={false}
          onSave={handleFormSave}
          onCancel={closeForm}
        />
      )}
      {formState && formState.mode === 'addSpouse' && (
        <PersonForm
          title="Add Spouse"
          initialPerson={{}}
          showMarriageDate
          onSave={handleFormSave}
          onCancel={closeForm}
        />
      )}
      {formState && formState.mode === 'addParent' && (
        <PersonForm
          title={formState.parentGender === 'father' ? 'Add Father' : formState.parentGender === 'mother' ? 'Add Mother' : 'Add Parent'}
          initialPerson={formState.parentGender ? { gender: formState.parentGender === 'father' ? 'male' : 'female' } : {}}
          showMarriageDate={false}
          onSave={handleFormSave}
          onCancel={closeForm}
        />
      )}
      {formState && formState.mode === 'fillPlaceholderParent' && (
        <PersonForm
          title={formState.parentGender === 'father' ? 'Add Father' : formState.parentGender === 'mother' ? 'Add Mother' : 'Add Parent'}
          initialPerson={formState.parentGender ? { gender: formState.parentGender === 'father' ? 'male' : 'female' } : {}}
          showMarriageDate={false}
          onSave={handleFormSave}
          onCancel={closeForm}
        />
      )}
      {formState && formState.mode === 'addSibling' && (
        <PersonForm
          title="Add Sibling"
          initialPerson={{}}
          showMarriageDate={false}
          onSave={handleFormSave}
          onCancel={closeForm}
        />
      )}
      {formState && formState.mode === 'addFirst' && (
        <PersonForm
          title="Add Person"
          initialPerson={{}}
          showMarriageDate={false}
          onSave={handleFormSave}
          onCancel={closeForm}
        />
      )}
    </div>
  );
}
