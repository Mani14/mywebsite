import { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import seedData from '../data/family.json';
import { createEmptyPerson, generateId } from '../utils/familyUtils';

// The whole tree lives in ONE shared Firestore document, so every signed-in device
// reads/writes the same data in real time. localStorage is no longer the store — the
// Firestore SDK's own offline cache keeps things working without a connection.
const FAMILY_DOC = ['families', 'main'];

// Deep clone so callers never mutate React state directly.
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function useFamily() {
  const [persons, setPersons] = useState({});
  const [rootPersonId, setRootPersonId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState('idle'); // 'idle' | 'saved'
  const [authed, setAuthed] = useState(() => !!auth.currentUser);
  const lastSyncedJson = useRef(null);
  const saveTimer = useRef(null);

  // Kept in sync so history snapshots always capture the true current state,
  // regardless of which mutator's stale useCallback closure calls pushHistory.
  const personsRef = useRef(persons);
  useEffect(() => {
    personsRef.current = persons;
  }, [persons]);

  // Undo/redo covers data edits only (add/update/delete/link/import) — NOT
  // setRoot or view-mode changes, which live outside useFamily entirely.
  const historyRef = useRef({ past: [], future: [] });
  const HISTORY_LIMIT = 50;
  const pushHistory = useCallback(() => {
    const { past } = historyRef.current;
    past.push(clone(personsRef.current));
    if (past.length > HISTORY_LIMIT) past.shift();
    historyRef.current.future = [];
  }, []);

  // Load once: prefer stored data, fall back to bundled seed.
  useEffect(() => onAuthStateChanged(auth, (u) => setAuthed(!!u)), []);

  // Live subscription to the shared family document (starts once signed in).
  useEffect(() => {
    if (!authed) return undefined;
    const ref = doc(db, ...FAMILY_DOC);
    return onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          // First-ever load: seed the shared doc from the bundled data.
          setDoc(ref, clone(seedData)).catch(() => {});
          return;
        }
        if (snap.metadata.hasPendingWrites) return; // ignore our own optimistic echo
        const data = snap.data();
        lastSyncedJson.current = JSON.stringify({ rootPersonId: data.rootPersonId ?? null, persons: data.persons || {} });
        setPersons(data.persons || {});
        setRootPersonId(data.rootPersonId || Object.keys(data.persons || {})[0] || null);
        setLoading(false);
      },
      () => setLoading(false)
    );
  }, [authed]);

  // Debounced write of local edits back to the shared doc (skips no-op / remote echoes).
  useEffect(() => {
    if (loading || !authed || !rootPersonId) return undefined;
    const json = JSON.stringify({ rootPersonId, persons });
    if (json === lastSyncedJson.current) return undefined;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      lastSyncedJson.current = json;
      setDoc(doc(db, ...FAMILY_DOC), { rootPersonId, persons })
        .then(() => {
          setSaveState('saved');
          setTimeout(() => setSaveState('idle'), 1500);
        })
        .catch(() => {});
    }, 700);
    return () => clearTimeout(saveTimer.current);
  }, [persons, rootPersonId, loading, authed]);

  const addPerson = useCallback((partial) => {
    let newId;
    pushHistory();
    setPersons((prev) => {
      newId = generateId(prev);
      const person = { ...createEmptyPerson(newId), ...partial, id: newId };
      return { ...prev, [newId]: person };
    });
    return newId;
  }, [pushHistory]);

  const updatePerson = useCallback((id, updates) => {
    pushHistory();
    setPersons((prev) => {
      if (!prev[id]) return prev;
      return { ...prev, [id]: { ...prev[id], ...updates } };
    });
  }, [pushHistory]);

  // Removes a person and scrubs every reference to them.
  const deletePerson = useCallback((id) => {
    pushHistory();
    setPersons((prev) => {
      if (!prev[id]) return prev;
      const next = {};
      for (const [pid, person] of Object.entries(prev)) {
        if (pid === id) continue;
        next[pid] = {
          ...person,
          spouseId: person.spouseId === id ? '' : person.spouseId,
          marriageDate: person.spouseId === id ? '' : person.marriageDate,
          parentIds: person.parentIds.filter((p) => p !== id),
          childrenIds: person.childrenIds.filter((c) => c !== id),
        };
      }
      return next;
    });
    setRootPersonId((prevRoot) => {
      if (prevRoot !== id) return prevRoot;
      const remaining = Object.keys(persons).filter((p) => p !== id);
      return remaining[0] || null;
    });
  }, [persons]);

  // Creates a child linked to the parent and the parent's spouse (if any).
  const addChild = useCallback((parentId, partial = {}) => {
    let newId;
    pushHistory();
    setPersons((prev) => {
      const parent = prev[parentId];
      if (!parent) return prev;
      newId = generateId(prev);
      const parentPair = [parentId];
      if (parent.spouseId && prev[parent.spouseId]) parentPair.push(parent.spouseId);

      // Convention: a child's surname is the father's (male parent's) first name.
      const father = parentPair.map((pid) => prev[pid]).find((p) => p && p.gender === 'male');
      const child = {
        ...createEmptyPerson(newId),
        lastName: father ? father.firstName : parent.lastName,
        ...partial,
        id: newId,
        parentIds: parentPair,
      };
      const next = { ...prev, [newId]: child };
      for (const pid of parentPair) {
        next[pid] = { ...next[pid], childrenIds: [...next[pid].childrenIds, newId] };
      }
      return next;
    });
    return newId;
  }, [pushHistory]);

  // Creates a spouse and links both people to each other.
  const addSpouse = useCallback((personId, partial = {}) => {
    let newId;
    pushHistory();
    setPersons((prev) => {
      const person = prev[personId];
      if (!person || person.spouseId) return prev;
      newId = generateId(prev);
      const spouse = {
        ...createEmptyPerson(newId),
        lastName: person.lastName,
        ...partial,
        id: newId,
        spouseId: personId,
      };
      return {
        ...prev,
        [newId]: spouse,
        [personId]: { ...person, spouseId: newId },
      };
    });
    return newId;
  }, [pushHistory]);

  // Creates a parent linked to the person; pairs them with an existing spouseless parent.
  const addParent = useCallback((personId, partial = {}) => {
    let newId;
    pushHistory();
    setPersons((prev) => {
      const person = prev[personId];
      if (!person || person.parentIds.length >= 2) return prev;
      newId = generateId(prev);
      const parent = {
        ...createEmptyPerson(newId),
        lastName: person.lastName,
        ...partial,
        id: newId,
        childrenIds: [personId],
      };
      const next = {
        ...prev,
        [newId]: parent,
        [personId]: { ...person, parentIds: [...person.parentIds, newId] },
      };
      const existingParentId = person.parentIds[0];
      if (existingParentId && next[existingParentId] && !next[existingParentId].spouseId) {
        next[existingParentId] = { ...next[existingParentId], spouseId: newId };
        next[newId] = { ...next[newId], spouseId: existingParentId };
      }
      return next;
    });
    return newId;
  }, [pushHistory]);

  // Creates a sibling sharing the same parent(s). If personId has no recorded
  // parents yet (e.g. a lineage root), auto-creates a shared "Unknown Parent"
  // placeholder first (see TreeNode's isPlaceholder branch) so the sibling has
  // somewhere to attach without inventing a fake, fully-specified parent.
  const addSibling = useCallback((personId, partial = {}) => {
    let newId;
    pushHistory();
    setPersons((prev) => {
      const person = prev[personId];
      if (!person) return prev;
      let next = prev;
      let parentIds = person.parentIds;

      if (parentIds.length === 0) {
        const placeholderId = generateId(next);
        const placeholder = {
          ...createEmptyPerson(placeholderId),
          firstName: 'Unknown',
          lastName: person.lastName,
          isPlaceholder: true,
          childrenIds: [personId],
        };
        next = {
          ...next,
          [placeholderId]: placeholder,
          [personId]: { ...person, parentIds: [placeholderId] },
        };
        parentIds = [placeholderId];
      }

      newId = generateId(next);
      const sibling = {
        ...createEmptyPerson(newId),
        lastName: person.lastName,
        ...partial,
        id: newId,
        parentIds: [...parentIds],
      };
      next = { ...next, [newId]: sibling };
      // Prepended, not appended — left is the father/blood-lineage side of the
      // tree, and a new sibling should land there rather than off to the right.
      for (const pid of parentIds) {
        if (next[pid]) next[pid] = { ...next[pid], childrenIds: [newId, ...next[pid].childrenIds] };
      }
      return next;
    });
    return newId;
  }, [pushHistory]);

  // Wires up a relationship between two ALREADY-EXISTING people (no new person
  // created), mirroring addParent/addSpouse/addChild/addSibling's edge-setting —
  // used by PersonForm's "Link Existing" tab. Eligibility (no cycles, no
  // duplicate roles) is enforced upstream by familyUtils' getEligibleLinkCandidates.
  const linkExisting = useCallback((personId, relation, existingId) => {
    pushHistory();
    setPersons((prev) => {
      const person = prev[personId];
      const other = prev[existingId];
      if (!person || !other) return prev;
      let next = prev;

      if (relation === 'spouse') {
        next = {
          ...next,
          [personId]: { ...person, spouseId: existingId },
          [existingId]: { ...other, spouseId: personId },
        };
      } else if (relation === 'parent') {
        next = {
          ...next,
          [personId]: { ...person, parentIds: [...person.parentIds, existingId] },
          [existingId]: { ...other, childrenIds: [...other.childrenIds, personId] },
        };
        const existingParentId = person.parentIds[0];
        if (existingParentId && next[existingParentId] && !next[existingParentId].spouseId && !next[existingId].spouseId) {
          next[existingParentId] = { ...next[existingParentId], spouseId: existingId };
          next[existingId] = { ...next[existingId], spouseId: existingParentId };
        }
      } else if (relation === 'child') {
        const parentPair = [personId];
        if (person.spouseId && next[person.spouseId]) parentPair.push(person.spouseId);
        next = {
          ...next,
          [existingId]: { ...other, parentIds: [...new Set([...other.parentIds, ...parentPair])] },
        };
        for (const pid of parentPair) {
          next[pid] = { ...next[pid], childrenIds: [...next[pid].childrenIds, existingId] };
        }
      } else if (relation === 'sibling') {
        let parentIds = person.parentIds;
        if (parentIds.length === 0) {
          const placeholderId = generateId(next);
          const placeholder = {
            ...createEmptyPerson(placeholderId),
            firstName: 'Unknown',
            lastName: person.lastName,
            isPlaceholder: true,
            childrenIds: [personId],
          };
          next = { ...next, [placeholderId]: placeholder, [personId]: { ...person, parentIds: [placeholderId] } };
          parentIds = [placeholderId];
        }
        next = { ...next, [existingId]: { ...next[existingId], parentIds: [...parentIds] } };
        for (const pid of parentIds) {
          next[pid] = { ...next[pid], childrenIds: [existingId, ...next[pid].childrenIds] };
        }
      }

      return next;
    });
  }, [pushHistory]);

  // Clears a mutual spouse link (both sides), including any recorded marriage date.
  // Neither person is deleted — just the relationship between them.
  const removeSpouse = useCallback((personId) => {
    pushHistory();
    setPersons((prev) => {
      const person = prev[personId];
      if (!person?.spouseId) return prev;
      const spouseId = person.spouseId;
      const next = { ...prev, [personId]: { ...person, spouseId: '', marriageDate: '' } };
      if (next[spouseId]) {
        next[spouseId] = { ...next[spouseId], spouseId: '', marriageDate: '' };
      }
      return next;
    });
  }, [pushHistory]);

  // Removes one specific parent-child edge (both directions) without touching any
  // other relationship — e.g. fixing a single wrongly-recorded parent while leaving
  // the other parent and all other relatives untouched.
  const removeParent = useCallback((personId, parentId) => {
    pushHistory();
    setPersons((prev) => {
      const person = prev[personId];
      if (!person || !person.parentIds.includes(parentId)) return prev;
      const next = {
        ...prev,
        [personId]: { ...person, parentIds: person.parentIds.filter((id) => id !== parentId) },
      };
      if (next[parentId]) {
        next[parentId] = {
          ...next[parentId],
          childrenIds: next[parentId].childrenIds.filter((id) => id !== personId),
        };
      }
      return next;
    });
  }, [pushHistory]);

  const removeChild = useCallback((personId, childId) => {
    pushHistory();
    setPersons((prev) => {
      const person = prev[personId];
      if (!person || !person.childrenIds.includes(childId)) return prev;
      const next = {
        ...prev,
        [personId]: { ...person, childrenIds: person.childrenIds.filter((id) => id !== childId) },
      };
      if (next[childId]) {
        next[childId] = {
          ...next[childId],
          parentIds: next[childId].parentIds.filter((id) => id !== personId),
        };
      }
      return next;
    });
  }, [pushHistory]);

  // Moves a child one slot earlier/later among its siblings — kept in sync across
  // EVERY one of the child's recorded parents (not just whichever parent's detail
  // panel triggered this), since both should agree on birth order. This is the
  // only place birth order is captured when exact DOB isn't known: childrenIds
  // array order doubles as both left-to-right tree position and, for the Tamil
  // elder/younger terms, birth order (eldest first).
  const reorderChild = useCallback((childId, direction) => {
    pushHistory();
    setPersons((prev) => {
      const child = prev[childId];
      if (!child) return prev;
      const next = { ...prev };
      let moved = false;
      child.parentIds.forEach((parentId) => {
        const parent = next[parentId];
        if (!parent) return;
        const ids = [...parent.childrenIds];
        const idx = ids.indexOf(childId);
        const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (idx === -1 || swapIdx < 0 || swapIdx >= ids.length) return;
        [ids[idx], ids[swapIdx]] = [ids[swapIdx], ids[idx]];
        next[parentId] = { ...parent, childrenIds: ids };
        moved = true;
      });
      return moved ? next : prev;
    });
  }, [pushHistory]);

  const setRoot = useCallback((id) => {
    setRootPersonId((prev) => (persons[id] ? id : prev));
  }, [persons]);

  // Replaces the entire dataset (used by import). Assumes data is pre-validated.
  const replaceAll = useCallback((data) => {
    pushHistory();
    setPersons(clone(data.persons));
    setRootPersonId(data.rootPersonId || Object.keys(data.persons)[0] || null);
  }, [pushHistory]);

  // Restores the published seed (family.json), discarding local-only edits. Undoable.
  const resetToSeed = useCallback(() => {
    replaceAll(seedData);
  }, [replaceAll]);

  const exportData = useCallback(() => clone({ rootPersonId, persons }), [rootPersonId, persons]);

  // past/future are read directly off the ref (not state) — every push/pop
  // happens alongside a setPersons call, so the re-render it triggers always
  // sees up-to-date lengths here without a separate piece of state to sync.
  const undo = useCallback(() => {
    const { past, future } = historyRef.current;
    if (past.length === 0) return;
    const previous = past.pop();
    future.push(clone(personsRef.current));
    setPersons(previous);
  }, []);

  const redo = useCallback(() => {
    const { past, future } = historyRef.current;
    if (future.length === 0) return;
    const next = future.pop();
    past.push(clone(personsRef.current));
    setPersons(next);
  }, []);

  return {
    persons,
    rootPersonId,
    loading,
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
    setRoot,
    replaceAll,
    resetToSeed,
    exportData,
    undo,
    redo,
    canUndo: historyRef.current.past.length > 0,
    canRedo: historyRef.current.future.length > 0,
  };
}
