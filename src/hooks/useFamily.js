import { useCallback, useEffect, useRef, useState } from 'react';
import seedData from '../data/family.json';
import { createEmptyPerson, generateId, validateFamilyData } from '../utils/familyUtils';

const STORAGE_KEY = 'family-hierarchy-data';

// --- Persistence layer (the ONLY place that touches storage) ---
// In V2 these two functions are swapped for cloud API calls; nothing else changes.
function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const { valid } = validateFamilyData(parsed);
    return valid ? parsed : null;
  } catch {
    return null;
  }
}

function saveToStorage(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// Deep clone so callers never mutate React state directly.
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function useFamily() {
  const [persons, setPersons] = useState({});
  const [rootPersonId, setRootPersonId] = useState(null);
  const [saveState, setSaveState] = useState('idle'); // 'idle' | 'saved'
  const isFirstLoad = useRef(true);
  const saveTimer = useRef(null);

  // Load once: prefer stored data, fall back to bundled seed.
  useEffect(() => {
    const stored = loadFromStorage();
    const source = stored || seedData;
    setPersons(clone(source.persons));
    setRootPersonId(source.rootPersonId || Object.keys(source.persons)[0] || null);
  }, []);

  // Persist on every change (skip the initial mount).
  useEffect(() => {
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      return;
    }
    if (!rootPersonId) return;
    saveToStorage({ rootPersonId, persons });
    setSaveState('saved');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => setSaveState('idle'), 1500);
    return () => clearTimeout(saveTimer.current);
  }, [persons, rootPersonId]);

  const addPerson = useCallback((partial) => {
    let newId;
    setPersons((prev) => {
      newId = generateId(prev);
      const person = { ...createEmptyPerson(newId), ...partial, id: newId };
      return { ...prev, [newId]: person };
    });
    return newId;
  }, []);

  const updatePerson = useCallback((id, updates) => {
    setPersons((prev) => {
      if (!prev[id]) return prev;
      return { ...prev, [id]: { ...prev[id], ...updates } };
    });
  }, []);

  // Removes a person and scrubs every reference to them.
  const deletePerson = useCallback((id) => {
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
    setPersons((prev) => {
      const parent = prev[parentId];
      if (!parent) return prev;
      newId = generateId(prev);
      const parentPair = [parentId];
      if (parent.spouseId && prev[parent.spouseId]) parentPair.push(parent.spouseId);

      const child = {
        ...createEmptyPerson(newId),
        lastName: parent.lastName,
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
  }, []);

  // Creates a spouse and links both people to each other.
  const addSpouse = useCallback((personId, partial = {}) => {
    let newId;
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
  }, []);

  // Creates a parent linked to the person; pairs them with an existing spouseless parent.
  const addParent = useCallback((personId, partial = {}) => {
    let newId;
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
  }, []);

  // Creates a sibling sharing the same parent(s). If personId has no recorded
  // parents yet (e.g. a lineage root), auto-creates a shared "Unknown Parent"
  // placeholder first (see TreeNode's isPlaceholder branch) so the sibling has
  // somewhere to attach without inventing a fake, fully-specified parent.
  const addSibling = useCallback((personId, partial = {}) => {
    let newId;
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
  }, []);

  // Clears a mutual spouse link (both sides), including any recorded marriage date.
  // Neither person is deleted — just the relationship between them.
  const removeSpouse = useCallback((personId) => {
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
  }, []);

  // Removes one specific parent-child edge (both directions) without touching any
  // other relationship — e.g. fixing a single wrongly-recorded parent while leaving
  // the other parent and all other relatives untouched.
  const removeParent = useCallback((personId, parentId) => {
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
  }, []);

  const removeChild = useCallback((personId, childId) => {
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
  }, []);

  const setRoot = useCallback((id) => {
    setRootPersonId((prev) => (persons[id] ? id : prev));
  }, [persons]);

  // Replaces the entire dataset (used by import). Assumes data is pre-validated.
  const replaceAll = useCallback((data) => {
    setPersons(clone(data.persons));
    setRootPersonId(data.rootPersonId || Object.keys(data.persons)[0] || null);
  }, []);

  const exportData = useCallback(() => clone({ rootPersonId, persons }), [rootPersonId, persons]);

  return {
    persons,
    rootPersonId,
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
    setRoot,
    replaceAll,
    exportData,
  };
}
