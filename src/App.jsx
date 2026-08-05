import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Check, GitBranch, Link2, LocateFixed, LogOut, Menu, Redo2, Undo2 } from 'lucide-react';
import { useFamily } from './hooks/useFamily';
import { useAuth } from './hooks/useAuth';
import Login from './components/Login';
import AttachYourself from './components/AttachYourself';
import BrandLogo from './components/BrandLogo';
import FamilyTree from './components/FamilyTree';
import SearchBar from './components/SearchBar';
import PersonDetail from './components/PersonDetail';
import PersonForm from './components/PersonForm';
import BirthdayWidget from './components/BirthdayWidget';
import ImportExport from './components/ImportExport';
import ThemeToggle from './components/ThemeToggle';
import StatsPanel from './components/StatsPanel';
import { getPerson, getFullName, getAncestorChain } from './utils/familyUtils';
import './styles/App.css';

// Maps a formState.mode to the `relation` PersonForm/getEligibleLinkCandidates use.
const RELATION_BY_MODE = { addParent: 'parent', addSpouse: 'spouse', addChild: 'child', addSibling: 'sibling' };

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
    linkExisting,
    removeSpouse,
    removeParent,
    removeChild,
    replaceAll,
    resetToSeed,
    exportData,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useFamily();
  const { user, signOut, gsiReady, clientId, meId, setMe } = useAuth();
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [selectedId, setSelectedId] = useState(null);
  const [focusId, setFocusId] = useState(null);
  const [viewMode, setViewMode] = useState('forest'); // 'forest' (everyone) | 'pedigree' (focus person's ancestors + descendants)
  const [formState, setFormState] = useState(null); // { mode: 'edit'|'addChild'|'addSpouse', personId }
  const [highlightedChain, setHighlightedChain] = useState([]); // ordered ids from a person up to their root, or [] if none
  const [showStatsPanel, setShowStatsPanel] = useState(false);
  const [showAttachWizard, setShowAttachWizard] = useState(false);
  // A locate request { id, nonce }: the nonce bumps on every Locate so FamilyTree
  // re-centres even when locating the same person twice or the current root.
  const [locateRequest, setLocateRequest] = useState({ id: null, nonce: 0 });
  // Person the relationship badge is measured against — set only by explicit "Set as
  // Root"; falls back to "me" so relationships read relative to you by default.
  const [explicitRootId, setExplicitRootId] = useState(null);
  const treeRef = useRef(null);

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

  // A tree-node's first tap just focuses the person (yellow ring) without opening
  // their details — tapping the already-focused node is what opens the panel.
  const handleFocusPerson = useCallback((id) => {
    setFocusId(id);
  }, []);

  // "Jump to their family" (the blue arrow on anyone married in who has their own
  // recorded parents) opens a dedicated Pedigree View centred on THAT person,
  // showing their own father's-side + mother's-side lineages — the tree page, not
  // the details panel (so it deliberately does NOT setSelectedId). TreeNode only
  // shows the arrow when that parent ISN'T already drawn on the current canvas.
  const handleJumpToFamily = useCallback((id) => {
    setViewMode('pedigree');
    setFocusId(id);
  }, []);

  // Persists the selected person as the tree's default root (survives page refresh)
  // and immediately switches to Pedigree View for them — centred in the middle,
  // father's side to the left, mother's side to the right, generic to whoever is
  // set as root (not specific to any one person).
  const handleSetAsRoot = useCallback(() => {
    if (!selectedId) return;
    setRoot(selectedId);
    setExplicitRootId(selectedId);
    setViewMode('pedigree');
  }, [selectedId, setRoot]);

  const closeDetail = useCallback(() => setSelectedId(null), []);
  const closeForm = useCallback(() => setFormState(null), []);

  const highlightedIds = useMemo(() => new Set(highlightedChain), [highlightedChain]);
  const handleHighlightLineage = useCallback((id) => {
    setHighlightedChain(getAncestorChain(persons, id));
  }, [persons]);
  const handleClearHighlight = useCallback(() => setHighlightedChain([]), []);

  // Links a person as "me" and, if they're missing a photo/email, backfills those
  // from the signed-in Google account — never overwrites data that's already there.
  // Also stamps `verifiedEmail` (the linked Google account) so "verified profiles" can
  // be counted in stats — distinct from the freely-editable `email` field, and cleared
  // again if the link is removed.
  const handleSetMe = useCallback((personId) => {
    const previousMeId = meId;
    setMe(personId);
    if (!personId) {
      if (previousMeId && persons[previousMeId]?.verifiedEmail) {
        updatePerson(previousMeId, { verifiedEmail: null });
      }
      return;
    }
    const existing = persons[personId];
    const updates = {};
    if (!existing?.photo && user?.picture) updates.photo = user.picture;
    if (!existing?.email && user?.email) updates.email = user.email;
    if (user?.email && existing?.verifiedEmail !== user.email) updates.verifiedEmail = user.email;
    if (Object.keys(updates).length > 0) updatePerson(personId, updates);
  }, [setMe, persons, user, updatePerson, meId]);

  // Backfills photo/email/verifiedEmail for people already linked as "me" before this
  // sync existed — runs once per sign-in/data-load rather than only at the moment of linking.
  useEffect(() => {
    if (!meId || !user) return;
    const existing = persons[meId];
    if (!existing) return;
    const updates = {};
    if (!existing.photo && user.picture) updates.photo = user.picture;
    if (!existing.email && user.email) updates.email = user.email;
    if (user.email && existing.verifiedEmail !== user.email) updates.verifiedEmail = user.email;
    if (Object.keys(updates).length > 0) updatePerson(meId, updates);
  }, [meId, user, persons, updatePerson]);

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
      if (formState.linkToMe) handleSetMe(newId);
    } else if (formState.mode === 'addSpouse') {
      const newId = addSpouse(formState.personId, data);
      updatePerson(formState.personId, { marriageDate: data.marriageDate });
      handleSelect(newId);
      if (formState.linkToMe) handleSetMe(newId);
    } else if (formState.mode === 'addParent') {
      const newId = addParent(formState.personId, data);
      handleSelect(newId);
      if (formState.linkToMe) handleSetMe(newId);
    } else if (formState.mode === 'fillPlaceholderParent') {
      updatePerson(formState.personId, { ...data, isPlaceholder: false });
      handleSelect(formState.personId);
    } else if (formState.mode === 'addSibling') {
      const newId = addSibling(formState.personId, data);
      handleSelect(newId);
      if (formState.linkToMe) handleSetMe(newId);
    } else if (formState.mode === 'addFirst') {
      const newId = addPerson(data);
      setRoot(newId);
      handleSelect(newId);
    }
    closeForm();
  }, [formState, persons, updatePerson, addChild, addSpouse, addParent, addSibling, addPerson, setRoot, handleSelect, closeForm, handleSetMe]);

  // Opens the add-relative form directly from a tree node's quick-add menu.
  // `parentGender` ('father'|'mother') comes from the dedicated placeholder boxes
  // on a lineage-root person, so the form can prefill gender and label itself
  // accordingly instead of a generic "Add Parent".
  const handleQuickAdd = useCallback((personId, mode, parentGender) => {
    setFormState({ mode, personId, parentGender });
  }, []);

  // "Attach Yourself" wizard: user picked an anchor relative + a relation to them
  // (Child/Parent/Spouse/Sibling) — opens the normal add-relative form, prefilled
  // with the signed-in Google account's name/photo/email, and flags it so
  // handleFormSave auto-links the newly created person as "me" once saved.
  const handleAttachYourself = useCallback((anchorId, mode) => {
    const [firstName, ...rest] = (user?.name || '').trim().split(/\s+/);
    setFormState({
      mode,
      personId: anchorId,
      prefill: { firstName: firstName || '', lastName: rest.join(' '), photo: user?.picture || '', email: user?.email || '' },
      linkToMe: true,
    });
    setShowAttachWizard(false);
  }, [user]);

  // "This is me" shortcut inside the wizard: the anchor the user searched for is
  // already their own existing record, so just link it instead of creating a new person.
  const handleMarkAnchorAsMe = useCallback((anchorId) => {
    handleSetMe(anchorId);
    setShowAttachWizard(false);
  }, [handleSetMe]);

  // "Link Existing" tab: attaches an already-recorded person in the requested role
  // instead of creating a duplicate, then opens their details like a normal add would.
  const handleLinkExisting = useCallback((existingId) => {
    if (!formState) return;
    const relation = RELATION_BY_MODE[formState.mode];
    if (!relation) return;
    linkExisting(formState.personId, relation, existingId);
    handleSelect(existingId);
    closeForm();
  }, [formState, linkExisting, handleSelect, closeForm]);

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

  // Ctrl/Cmd+Z undo, Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z redo — ignored while typing
  // in any text input/textarea so it doesn't fight with native text-field undo.
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  const handleDelete = useCallback((id) => {
    const person = getPerson(persons, id);
    const name = person ? getFullName(person) : 'this person';
    if (!window.confirm(`Delete ${name}? This cannot be undone.`)) return;
    if (!window.confirm(`Are you sure you want to permanently delete ${name}? This also removes their links to parents, spouse, and children.`)) return;
    deletePerson(id);
    setSelectedId((prev) => (prev === id ? null : prev));
    setFocusId((prev) => (prev === id ? null : prev));
  }, [deletePerson, persons]);

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
  const handleViewPersonDetails = useCallback((id) => {
    revealAncestors(id);
    setSelectedId(id);
    setFocusId(id);
  }, [revealAncestors]);

  // Locate (search single-click, and the "Locate Me" pill) centres/highlights a
  // person WITHOUT opening their detail panel — deliberately no setSelectedId.
  // The bumping nonce forces FamilyTree to re-centre even when the target is already
  // the current focus/root (otherwise its rootId-keyed centring effect wouldn't fire).
  const handleLocatePerson = useCallback((id) => {
    revealAncestors(id);
    setFocusId(id);
    setHighlightedChain([id]);
    setLocateRequest((prev) => ({ id, nonce: prev.nonce + 1 }));
  }, [revealAncestors]);

  // Called by FamilyTree when a locate target isn't drawn in the current view (e.g. a
  // trimmed satellite person like Ramesh in the Full Tree). Switch to their Pedigree
  // View, which renders everyone in their lineage, so they become visible + centred.
  const handleLocateNotFound = useCallback((id) => {
    setViewMode('pedigree');
    setFocusId(id);
  }, []);

  // Import replaces the whole dataset, then re-syncs any open selection/focus.
  const handleImport = useCallback((data) => {
    replaceAll(data);
    setSelectedId(null);
    setFocusId(null);
    setCollapsed(new Set());
  }, [replaceAll]);

  // Restores the latest published tree (family.json), discarding local-only edits on
  // this device — the escape hatch for browsers still showing stale cached data.
  const handleRefreshData = useCallback(() => {
    if (!window.confirm('Refresh to the latest published family data? This replaces the tree on this device and discards local changes.')) return;
    resetToSeed();
    setSelectedId(null);
    setFocusId(null);
    setCollapsed(new Set());
    setViewMode('forest');
  }, [resetToSeed]);

  const selected = getPerson(persons, selectedId);
  const isAlreadyRoot = selectedId === rootPersonId;
  const focusedPerson = getPerson(persons, focusId || rootPersonId);

  // Naming convention: a child's surname is the FATHER's (male parent's) first name.
  const childSurnameFor = (parentId) => {
    const parent = getPerson(persons, parentId);
    if (!parent) return '';
    const spouse = getPerson(persons, parent.spouseId);
    const father = parent.gender === 'male' ? parent : (spouse?.gender === 'male' ? spouse : null);
    return father ? father.firstName : (parent.lastName || '');
  };

  // Naming convention: a wife takes her husband's first name as surname; a husband who
  // marries in keeps his own. So default a new spouse of a male person to a wife whose
  // surname is his first name; a new spouse of a female person defaults to a husband.
  const spouseDefaultFor = (personId) => {
    const person = getPerson(persons, personId);
    if (!person) return {};
    if (person.gender === 'male') return { gender: 'female', lastName: person.firstName };
    return { gender: 'male' };
  };

  // The relationship badge is measured against an explicitly-set root if there is one,
  // otherwise "me"; when neither exists there's no anchor and the badge is hidden.
  const relationshipAnchorId = explicitRootId || meId || null;
  const relationshipAnchorContext = relationshipAnchorId
    ? (relationshipAnchorId === meId ? 'you' : getPerson(persons, relationshipAnchorId)?.firstName || 'root')
    : null;

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

  const handleExportImage = useCallback(() => {
    treeRef.current?.exportImage();
  }, []);
  const handleExportPDF = useCallback(() => {
    treeRef.current?.exportPDF();
  }, []);

  if (!user) return <Login gsiReady={gsiReady} clientId={clientId} />;

  return (
    <div className="app">
      <header className="app-header glass-surface">
        <div className="app-logo">
          <span className="app-logo-mark"><BrandLogo size={22} /></span>
          <h1>Family Tree</h1>
        </div>
        {Object.keys(persons).length > 0 && (
          <span className="app-header-count">{Object.keys(persons).length} members</span>
        )}
        <button
          type="button"
          className="icon-btn app-stats-trigger"
          onClick={() => setShowStatsPanel(true)}
          aria-label="Family statistics"
          title="Full Stats"
        >
          <Menu size={17} />
        </button>
        <SearchBar persons={persons} onLocate={handleLocatePerson} />
        <div className="app-header-actions">
          <AnimatePresence>
            {saveState === 'saved' && (
              <motion.span
                className="app-save-indicator"
                initial={{ opacity: 0, x: 6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 6 }}
                transition={{ duration: 0.18 }}
              >
                <Check size={14} /> Saved
              </motion.span>
            )}
          </AnimatePresence>

          <div className="app-header-group">
            <button type="button" className="icon-btn" onClick={undo} disabled={!canUndo} aria-label="Undo" title="Undo (Ctrl+Z)">
              <Undo2 size={17} />
              <span className="btn-label">Undo</span>
            </button>
            <button type="button" className="icon-btn" onClick={redo} disabled={!canRedo} aria-label="Redo" title="Redo (Ctrl+Y)">
              <Redo2 size={17} />
              <span className="btn-label">Redo</span>
            </button>
          </div>

          <div className="app-header-group">
            <button
              type="button"
              className="icon-btn"
              onClick={() => setViewMode((m) => (m === 'forest' ? 'pedigree' : 'forest'))}
              aria-label={viewMode === 'forest' ? 'Switch to Pedigree View' : 'Switch to Full Tree View'}
              title={viewMode === 'forest' ? 'Show ancestry + descendants for the focused person' : 'Show the full family forest'}
            >
              <GitBranch size={17} />
              <span className="btn-label">{viewMode === 'forest' ? 'Pedigree View' : 'Full Tree View'}</span>
            </button>
          </div>

          <ImportExport
            exportData={exportData}
            onImport={handleImport}
            onRefresh={handleRefreshData}
            onExportImage={handleExportImage}
            onExportPDF={handleExportPDF}
          />
          <ThemeToggle />

          <div className="app-header-group app-user">
            {user.picture && (
              <span className="app-user-avatar-wrap" title={user.name || user.email}>
                <img className="app-user-avatar" src={user.picture} alt="" />
              </span>
            )}
            {!meId && (
              <button
                type="button"
                className="icon-btn"
                onClick={() => setShowAttachWizard(true)}
                aria-label="Attach yourself to the family tree"
                title="Link your account to yourself in the family tree"
              >
                <Link2 size={17} />
                <span className="btn-label">Attach Yourself</span>
              </button>
            )}
            <button type="button" className="icon-btn" onClick={signOut} aria-label="Sign out" title={`Sign out (${user.email})`}>
              <LogOut size={17} />
              <span className="btn-label">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {!meId ? (
        <div className="app-attach-pill glass-surface">
          <Link2 size={14} />
          <span>Not linked yet</span>
          <button type="button" onClick={() => setShowAttachWizard(true)}>
            Attach
          </button>
        </div>
      ) : (
        <div className="app-attach-pill glass-surface">
          <LocateFixed size={14} />
          <button type="button" onClick={() => handleLocatePerson(meId)}>
            Locate Me
          </button>
        </div>
      )}

      {viewMode === 'pedigree' && (
        <div className="pedigree-breadcrumb">
          <button
            type="button"
            className="pedigree-breadcrumb-back"
            onClick={() => setViewMode('forest')}
          >
            <ArrowLeft size={14} /> Back to Full Tree
          </button>
          {focusedPerson && (
            <span className="pedigree-breadcrumb-label">
              Viewing: {getFullName(focusedPerson)}'s family
            </span>
          )}
        </div>
      )}

      <BirthdayWidget persons={persons} onSelect={handleViewPersonDetails} />

      <main className="app-main">
        {rootPersonId ? (
          <FamilyTree
            ref={treeRef}
            persons={persons}
            rootId={focusId || rootPersonId}
            priorityId={rootPersonId}
            collapsed={collapsed}
            mode={viewMode}
            highlightedIds={highlightedIds}
            locateId={locateRequest.id}
            locateNonce={locateRequest.nonce}
            meId={meId}
            onFocus={handleFocusPerson}
            onSelect={handleSelect}
            onToggle={toggleCollapse}
            onQuickAdd={handleQuickAdd}
            onJumpTo={handleJumpToFamily}
            onLocateNotFound={handleLocateNotFound}
          />
        ) : Object.keys(persons).length === 0 ? (
          <div className="app-empty-state">
            <p>No family members yet.</p>
            <button type="button" onClick={handleAddFirstPerson}>Add First Person</button>
          </div>
        ) : (
          <p style={{ padding: 24 }}>Loading…</p>
        )}

        <AnimatePresence>
          {selected && !formState && (
            <PersonDetail
              key={selected.id}
              person={selected}
              persons={persons}
              isRoot={isAlreadyRoot}
              anchorId={relationshipAnchorId}
              anchorContext={relationshipAnchorContext}
              isHighlighted={highlightedIds.has(selected.id)}
              meId={meId}
              onSetMe={handleSetMe}
              onClose={closeDetail}
              onNavigate={handleSelect}
              onEdit={() => setFormState({ mode: 'edit', personId: selected.id })}
              onAddChild={() => setFormState({ mode: 'addChild', personId: selected.id })}
              onAddSpouse={() => setFormState({ mode: 'addSpouse', personId: selected.id })}
              onAddParent={() => setFormState({ mode: 'addParent', personId: selected.id })}
              onDelete={() => handleDelete(selected.id)}
              onSetRoot={handleSetAsRoot}
              onViewTree={handleJumpToFamily}
              onUnlinkSpouse={handleUnlinkSpouse}
              onUnlinkParent={handleUnlinkParent}
              onUnlinkChild={handleUnlinkChild}
              onHighlightLineage={handleHighlightLineage}
              onClearHighlight={handleClearHighlight}
            />
          )}
        </AnimatePresence>
      </main>

      <StatsPanel persons={persons} isOpen={showStatsPanel} onClose={() => setShowStatsPanel(false)} onSelect={handleLocatePerson} />

      {showAttachWizard && (
        <AttachYourself
          persons={persons}
          onAttach={handleAttachYourself}
          onMarkAsMe={handleMarkAnchorAsMe}
          onCancel={() => setShowAttachWizard(false)}
        />
      )}

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
          initialPerson={{ lastName: childSurnameFor(formState.personId), ...(formState.prefill || {}) }}
          showMarriageDate={false}
          persons={persons}
          personId={formState.personId}
          relation="child"
          onLinkExisting={handleLinkExisting}
          onSave={handleFormSave}
          onCancel={closeForm}
        />
      )}
      {formState && formState.mode === 'addSpouse' && (
        <PersonForm
          title="Add Spouse"
          initialPerson={{ ...spouseDefaultFor(formState.personId), ...(formState.prefill || {}) }}
          showMarriageDate
          persons={persons}
          personId={formState.personId}
          relation="spouse"
          onLinkExisting={handleLinkExisting}
          onSave={handleFormSave}
          onCancel={closeForm}
        />
      )}
      {formState && formState.mode === 'addParent' && (
        <PersonForm
          title={formState.parentGender === 'father' ? 'Add Father' : formState.parentGender === 'mother' ? 'Add Mother' : 'Add Parent'}
          initialPerson={{
            ...(formState.parentGender ? { gender: formState.parentGender === 'father' ? 'male' : 'female' } : {}),
            ...(formState.prefill || {}),
          }}
          showMarriageDate={false}
          persons={persons}
          personId={formState.personId}
          relation="parent"
          onLinkExisting={handleLinkExisting}
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
          initialPerson={formState.prefill || {}}
          showMarriageDate={false}
          persons={persons}
          personId={formState.personId}
          relation="sibling"
          onLinkExisting={handleLinkExisting}
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
