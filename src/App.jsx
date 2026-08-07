import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Check, GitBranch, Link2, LocateFixed, LogOut, Menu, PlayCircle, Redo2, Route, ShieldCheck, Undo2, X } from 'lucide-react';
import { useFamily } from './hooks/useFamily';
import { useAuth } from './hooks/useAuth';
import Login from './components/Login';
import AttachYourself from './components/AttachYourself';
import FindConnectionModal from './components/FindConnectionModal';
import BrandLogo from './components/BrandLogo';
import FamilyTree from './components/FamilyTree';
import SearchBar from './components/SearchBar';
import PersonDetail from './components/PersonDetail';
import PersonForm from './components/PersonForm';
import BirthdayWidget from './components/BirthdayWidget';
import ImportExport from './components/ImportExport';
import ThemeToggle from './components/ThemeToggle';
import StatsPanel from './components/StatsPanel';
import DataHealthPanel from './components/DataHealthPanel';
import MobileMenu from './components/MobileMenu';
import ConfirmDialog from './components/ConfirmDialog';
import {
  getPerson,
  getFullName,
  getAncestorChain,
  getRelationshipPath,
  getRelationshipLabel,
  getRelationshipLabelTamil,
} from './utils/familyUtils';
import './styles/App.css';

// Maps a formState.mode to the `relation` PersonForm/getEligibleLinkCandidates use.
const RELATION_BY_MODE = { addParent: 'parent', addSpouse: 'spouse', addChild: 'child', addSibling: 'sibling' };

// "Find Connection" travel animation pacing — TRAVEL_STEP_MS is the gap between
// hops (readable, per user feedback), TRAVEL_TRANSITION_MS is how long the camera
// pan itself takes: deliberately shorter than the gap so each glide finishes with a
// brief settle before the next one starts, instead of being cut off mid-motion by
// the next hop firing before it's done.
const TRAVEL_STEP_MS = 3200;
const TRAVEL_TRANSITION_MS = 2800;
// A mid-travel jump (see handleLocateNotFound) swaps the ENTIRE canvas to a new
// pedigree view, a much bigger visual event than a normal hop — gets extra
// breathing room on top of the usual gap so there's a proper beat looking at the
// bridge person again before continuing on.
const JUMP_PAUSE_MS = 4200;

export default function App() {
  const {
    persons,
    rootPersonId,
    loading,
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
    reorderChild,
    replaceAll,
    exportData,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useFamily();
  const { user, authReady, signIn, signOut, meId, setMe } = useAuth();
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [selectedId, setSelectedId] = useState(null);
  const [focusId, setFocusId] = useState(null);
  const [viewMode, setViewMode] = useState('forest'); // 'forest' (everyone) | 'pedigree' (focus person's ancestors + descendants)
  const [formState, setFormState] = useState(null); // { mode: 'edit'|'addChild'|'addSpouse', personId }
  const [highlightedChain, setHighlightedChain] = useState([]); // ordered ids from a person up to their root, or [] if none
  const [locatedId, setLocatedId] = useState(null); // person shown with the green "located" ring (search / Locate Me)
  const [showStatsPanel, setShowStatsPanel] = useState(false);
  const [showDataHealth, setShowDataHealth] = useState(false);
  const [showAttachWizard, setShowAttachWizard] = useState(false);
  // A locate request { id, nonce }: the nonce bumps on every Locate so FamilyTree
  // re-centres even when locating the same person twice or the current root.
  const [locateRequest, setLocateRequest] = useState({ id: null, nonce: 0 });
  // Person the relationship badge is measured against — set only by explicit "Set as
  // Root"; falls back to "me" so relationships read relative to you by default.
  const [explicitRootId, setExplicitRootId] = useState(null);
  const treeRef = useRef(null);
  // "Find Connection" travel animation state — lives in refs, not React state,
  // since it's driven by a chain of setTimeouts rather than renders. `index` is
  // always the NEXT hop still to run (i.e. one past whichever hop most recently
  // fired), so a mid-travel jump failure can look back to find the bridge person
  // (see handleLocateNotFound). travelTimerRef holds whichever single timeout is
  // currently pending — cancelled on replay/Clear/a jump detour so a dismissed or
  // superseded path can't keep hopping the located ring around on its own.
  const travelRef = useRef({ path: [], index: 0 });
  const travelTimerRef = useRef(null);

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
  // Tapping the same already-open person again closes their panel instead of
  // silently no-op'ing (which read as "nothing happens" on a second tap).
  const handleSelect = useCallback((id) => {
    setSelectedId((prev) => (prev === id ? null : id));
    if (viewMode === 'forest') setFocusId(id);
  }, [viewMode]);

  // A tree-node's first tap just focuses the person (yellow ring) without opening
  // their details — tapping the already-focused node is what opens the panel.
  // If someone else's panel is already open, moving focus away closes it too, so
  // the panel never keeps showing a person other than the one now highlighted.
  // In Pedigree View, focus IS the diagram's root (see handleSelect above), so a
  // plain tap on anyone else must open their panel directly instead of re-rooting
  // the whole diagram out from under whatever the user was just looking at. Since
  // isFocus is only ever true for the root card, EVERY other card always routes
  // here (never to handleSelect), so the toggle-close has to live here too.
  const handleFocusPerson = useCallback((id) => {
    if (viewMode === 'pedigree') {
      setSelectedId((prev) => (prev === id ? null : id));
      return;
    }
    setFocusId(id);
    setSelectedId((prev) => (prev !== null && prev !== id ? null : prev));
  }, [viewMode]);

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
  const handleClearHighlight = useCallback(() => {
    clearTimeout(travelTimerRef.current);
    travelRef.current = { path: [], index: 0 };
    setIsTraveling(false);
    setHighlightedChain([]);
    setLocatedId(null);
    setConnectionResult(null);
  }, []);

  // "Find Connection": pick a second person, then highlight the blood/marriage
  // path between them via the SAME highlight mechanism as "Highlight Lineage" —
  // a connection path is just a chain of ids, exactly like an ancestor chain is,
  // so ConnectorLines' existing highlight-drawing logic lights it up for free.
  const [findConnectionFromId, setFindConnectionFromId] = useState(null);
  const [connectionResult, setConnectionResult] = useState(null); // { fromId, toId } | null
  const [isTraveling, setIsTraveling] = useState(false); // true while the travel animation's hops are still playing out
  const handleFindConnection = useCallback((id) => setFindConnectionFromId(id), []);

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

  // A single deliberate confirm step (see ConfirmDialog) shared by both "Mark as
  // Me" and Delete — actions that are hard to walk back and shouldn't fire off a
  // single stray click. Un-linking "me" (personId === null) skips it: that's just
  // undoing a link, not creating a new one, and is trivially reversible by picking
  // the right person again.
  const [confirmDialog, setConfirmDialog] = useState(null);
  const closeConfirmDialog = useCallback(() => setConfirmDialog(null), []);
  const requestSetMe = useCallback((personId) => {
    if (!personId) {
      handleSetMe(null);
      return;
    }
    const person = getPerson(persons, personId);
    setConfirmDialog({
      title: 'Mark as Me?',
      message: `This links your signed-in account to ${getFullName(person)} — it'll fill in your photo/email on their profile (without overwriting anything already there) and mark it as your verified identity in the tree.`,
      confirmLabel: 'Mark as Me',
      onConfirm: () => {
        handleSetMe(personId);
        setConfirmDialog(null);
      },
    });
  }, [persons, handleSetMe]);

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

  const performDelete = useCallback((id) => {
    deletePerson(id);
    setSelectedId((prev) => (prev === id ? null : prev));
    setFocusId((prev) => (prev === id ? null : prev));
  }, [deletePerson]);

  const handleDelete = useCallback((id) => {
    const person = getPerson(persons, id);
    const name = person ? getFullName(person) : 'this person';
    setConfirmDialog({
      title: `Delete ${name}?`,
      message: `This permanently removes ${name} and their links to parents, spouse, and children. This cannot be undone (though it's still covered by Undo, until you close the app).`,
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: () => {
        performDelete(id);
        setConfirmDialog(null);
      },
    });
  }, [persons, performDelete]);

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
    setLocatedId(id);
    setLocateRequest((prev) => ({ id, nonce: prev.nonce + 1 }));
  }, [revealAncestors]);

  // "Find Connection" travel animation — hops the located/centred person down the
  // path node-by-node instead of jumping straight to the end, so the camera visibly
  // walks the chain. Reuses handleLocatePerson (reveal + centre + green ring) as the
  // single "go to this node" primitive; advanceTravel is a self-scheduling chain
  // (each hop only queues the next one after it actually runs) rather than a batch
  // of pre-computed delays, so a mid-travel jump detour (see handleLocateNotFound)
  // can push everything after it back without the schedule racing itself. isTraveling
  // switches FamilyTree to the slow "drive" transition for the trip's duration, then
  // reverts to its normal quick snap once the last hop settles.
  const advanceTravel = useCallback(() => {
    const { path, index } = travelRef.current;
    if (index >= path.length) {
      setIsTraveling(false);
      return;
    }
    handleLocatePerson(path[index]);
    travelRef.current = { path, index: index + 1 };
    travelTimerRef.current = setTimeout(advanceTravel, TRAVEL_STEP_MS);
  }, [handleLocatePerson]);

  const handleTravelPath = useCallback((path) => {
    clearTimeout(travelTimerRef.current);
    // Always start from Full Tree View, never wherever a PREVIOUS trip's mid-way
    // jump detour (see handleLocateNotFound) left viewMode sitting — a jump only
    // ever switches TO Pedigree View, nothing ever switches it back, so replaying
    // (or starting a new search) right after a trip that jumped would otherwise
    // silently begin from that leftover, narrower pedigree canvas instead of the
    // wide comprehensive one the first run actually started from.
    setViewMode('forest');
    travelRef.current = { path, index: 0 };
    setIsTraveling(true);
    advanceTravel();
  }, [advanceTravel]);

  const handleConnectionPicked = useCallback((toId) => {
    const fromId = findConnectionFromId;
    setFindConnectionFromId(null);
    const path = getRelationshipPath(persons, fromId, toId);
    if (!path) {
      window.alert('No direct blood or marriage connection found between these two people.');
      return;
    }
    // Close whichever detail panel is still open (the "from" person's, left over
    // from before Find Connection was opened) so the travel animation is visible
    // full-canvas immediately, instead of partly covered until manually dismissed.
    setSelectedId(null);
    setHighlightedChain(path);
    setConnectionResult({ fromId, toId });
    handleTravelPath(path);
  }, [persons, findConnectionFromId, handleTravelPath]);

  // Called by FamilyTree when a locate target isn't drawn in the current view (e.g. a
  // trimmed satellite person like Ramesh in the Full Tree, or someone married-in
  // whose own parents only show up in THEIR OWN pedigree). Normally this just jumps
  // straight to the target's pedigree view. Mid-travel, that read as skipping past
  // the bridge person (e.g. Sofiya) straight to their parents — so instead we first
  // re-show the bridge person via "jump to family" (a beat on Sofiya herself, in her
  // own lineage view) and only then, after a matching pause, retry locating the
  // original target — which is now visible, since that view includes their parents.
  const handleLocateNotFound = useCallback((id) => {
    const { path, index } = travelRef.current;
    const failedIndex = index - 1;
    const bridgeId = isTraveling && failedIndex > 0 ? path[failedIndex - 1] : null;
    if (bridgeId) {
      clearTimeout(travelTimerRef.current);
      // The hop that just failed already moved locatedId/focusId onto a target
      // that isn't drawn anywhere yet — snap them back to the bridge person first,
      // so the car/green ring don't visibly vanish or lurch ahead of the jump's
      // new view actually opening. JUMP_PAUSE_MS (longer than a normal hop gap)
      // then gives that beat on the bridge person room to actually register.
      setFocusId(bridgeId);
      setLocatedId(bridgeId);
      handleJumpToFamily(bridgeId);
      travelTimerRef.current = setTimeout(() => {
        handleLocatePerson(id);
        travelTimerRef.current = setTimeout(advanceTravel, TRAVEL_STEP_MS);
      }, JUMP_PAUSE_MS);
      return;
    }
    setViewMode('pedigree');
    setFocusId(id);
  }, [isTraveling, handleJumpToFamily, handleLocatePerson, advanceTravel]);

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

  if (!authReady) return <div className="app-loading">Loading…</div>;
  if (!user) return <Login onSignIn={signIn} />;
  if (loading) return <div className="app-loading">Loading family tree…</div>;

  return (
    <div className="app">
      <header className="app-header glass-surface">
        <div className="app-logo">
          <span className="app-logo-mark"><BrandLogo size={22} /></span>
          <h1>Family <span className="app-logo-text-accent">Tree</span></h1>
        </div>
        <ThemeToggle />
        {Object.keys(persons).length > 0 && (
          <span className="app-header-count desktop-header-item">{Object.keys(persons).length} members</span>
        )}
        <button
          type="button"
          className="icon-btn app-stats-trigger desktop-header-item"
          onClick={() => setShowStatsPanel(true)}
          aria-label="Family statistics"
          title="Full Stats"
        >
          <Menu size={17} />
        </button>
        <button
          type="button"
          className="icon-btn desktop-header-item"
          onClick={() => setShowDataHealth(true)}
          aria-label="Data health check"
          title="Scan for broken/inconsistent relationships"
        >
          <ShieldCheck size={17} />
        </button>

        {!meId ? (
          <div className="app-attach-pill glass-surface">
            <Link2 size={14} />
            <span>Not linked yet</span>
            <button type="button" onClick={() => setShowAttachWizard(true)}>
              Add Me
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

        <SearchBar persons={persons} onLocate={handleLocatePerson} />

        <MobileMenu
          viewMode={viewMode}
          onToggleViewMode={() => setViewMode((m) => (m === 'forest' ? 'pedigree' : 'forest'))}
          onOpenStats={() => setShowStatsPanel(true)}
          onOpenDataHealth={() => setShowDataHealth(true)}
          onSignOut={signOut}
          userEmail={user.email}
          userPicture={user.picture}
          exportData={exportData}
          onImport={handleImport}
          onExportImage={handleExportImage}
          onExportPDF={handleExportPDF}
        />

        <div className="app-header-actions desktop-header-item">
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
            onExportImage={handleExportImage}
            onExportPDF={handleExportPDF}
          />

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
                aria-label="Add yourself to the family tree"
                title="Link your account to yourself in the family tree"
              >
                <Link2 size={17} />
                <span className="btn-label">Add Me</span>
              </button>
            )}
            <button type="button" className="icon-btn" onClick={signOut} aria-label="Sign out" title={`Sign out (${user.email})`}>
              <LogOut size={17} />
              <span className="btn-label">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

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
            locatedId={locatedId}
            meId={meId}
            travelTransitionMs={isTraveling ? TRAVEL_TRANSITION_MS : null}
            isTraveling={isTraveling}
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
              onSetMe={requestSetMe}
              onClose={closeDetail}
              onNavigate={handleSelect}
              onEdit={() => setFormState({ mode: 'edit', personId: selected.id })}
              onAddChild={() => setFormState({ mode: 'addChild', personId: selected.id })}
              onAddSpouse={() => setFormState({ mode: 'addSpouse', personId: selected.id })}
              onAddParent={() => setFormState({ mode: 'addParent', personId: selected.id })}
              onAddSibling={() => setFormState({ mode: 'addSibling', personId: selected.id })}
              onDelete={() => handleDelete(selected.id)}
              onSetRoot={handleSetAsRoot}
              onViewTree={handleJumpToFamily}
              onUnlinkSpouse={handleUnlinkSpouse}
              onUnlinkParent={handleUnlinkParent}
              onUnlinkChild={handleUnlinkChild}
              onReorderChild={reorderChild}
              onHighlightLineage={handleHighlightLineage}
              onClearHighlight={handleClearHighlight}
              onFindConnection={handleFindConnection}
            />
          )}
        </AnimatePresence>
      </main>

      {connectionResult && (() => {
        const fromPerson = getPerson(persons, connectionResult.fromId);
        const toPerson = getPerson(persons, connectionResult.toId);
        if (!fromPerson || !toPerson) return null;
        const english = getRelationshipLabel(persons, connectionResult.toId, connectionResult.fromId);
        const tamil = getRelationshipLabelTamil(persons, connectionResult.toId, connectionResult.fromId);
        return (
          <div className="connection-result glass-surface">
            <Route size={14} />
            <span>
              {getFullName(toPerson)} is {getFullName(fromPerson)}'s{' '}
              {tamil ? `${tamil} · ` : ''}
              {english || 'relative (by marriage further removed)'}
            </span>
            <button
              type="button"
              onClick={() => handleTravelPath(highlightedChain)}
              aria-label="Replay travel animation"
              title="Replay"
            >
              <PlayCircle size={14} />
            </button>
            <button type="button" onClick={handleClearHighlight} aria-label="Clear connection">
              <X size={14} />
            </button>
          </div>
        );
      })()}

      {findConnectionFromId && (
        <FindConnectionModal
          persons={persons}
          fromId={findConnectionFromId}
          onPick={handleConnectionPicked}
          onCancel={() => setFindConnectionFromId(null)}
        />
      )}

      {confirmDialog && (
        <ConfirmDialog
          isOpen
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel={confirmDialog.confirmLabel}
          danger={confirmDialog.danger}
          onConfirm={confirmDialog.onConfirm}
          onCancel={closeConfirmDialog}
        />
      )}

      <StatsPanel persons={persons} isOpen={showStatsPanel} onClose={() => setShowStatsPanel(false)} onSelect={handleLocatePerson} />

      <DataHealthPanel
        persons={persons}
        isOpen={showDataHealth}
        onClose={() => setShowDataHealth(false)}
        onSelect={handleLocatePerson}
        updatePerson={updatePerson}
      />

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
