// Pure helpers for reading relationships and derived person data.
// All functions take the `persons` map (id -> person) and never mutate it.

export function getPerson(persons, id) {
  if (!id) return null;
  return persons[id] || null;
}

export function getSpouse(persons, person) {
  if (!person || !person.spouseId) return null;
  return getPerson(persons, person.spouseId);
}

export function getParents(persons, person) {
  if (!person) return [];
  return person.parentIds.map((id) => getPerson(persons, id)).filter(Boolean);
}

export function getChildren(persons, person) {
  if (!person) return [];
  return person.childrenIds.map((id) => getPerson(persons, id)).filter(Boolean);
}

// Siblings share at least one parent, excluding the person themselves.
export function getSiblings(persons, person) {
  if (!person || person.parentIds.length === 0) return [];
  const parentSet = new Set(person.parentIds);
  const seen = new Set();
  const siblings = [];
  for (const parentId of person.parentIds) {
    const parent = getPerson(persons, parentId);
    if (!parent) continue;
    for (const childId of parent.childrenIds) {
      if (childId === person.id || seen.has(childId)) continue;
      const child = getPerson(persons, childId);
      if (!child) continue;
      // Only count as sibling if they share a parent (always true here).
      if (child.parentIds.some((pid) => parentSet.has(pid))) {
        seen.add(childId);
        siblings.push(child);
      }
    }
  }
  return siblings;
}

// True when a parentless person is merely attached-by-marriage to someone else's
// blood line (their spouse has recorded parents), rather than being the top of
// their own lineage. Such a person shouldn't get their own tree — they're drawn
// as an attached spouse card wherever their blood-relative partner appears.
function isMarriedIn(persons, person) {
  if (!person || person.parentIds.length > 0) return false;
  const spouse = getPerson(persons, person.spouseId);
  return !!spouse && spouse.parentIds.length > 0;
}

function collectAncestorIds(persons, id, visited = new Set()) {
  const person = getPerson(persons, id);
  if (!person) return visited;
  for (const parentId of person.parentIds) {
    if (visited.has(parentId)) continue;
    visited.add(parentId);
    collectAncestorIds(persons, parentId, visited);
  }
  return visited;
}

function collectDescendantIds(persons, id, visited = new Set()) {
  const person = getPerson(persons, id);
  if (!person) return visited;
  for (const childId of person.childrenIds) {
    if (visited.has(childId)) continue;
    visited.add(childId);
    collectDescendantIds(persons, childId, visited);
  }
  return visited;
}

// Which already-recorded people are safe to attach as `relation`
// ('parent'|'spouse'|'child'|'sibling') of personId instead of creating a new
// person — used by PersonForm's "Link Existing" tab. Excludes personId's own
// ancestors/descendants (would create a cycle), placeholders (fill those in
// directly instead), and anyone already in that exact role.
export function getEligibleLinkCandidates(persons, personId, relation) {
  const person = getPerson(persons, personId);
  if (!person) return [];

  const ancestorIds = collectAncestorIds(persons, personId);
  const descendantIds = collectDescendantIds(persons, personId);

  return Object.values(persons).filter((candidate) => {
    if (candidate.id === personId || candidate.isPlaceholder) return false;

    switch (relation) {
      case 'spouse':
        return !candidate.spouseId && !ancestorIds.has(candidate.id) && !descendantIds.has(candidate.id);
      case 'parent':
        return (
          !person.parentIds.includes(candidate.id) &&
          candidate.id !== person.spouseId &&
          !descendantIds.has(candidate.id)
        );
      case 'child':
        return (
          !person.childrenIds.includes(candidate.id) &&
          candidate.id !== person.spouseId &&
          candidate.parentIds.length < 2 &&
          !ancestorIds.has(candidate.id)
        );
      case 'sibling':
        return candidate.parentIds.length === 0 && candidate.id !== person.spouseId;
      default:
        return false;
    }
  });
}

// Counts a person's full blood-descendant closure (via childrenIds only), used to
// rank family clusters so the larger lineage claims any shared descendants first
// when two families are linked by a marriage deep inside both trees.
export function countDescendants(persons, id, visited = new Set()) {
  if (visited.has(id)) return 0;
  visited.add(id);
  const person = persons[id];
  if (!person) return 0;
  let count = 1;
  for (const childId of person.childrenIds) {
    count += countDescendants(persons, childId, visited);
  }
  return count;
}

// Walks up via parentIds[0] to the top of a person's primary blood line. When a
// person has two lineages feeding into them (e.g. a descendant of family A married
// a descendant of family B), this resolves the tie by treating parentIds[0]'s side
// as "primary" — used to decide which lineage should visually own shared descendants.
export function primaryLineageRoot(persons, id) {
  let current = getPerson(persons, id);
  if (!current) return id;
  const visited = new Set();
  while (current.parentIds.length > 0 && !visited.has(current.id)) {
    visited.add(current.id);
    const parent = getPerson(persons, current.parentIds[0]);
    if (!parent) break;
    current = parent;
  }
  return current.id;
}

// Resolves a person's father-side and mother-side lineage roots (their whole
// blood families' respective tops), per the parentIds[0]=father/[1]=mother
// convention — used both by computePedigreeLayout (which two trees to render)
// and by the dad-side/mom-side highlight coloring (which tree a node came from).
export function getLineageRootIds(persons, personId) {
  const person = getPerson(persons, personId);
  if (!person) return { fatherRootId: null, motherRootId: null };
  const [fatherId, motherId] = person.parentIds;
  const fatherRootId = fatherId && persons[fatherId] ? primaryLineageRoot(persons, fatherId) : null;
  const motherRootId = motherId && persons[motherId] ? primaryLineageRoot(persons, motherId) : null;
  return { fatherRootId, motherRootId };
}

// Every ancestor id reachable by walking BOTH recorded parents upward from `id`
// (not just parentIds[0]'s primary line) — e.g. for Manikandan this includes both
// his father's whole ancestry and his mother's, including Kasi via Vanaja. Used to
// tell "this bridged family is one of the root person's own blood lines" (always
// shown in full, e.g. Kasi's family, however large it grows) apart from "this
// bridged family is purely a spouse's own relatives" (a satellite candidate, e.g.
// Sofiya's parents' side) — see computeForestLayout's satellite exclusion.
export function getBloodAncestorIds(persons, id) {
  const result = new Set();
  const stack = [id];
  while (stack.length) {
    const curId = stack.pop();
    const cur = persons[curId];
    if (!cur) continue;
    (cur.parentIds || []).forEach((pid) => {
      if (!result.has(pid)) {
        result.add(pid);
        stack.push(pid);
      }
    });
  }
  return result;
}

// Finds every distinct top-of-lineage person/couple (no recorded parents, and not
// merely married into someone else's blood line) so each gets its own tree in the
// rendered forest. Two families can still be linked deep inside by a marriage (e.g.
// a daughter of one lineage marries a descendant of another) without one silently
// swallowing the other — computeForestLayout resolves the shared descendants.
// Sorted by lineage size (largest first) so the bigger family claims them, except
// `priorityId`'s own lineage always wins ownership of any shared descendant it's
// linked to (e.g. Kesavamoorthy/Vanaja), regardless of relative size — not just
// ties. Callers MUST pass a stable anchor here (e.g. App.jsx's persisted
// rootPersonId), never a transient focus/selection: keying this to whoever the user
// currently happens to be looking at would let ownership of a shared branch flip
// mid-session depending on click history, and — worse — if focus ever lands on
// someone whose lineage traces to a tiny satellite cluster (e.g. Sridhar, whose
// lineage is the 5-person "unknownMalar" family), that tiny cluster would jump the
// queue and steal a shared descendant (e.g. Sowmiya) away from the real family that
// should own her, then vanish her entirely once the cluster is excluded as a
// satellite. Anchoring to the app's stable root person (whose own lineage is a
// real, substantial family) avoids both problems.
export function getForestRoots(persons, priorityId) {
  const candidates = [];
  const skip = new Set();
  for (const id of Object.keys(persons)) {
    if (skip.has(id)) continue;
    const person = persons[id];
    if (person.parentIds.length > 0) continue; // not top-of-lineage
    if (isMarriedIn(persons, person)) continue; // attached to a blood line elsewhere

    const spouse = getPerson(persons, person.spouseId);
    if (spouse && spouse.parentIds.length === 0 && !isMarriedIn(persons, spouse)) {
      // Genuine top couple (neither has known parents) — pick one canonical
      // representative so they don't each spawn their own duplicate tree.
      const child = person.childrenIds.map((cid) => getPerson(persons, cid)).find(Boolean);
      const canonical = child && child.parentIds[0] === spouse.id ? spouse.id : id;
      skip.add(canonical === id ? spouse.id : id);
      candidates.push(canonical);
    } else {
      candidates.push(id);
    }
  }
  const roots = [...new Set(candidates)].sort(
    (a, b) => countDescendants(persons, b) - countDescendants(persons, a)
  );
  const priorityRoot = priorityId ? primaryLineageRoot(persons, priorityId) : null;
  const priorityIndex = priorityRoot ? roots.indexOf(priorityRoot) : -1;
  if (priorityIndex > 0) {
    roots.splice(priorityIndex, 1);
    roots.unshift(priorityRoot);
  }
  return roots;
}

// Finds cross-family marriage bridges between forest roots — e.g. Kesavamoorthy
// (a Subramanian descendant) marrying Vanaja (a Kasi descendant) links those two
// otherwise-separate trees. For each root, walks its own blood descent (one DFS
// per direct child, so we know which top-level branch to reorder later) and
// checks every descendant's spouse: if that spouse has recorded parents whose
// lineage traces to a *different* root also in this forest, that's a bridge.
// Returns one entry per unordered root pair, each side tagged with its own
// branch id (the direct child of that root leading to the bridge) so the layout
// can move that branch to whichever edge faces the other root.
export function findRootBridges(persons, roots) {
  const rootSet = new Set(roots);
  const byRoot = new Map(roots.map((r) => [r, new Map()])); // rootId -> otherRootId -> {branchId, weight}

  roots.forEach((rootId) => {
    const root = getPerson(persons, rootId);
    if (!root) return;
    root.childrenIds.forEach((branchId) => {
      if (!persons[branchId]) return;
      const visited = new Set();
      const stack = [branchId];
      while (stack.length) {
        const curId = stack.pop();
        if (visited.has(curId) || !persons[curId]) continue;
        visited.add(curId);
        const cur = persons[curId];
        const spouse = getPerson(persons, cur.spouseId);
        if (spouse && spouse.parentIds.length > 0) {
          const otherRoot = primaryLineageRoot(persons, spouse.id);
          if (otherRoot !== rootId && rootSet.has(otherRoot)) {
            const weight = countDescendants(persons, otherRoot);
            const existing = byRoot.get(rootId).get(otherRoot);
            if (!existing || weight > existing.weight) {
              // Genders of the actual bridging couple (not just the branch/ancestor
              // id), so orderRootsForBridges can put the husband's side on the left.
              byRoot.get(rootId).set(otherRoot, { branchId, weight, selfGender: cur.gender, spouseGender: spouse.gender });
            }
          }
        }
        cur.childrenIds.forEach((c) => stack.push(c));
      }
    });
  });

  const seenPairs = new Set();
  const bridges = [];
  roots.forEach((rootId) => {
    byRoot.get(rootId).forEach((info, otherRootId) => {
      const key = [rootId, otherRootId].sort().join('|');
      if (seenPairs.has(key)) return;
      seenPairs.add(key);
      const reciprocal = byRoot.get(otherRootId)?.get(rootId) ?? null;
      bridges.push({
        a: rootId,
        b: otherRootId,
        branchA: info.branchId,
        branchB: reciprocal?.branchId ?? null,
        weight: Math.min(countDescendants(persons, rootId), countDescendants(persons, otherRootId)),
        // From root a's side, the bridging person is `cur` (aGender) married to
        // `spouse` on root b's side (bGender) — see findRootBridges above.
        aGender: info.selfGender,
        bGender: info.spouseGender,
      });
    });
  });
  return bridges;
}

// Orders forest roots so bridged families sit adjacent wherever a 1-D left-to-right
// layout allows — each root can have at most two neighbours, so a root linked to
// three or more others can only be made adjacent to its two strongest links; the
// rest fall back to the leftover pass (still rendered, just not guaranteed adjacent).
// Only builds one chain (around the single strongest bridge and whatever attaches
// to its ends) — a root family with two entirely separate bridge clusters wouldn't
// get both chained; not a concern for the datasets this was built against.
export function orderRootsForBridges(roots, bridges) {
  if (!bridges.length) return [...roots];
  const sorted = [...bridges].sort((a, b) => b.weight - a.weight);
  let chain = null;
  const placed = new Set();

  sorted.forEach((bridge) => {
    const { a, b } = bridge;
    if (!chain) {
      if (!placed.has(a) && !placed.has(b)) {
        // Husband's/father's side left, wife's/mother's side right, whenever the
        // bridging couple's genders are known and differ — kept stable regardless
        // of which side was created first (e.g. adding a sibling to one spouse
        // before the other shouldn't flip which family ends up on which edge).
        chain = bridge.aGender === 'female' && bridge.bGender === 'male' ? [b, a] : [a, b];
        placed.add(a);
        placed.add(b);
      }
      return;
    }
    const aIn = placed.has(a);
    const bIn = placed.has(b);
    if (aIn === bIn) return; // both already placed, or both still new — can't extend from here
    const inChain = aIn ? a : b;
    const newRoot = aIn ? b : a;
    if (inChain === chain[0]) {
      chain.unshift(newRoot);
      placed.add(newRoot);
    } else if (inChain === chain[chain.length - 1]) {
      chain.push(newRoot);
      placed.add(newRoot);
    }
    // else: inChain is in the middle of the chain (both its slots are taken) —
    // this bridge can't get adjacency; newRoot falls through to the leftover pass.
  });

  const leftovers = roots.filter((r) => !placed.has(r));
  return chain ? [...chain, ...leftovers] : leftovers;
}

// For each root, if one of its *actual* final neighbours (per orderRootsForBridges)
// has a bridge to it, moves that bridge's branch to the edge facing that neighbour —
// e.g. Subramanian's Kesavamoorthy branch moves to his rightmost slot when Kasi ends
// up immediately to his right. Returns a Map of rootId -> reordered childrenIds
// (only for roots that need reordering); callers with no entry just use the natural order.
export function computeChildOrderOverrides(persons, orderedRoots, bridges) {
  const bridgeByPair = new Map(bridges.map((br) => [[br.a, br.b].sort().join('|'), br]));
  const overrides = new Map();

  orderedRoots.forEach((rootId, idx) => {
    const person = persons[rootId];
    if (!person) return;
    const neighbors = [
      [orderedRoots[idx - 1], 'left'],
      [orderedRoots[idx + 1], 'right'],
    ];
    const moves = [];
    neighbors.forEach(([neighborId, direction]) => {
      if (!neighborId) return;
      const bridge = bridgeByPair.get([rootId, neighborId].sort().join('|'));
      if (!bridge) return;
      const branchId = bridge.a === rootId ? bridge.branchA : bridge.branchB;
      if (branchId && person.childrenIds.includes(branchId)) {
        moves.push({ branchId, direction, weight: bridge.weight });
      }
    });
    if (!moves.length) return;

    const byBranch = new Map();
    moves.forEach((m) => {
      const existing = byBranch.get(m.branchId);
      if (!existing || m.weight > existing.weight) byBranch.set(m.branchId, m);
    });

    let order = person.childrenIds.filter((c) => persons[c]);
    byBranch.forEach((m) => {
      order = order.filter((c) => c !== m.branchId);
      order = m.direction === 'left' ? [m.branchId, ...order] : [...order, m.branchId];
    });
    overrides.set(rootId, order);
  });

  return overrides;
}

export function getFullName(person) {
  if (!person) return '';
  return `${person.firstName} ${person.lastName}`.trim();
}

// Full name with the person's pet name appended in brackets, e.g. "Satish Kumar
// Chandrasekaran (Sambu)" — used wherever a person's name is shown as their own
// primary label (the detail panel header), not in tight spaces like tree cards or
// inline confirm-dialog text where the extra text would just add clutter.
export function getDisplayName(person) {
  const name = getFullName(person);
  return person?.petName?.trim() ? `${name} (${person.petName.trim()})` : name;
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Formats an ISO date for display as "14-Jun-1991" — the underlying <input type="date">
// value stays ISO (browsers require that), this is purely presentational. Falls back to
// showing the raw value as-is for anything that isn't a full YYYY-MM-DD (e.g. a
// year-only "1995", which the app allows when the exact date isn't known).
export function formatDateDisplay(iso) {
  if (!iso) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  const [, year, month, day] = match;
  const monthAbbr = MONTH_ABBR[Number(month) - 1];
  if (!monthAbbr) return iso;
  return `${day}-${monthAbbr}-${year}`;
}

export function getInitials(person) {
  if (!person) return '?';
  const first = person.firstName?.[0] || '';
  const last = person.lastName?.[0] || '';
  return (first + last).toUpperCase() || '?';
}

// Returns whole years between two ISO dates (or date -> now).
function yearsBetween(fromIso, toIso) {
  const from = new Date(fromIso);
  const to = toIso ? new Date(toIso) : new Date();
  if (isNaN(from) || isNaN(to)) return null;
  let age = to.getFullYear() - from.getFullYear();
  const m = to.getMonth() - from.getMonth();
  if (m < 0 || (m === 0 && to.getDate() < from.getDate())) age -= 1;
  return age >= 0 ? age : null;
}

// { value: number, label: "Age" | "Lived" } or null when DOB missing.
export function getAgeInfo(person) {
  if (!person || !person.dob) return null;
  if (!person.isAlive && person.dod) {
    const years = yearsBetween(person.dob, person.dod);
    return years == null ? null : { value: years, label: 'Lived' };
  }
  const years = yearsBetween(person.dob, null);
  return years == null ? null : { value: years, label: 'Age' };
}

// Days until the next occurrence of dob's month/day (0 = today), or null if missing/invalid.
export function getDaysUntilBirthday(dob, today = new Date()) {
  if (!dob) return null;
  const date = new Date(dob);
  if (isNaN(date)) return null;
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let next = new Date(start.getFullYear(), date.getMonth(), date.getDate());
  if (next < start) next = new Date(start.getFullYear() + 1, date.getMonth(), date.getDate());
  return Math.round((next - start) / 86400000);
}

// Direct children count plus one layer down (children's children) — a quick
// "family size" indicator for the detail panel.
export function getFamilyStats(persons, person) {
  if (!person) return null;
  const children = getChildren(persons, person);
  const grandchildrenCount = children.reduce((sum, child) => sum + child.childrenIds.length, 0);
  return {
    childrenCount: children.length,
    grandchildrenCount,
    siblingsCount: getSiblings(persons, person).length,
  };
}

// id -> generations-up distance map (0 = self), walking every recorded parent
// (not just parentIds[0]) so both blood-lines are covered.
function ancestorDistances(persons, id) {
  const dist = new Map([[id, 0]]);
  let frontier = [id];
  let depth = 0;
  while (frontier.length) {
    depth += 1;
    const next = [];
    for (const curId of frontier) {
      const cur = getPerson(persons, curId);
      if (!cur) continue;
      for (const parentId of cur.parentIds) {
        if (!dist.has(parentId)) {
          dist.set(parentId, depth);
          next.push(parentId);
        }
      }
    }
    frontier = next;
  }
  return dist;
}

const GREAT_PREFIXES = ['', 'Great-', 'Great-Great-'];
function greatPrefix(n) {
  if (n <= 0) return '';
  if (n < GREAT_PREFIXES.length) return GREAT_PREFIXES[n];
  return `${n}x-Great-`;
}

function ordinal(n) {
  if (n % 10 === 1 && n % 100 !== 11) return `${n}st`;
  if (n % 10 === 2 && n % 100 !== 12) return `${n}nd`;
  if (n % 10 === 3 && n % 100 !== 13) return `${n}rd`;
  return `${n}th`;
}

// Nearest common ancestor between two people (via parentIds BFS). Returns the step
// distances { distA, distB } from each up to that ancestor, or null if unrelated.
function commonAncestor(persons, aId, bId) {
  const aAncestors = ancestorDistances(persons, aId);
  const bAncestors = ancestorDistances(persons, bId);
  let best = null;
  for (const [ancestorId, distA] of aAncestors) {
    const distB = bAncestors.get(ancestorId);
    if (distB == null) continue;
    if (!best || distA + distB < best.distA + best.distB) best = { distA, distB };
  }
  return best;
}

// Blood label from the person's and root's distances to their common ancestor.
function bloodLabelFromDistances(distPerson, distRoot, male, female) {
  // root is the common ancestor: person descends from root.
  if (distRoot === 0) {
    if (distPerson === 1) return male ? 'Son' : female ? 'Daughter' : 'Child';
    if (distPerson === 2) return male ? 'Grandson' : female ? 'Granddaughter' : 'Grandchild';
    const prefix = greatPrefix(distPerson - 2);
    return male ? `${prefix}Great-Grandson` : female ? `${prefix}Great-Granddaughter` : `${prefix}Great-Grandchild`;
  }
  // person is the common ancestor: root descends from person.
  if (distPerson === 0) {
    if (distRoot === 1) return male ? 'Father' : female ? 'Mother' : 'Parent';
    if (distRoot === 2) return male ? 'Grandfather' : female ? 'Grandmother' : 'Grandparent';
    const prefix = greatPrefix(distRoot - 2);
    return male ? `${prefix}Great-Grandfather` : female ? `${prefix}Great-Grandmother` : `${prefix}Great-Grandparent`;
  }
  // Same generation from the shared ancestor: siblings or cousins.
  if (distRoot === distPerson) {
    if (distRoot === 1) return male ? 'Brother' : female ? 'Sister' : 'Sibling';
    return `${ordinal(distRoot - 1)} Cousin`;
  }
  // Different generations, neither is the other's direct ancestor. (No "removed"
  // suffix — cousins across generations are just labelled by the lower cousin degree.)
  if (distRoot < distPerson) {
    if (distRoot === 1 && distPerson === 2) return male ? 'Nephew' : female ? 'Niece' : 'Nibling';
    if (distRoot === 1) {
      const prefix = greatPrefix(distPerson - 2);
      return male ? `${prefix}Grand-Nephew` : female ? `${prefix}Grand-Niece` : `${prefix}Grand-Nibling`;
    }
    return `${ordinal(distRoot - 1)} Cousin`;
  }
  if (distPerson === 1 && distRoot === 2) return male ? 'Uncle' : female ? 'Aunt' : 'Aunt/Uncle';
  if (distPerson === 1) {
    const prefix = greatPrefix(distRoot - 2);
    return male ? `${prefix}Grand-Uncle` : female ? `${prefix}Grand-Aunt` : `${prefix}Grand-Aunt/Uncle`;
  }
  return `${ordinal(distPerson - 1)} Cousin`;
}

function bloodLabel(persons, personId, rootId, male, female) {
  const best = commonAncestor(persons, personId, rootId);
  if (!best) return null;
  return bloodLabelFromDistances(best.distA, best.distB, male, female);
}

// person married INTO root's blood family: person's spouse is `dist`-related to root.
// distSP/distRoot are the spouse's and root's distances to their common ancestor.
function inLawTermMarriedIn(distSP, distRoot, male, female) {
  if (distRoot === 0) {
    if (distSP === 1) return male ? 'Son-in-law' : female ? 'Daughter-in-law' : 'Child-in-law';
    if (distSP === 2) return male ? 'Grandson-in-law' : female ? 'Granddaughter-in-law' : 'Grandchild-in-law';
    const prefix = greatPrefix(distSP - 2);
    return male ? `${prefix}Great-Grandson-in-law` : female ? `${prefix}Great-Granddaughter-in-law` : `${prefix}Great-Grandchild-in-law`;
  }
  if (distRoot === 1 && distSP === 1) return male ? 'Brother-in-law' : female ? 'Sister-in-law' : 'Sibling-in-law';
  if (distSP === 1 && distRoot === 2) return male ? 'Uncle-in-law' : female ? 'Aunt-in-law' : 'Aunt/Uncle-in-law';
  if (distSP === 1 && distRoot > 2) {
    const prefix = greatPrefix(distRoot - 2);
    return male ? `${prefix}Grand-Uncle-in-law` : female ? `${prefix}Grand-Aunt-in-law` : `${prefix}Grand-Aunt/Uncle-in-law`;
  }
  return null;
}

// person is blood kin of root's spouse (RS): person is `dist`-related to RS.
function inLawTermSpouseKin(distPerson, distRS, male, female) {
  if (distPerson === 0) {
    if (distRS === 1) return male ? 'Father-in-law' : female ? 'Mother-in-law' : 'Parent-in-law';
    if (distRS === 2) return male ? 'Grandfather-in-law' : female ? 'Grandmother-in-law' : 'Grandparent-in-law';
    const prefix = greatPrefix(distRS - 2);
    return male ? `${prefix}Great-Grandfather-in-law` : female ? `${prefix}Great-Grandmother-in-law` : `${prefix}Great-Grandparent-in-law`;
  }
  if (distPerson === 1 && distRS === 1) return male ? 'Brother-in-law' : female ? 'Sister-in-law' : 'Sibling-in-law';
  if (distPerson === 1 && distRS === 2) return male ? 'Uncle-in-law' : female ? 'Aunt-in-law' : 'Aunt/Uncle-in-law';
  if (distPerson === 1 && distRS > 2) {
    const prefix = greatPrefix(distRS - 2);
    return male ? `${prefix}Grand-Uncle-in-law` : female ? `${prefix}Grand-Aunt-in-law` : `${prefix}Grand-Aunt/Uncle-in-law`;
  }
  return null;
}

// Marriage-based (in-law) relationship of person to root, one marriage hop from a blood
// tie in either direction. Returns the closest match, or null if none in scope.
function inLawLabel(persons, personId, rootId, male, female) {
  const person = getPerson(persons, personId);
  const root = getPerson(persons, rootId);
  if (!person || !root) return null;
  const candidates = [];

  if (person.spouseId && person.spouseId !== rootId) {
    const ca = commonAncestor(persons, person.spouseId, rootId);
    if (ca) {
      const term = inLawTermMarriedIn(ca.distA, ca.distB, male, female);
      if (term) candidates.push({ term, cost: ca.distA + ca.distB });
    }
  }
  if (root.spouseId && root.spouseId !== personId) {
    const ca = commonAncestor(persons, personId, root.spouseId);
    if (ca) {
      const term = inLawTermSpouseKin(ca.distA, ca.distB, male, female);
      if (term) candidates.push({ term, cost: ca.distA + ca.distB });
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.cost - b.cost);
  return candidates[0].term;
}

// Plain-language relationship of `personId` to `rootId` — blood (e.g. "Grandson",
// "Aunt", "2nd Cousin"), marriage/in-law (e.g. "Sister-in-law"), or both joined with
// " / " when a person is related in more than one way. Returns null for the root
// themselves, an unrelated/unrecorded pair, or when either id is missing.
export function getRelationshipLabel(persons, personId, rootId) {
  if (!personId || !rootId || personId === rootId) return null;
  const person = getPerson(persons, personId);
  const root = getPerson(persons, rootId);
  if (!person || !root) return null;

  if (person.spouseId === rootId) return 'Spouse';

  const male = person.gender === 'male';
  const female = person.gender === 'female';

  const parts = [
    bloodLabel(persons, personId, rootId, male, female),
    inLawLabel(persons, personId, rootId, male, female),
  ].filter(Boolean);
  return parts.length ? parts.join(' / ') : null;
}

let idCounter = 0;

// Generates an id not present in the given persons map.
export function generateId(persons) {
  let candidate;
  do {
    idCounter += 1;
    candidate = `p${String(Date.now()).slice(-6)}${idCounter}`;
  } while (persons[candidate]);
  return candidate;
}

export function createEmptyPerson(id) {
  return {
    id,
    firstName: '',
    lastName: '',
    petName: '',
    gender: 'other',
    dob: '',
    dod: '',
    isAlive: true,
    work: '',
    location: '',
    phone: '',
    email: '',
    photo: '',
    notes: '',
    spouseId: '',
    marriageDate: '',
    parentIds: [],
    childrenIds: [],
  };
}

const REQUIRED_PERSON_FIELDS = ['id', 'firstName', 'lastName', 'gender'];

// Validates the shape of imported data. Returns { valid, error }.
export function validateFamilyData(data) {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'File is not a valid JSON object.' };
  }
  if (!data.persons || typeof data.persons !== 'object') {
    return { valid: false, error: 'Missing "persons" object.' };
  }
  const ids = Object.keys(data.persons);
  if (ids.length === 0) {
    return { valid: false, error: 'The family has no people.' };
  }
  for (const id of ids) {
    const person = data.persons[id];
    for (const field of REQUIRED_PERSON_FIELDS) {
      if (!person[field]) {
        return { valid: false, error: `Person "${id}" is missing "${field}".` };
      }
    }
    if (person.id !== id) {
      return { valid: false, error: `Person key "${id}" does not match its id "${person.id}".` };
    }
  }
  if (data.rootPersonId && !data.persons[data.rootPersonId]) {
    return { valid: false, error: 'rootPersonId does not refer to a known person.' };
  }
  return { valid: true, error: null };
}

// Full array of ids from personId up through parentIds[0] to the top of their
// primary blood line (dad-line priority, same convention as primaryLineageRoot) —
// used to highlight a single person's lineage-to-root path in the tree view.
export function getAncestorChain(persons, personId) {
  const chain = [];
  let current = getPerson(persons, personId);
  const visited = new Set();
  while (current && !visited.has(current.id)) {
    chain.push(current.id);
    visited.add(current.id);
    current = getPerson(persons, current.parentIds[0]);
  }
  return chain;
}

// Deepest generation count reachable from a single root (1 = the root alone).
function maxDepthFrom(persons, id, visited = new Set()) {
  if (visited.has(id)) return 0;
  visited.add(id);
  const person = getPerson(persons, id);
  if (!person) return 0;
  let maxChildDepth = 0;
  for (const childId of person.childrenIds) {
    maxChildDepth = Math.max(maxChildDepth, maxDepthFrom(persons, childId, visited));
  }
  return 1 + maxChildDepth;
}

// One-pass summary of the whole dataset for the stats bar/panel.
export function computeFamilyStats(persons) {
  const all = Object.values(persons);
  const totalMembers = all.length;
  let males = 0;
  let females = 0;
  let other = 0;
  let alive = 0;
  let deceased = 0;
  let lifespanSum = 0;
  let lifespanCount = 0;
  const locationCounts = new Map();
  const lastNameCounts = new Map();
  const countedCouples = new Set();
  let marriedCouples = 0;
  let verifiedProfiles = 0;

  all.forEach((p) => {
    if (p.gender === 'male') males += 1;
    else if (p.gender === 'female') females += 1;
    else other += 1;

    if (p.isAlive) alive += 1;
    else deceased += 1;

    if (p.verifiedEmail) verifiedProfiles += 1;

    if (!p.isAlive) {
      const age = getAgeInfo(p);
      if (age && age.label === 'Lived') {
        lifespanSum += age.value;
        lifespanCount += 1;
      }
    }

    const location = p.location?.trim();
    if (location) locationCounts.set(location, (locationCounts.get(location) || 0) + 1);

    const lastName = p.lastName?.trim();
    if (lastName) lastNameCounts.set(lastName, (lastNameCounts.get(lastName) || 0) + 1);

    if (p.spouseId && persons[p.spouseId]) {
      const pairKey = [p.id, p.spouseId].sort().join('|');
      if (!countedCouples.has(pairKey)) {
        countedCouples.add(pairKey);
        marriedCouples += 1;
      }
    }
  });

  const topN = (map, n = 5) =>
    [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, count]) => ({ name, count }));

  const roots = getForestRoots(persons);
  const generationCount = roots.reduce((max, r) => Math.max(max, maxDepthFrom(persons, r)), 0);

  return {
    totalMembers,
    males,
    females,
    other,
    alive,
    deceased,
    avgLifespanYears: lifespanCount ? Math.round((lifespanSum / lifespanCount) * 10) / 10 : null,
    avgLifespanSampleSize: lifespanCount,
    verifiedProfiles,
    generationCount,
    topLocations: topN(locationCounts),
    topLastNames: topN(lastNameCounts),
    marriedCouples,
  };
}
