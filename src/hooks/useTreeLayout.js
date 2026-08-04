import { useMemo } from 'react';
import {
  findRootBridges,
  orderRootsForBridges,
  computeChildOrderOverrides,
  countDescendants,
  primaryLineageRoot,
  getLineageRootIds,
} from '../utils/familyUtils';

// Card + spacing geometry (in world pixels).
export const NODE_W = 132;
export const NODE_H = 116; // tall enough for a 2-line wrapped name below the avatar
export const COUPLE_GAP = 20; // space between a person and their spouse
export const H_GAP = 40; // horizontal gap between sibling subtrees
export const V_GAP = 84; // vertical gap between generations
export const AVATAR_TOP = 6; // card padding-top before the avatar circle (must match CSS)
export const AVATAR_SIZE = 56; // avatar circle diameter (must match CSS)

function coupleWidth(persons, person) {
  const hasSpouse = person.spouseId && persons[person.spouseId];
  return hasSpouse ? NODE_W * 2 + COUPLE_GAP : NODE_W;
}

// Measures the horizontal span a person's subtree needs. `placed` tracks node ids
// already drawn under an earlier (larger) tree in the forest — e.g. a descendant
// reached again through a cross-family marriage — so they aren't measured twice.
function measure(persons, id, collapsed, visited, placed) {
  const person = persons[id];
  if (!person || visited.has(id)) return NODE_W;
  visited.add(id);

  const own = coupleWidth(persons, person);
  const children = collapsed.has(id)
    ? []
    : person.childrenIds.filter((c) => persons[c] && !visited.has(c) && !placed.has(c));

  if (children.length === 0) {
    visited.delete(id);
    return own;
  }

  let childrenWidth = 0;
  children.forEach((c, i) => {
    childrenWidth += measure(persons, c, collapsed, visited, placed);
    if (i < children.length - 1) childrenWidth += H_GAP;
  });

  visited.delete(id);
  return Math.max(own, childrenWidth);
}

// Recursively places nodes; returns the couple's centre x. `placed` is shared across
// every tree in the forest (see computeForestLayout) so a person already drawn under
// a bigger, earlier-processed lineage is shown here as a leaf (no duplicate subtree)
// rather than re-rendered with a second copy of their descendants.
function place(persons, id, depth, leftX, collapsed, out, visited, placed) {
  const person = persons[id];
  const width = measure(persons, id, collapsed, new Set(), placed);
  const y = depth * (NODE_H + V_GAP);
  visited.add(id);
  placed.add(id);

  // Claim the attached spouse too — if their own lineage is processed as a
  // separate tree later in the forest, they've already been drawn here and
  // shouldn't be re-rendered there as a duplicate leaf.
  const spouseForClaim = person.spouseId && persons[person.spouseId] ? persons[person.spouseId] : null;
  if (spouseForClaim) placed.add(spouseForClaim.id);

  // Snapshot before recursing — placing our own children below adds them to
  // `placed` too, which would otherwise make this always look childless.
  const anyExpandableChildren = person.childrenIds.some(
    (c) => persons[c] && !visited.has(c) && !placed.has(c)
  );

  const children = collapsed.has(id)
    ? []
    : person.childrenIds.filter((c) => persons[c] && !visited.has(c) && !placed.has(c));

  // Children who are genuinely this person's own kids but already drawn elsewhere
  // (e.g. Vanaja, shown as Kesavamoorthy's spouse under Subramanian's tree, is still
  // Kasi's own daughter) — recorded as a stub to resolve into a dashed cross-tree
  // link once every tree's final on-canvas position is known (see computeForestLayout).
  if (!collapsed.has(id)) {
    person.childrenIds
      .filter((c) => persons[c] && !visited.has(c) && placed.has(c))
      .forEach((c) => out.crossLinks.push({ parentId: id, childId: c }));
  }

  let centerX;
  // {id, center} for children actually placed. A child listed here can still end up
  // skipped below if an EARLIER sibling's own recursion claims them mid-loop — e.g.
  // a close-relative marriage within one tree (an aunt who's also her nephew's wife)
  // means the same person is reachable two ways in a single tree, not just across
  // trees in the forest. Whichever sibling is processed first (childrenIds order)
  // wins; the other's branch simply omits that already-claimed child rather than
  // rendering them a second time.
  const placedChildren = [];

  if (children.length === 0) {
    centerX = leftX + width / 2;
  } else {
    const widths = children.map((c) => measure(persons, c, collapsed, new Set(), placed));
    const total = widths.reduce((a, b) => a + b, 0) + H_GAP * (children.length - 1);

    let cursor = leftX + (width - total) / 2;
    children.forEach((c, i) => {
      if (!placed.has(c)) {
        const cCenter = place(persons, c, depth + 1, cursor, collapsed, out, visited, placed);
        placedChildren.push({ id: c, center: cCenter });
      }
      cursor += widths[i] + H_GAP;
    });
    centerX = placedChildren.length
      ? (placedChildren[0].center + placedChildren[placedChildren.length - 1].center) / 2
      : leftX + width / 2;
  }

  const cw = coupleWidth(persons, person);

  out.nodes.push({
    id,
    person,
    spouse: spouseForClaim,
    x: centerX,
    y,
    coupleWidth: cw,
    depth,
    hasChildren: anyExpandableChildren,
    collapsed: collapsed.has(id),
    childIds: placedChildren.map((pc) => pc.id),
  });

  // Parent-to-child connectors, anchored to the avatar circle edges (not the whole
  // card). toX targets the CHILD's own avatar specifically — not the couple's shared
  // centre — so a child with a spouse attached (e.g. Renganayaki + Narayanan) reads
  // unambiguously as "this line is Renganayaki's parentage," not the couple's.
  const childY = (depth + 1) * (NODE_H + V_GAP);
  const HALF_COUPLE_OFFSET = (NODE_W + COUPLE_GAP) / 2; // couple-centre -> the blood relative's own avatar
  placedChildren.forEach(({ id: c, center }) => {
    const childPerson = persons[c];
    const childHasSpouse = childPerson.spouseId && persons[childPerson.spouseId];
    out.links.push({
      fromX: centerX,
      fromY: y + AVATAR_TOP + AVATAR_SIZE,
      toX: center - (childHasSpouse ? HALF_COUPLE_OFFSET : 0),
      toY: childY + AVATAR_TOP,
    });
  });

  out.maxDepth = Math.max(out.maxDepth, depth);
  return centerX;
}

// `placed` lets multiple trees in a forest share one claim-set (see computeForestLayout);
// a standalone single-tree call defaults to a fresh one. `rootChildOrder`, when given,
// overrides the root's own childrenIds order (see computeForestLayout's bridge-facing
// reordering) without needing to thread an override through the whole recursion.
export function computeTreeLayout(persons, rootId, collapsed = new Set(), placed = new Set(), rootChildOrder = null) {
  const out = { nodes: [], links: [], crossLinks: [], maxDepth: 0, width: 0, height: 0 };
  if (!rootId || !persons[rootId] || placed.has(rootId)) return out;

  const effectivePersons = rootChildOrder
    ? { ...persons, [rootId]: { ...persons[rootId], childrenIds: rootChildOrder } }
    : persons;

  const totalWidth = measure(effectivePersons, rootId, collapsed, new Set(), placed);
  place(effectivePersons, rootId, 0, 0, collapsed, out, new Set(), placed);

  out.width = totalWidth;
  out.height = (out.maxDepth + 1) * NODE_H + out.maxDepth * V_GAP;
  return out;
}

export function useTreeLayout(persons, rootId, collapsed) {
  return useMemo(() => computeTreeLayout(persons, rootId, collapsed), [persons, rootId, collapsed]);
}

export const TREE_GAP = 100; // horizontal gap between separate disconnected family trees

// Lays out every disconnected family tree side by side on one canvas. A person
// reachable from two lineages (e.g. a daughter who married into another family's
// tree) is only drawn once, under whichever lineage rightfully owns her — see the
// two-pass split below. Roots aren't simply drawn in getForestRoots' size order:
// findRootBridges/orderRootsForBridges detect cross-family marriages (e.g. a descendant
// of one root married a descendant of another) and reorder the roots so linked families
// sit adjacent wherever a 1-D layout allows, then computeChildOrderOverrides nudges each
// root's own children so the bridging branch faces its actual neighbour.
//
// A root that's both genuinely tiny (below SATELLITE_MAX_SIZE) AND only connected to
// the rest of the family via a marriage into a bigger lineage (e.g. a spouse's own
// small, otherwise-unrelated side-family) is left off the canvas entirely — it would
// just clutter the main view with a satellite family nobody asked to see there. It's
// still fully reachable: TreeNode independently offers a "jump to their family"
// badge (opening a dedicated Pedigree View) on anyone married in with recorded
// parents, regardless of whether their own family is excluded here as a satellite
// or simply isn't part of this particular layout call at all (e.g. Pedigree View
// only ever lays out the focus person's own two lineages).
//
// The size check is an ABSOLUTE threshold, not "smaller than the other side" — a
// relative comparison is fragile: growing a real second family (e.g. adding more
// people to Kasi's tree) would otherwise be enough to flip it from "shown" to
// "hidden" purely because the OTHER side grew even more, with nothing about Kasi's
// own family having changed. An absolute floor means a substantial family (Kasi's
// 25+ people) never gets excluded regardless of how large a linked family grows,
// while genuinely tiny satellites (a 3-5 person married-in cluster) still are.
const SATELLITE_MAX_SIZE = 10;

// `excludeSatellites` (default true) drops tiny bridged-in clusters, per the note
// above — set to false when the caller has deliberately chosen a small, specific
// set of roots to render in full (e.g. computePedigreeLayout's father/mother-side
// pair) where nobody should ever be trimmed.
export function computeForestLayout(persons, rootIds, collapsed = new Set(), { excludeSatellites = true } = {}) {
  const out = { nodes: [], links: [], crossLinks: [], maxDepth: 0, width: 0, height: 0 };
  const bridges = findRootBridges(persons, rootIds);

  const sizeOf = (id) => countDescendants(persons, id);
  const excludedRoots = new Set(
    excludeSatellites
      ? rootIds.filter(
          (id) =>
            sizeOf(id) <= SATELLITE_MAX_SIZE &&
            bridges.some(
              (b) => (b.a === id && sizeOf(b.b) > sizeOf(id)) || (b.b === id && sizeOf(b.a) > sizeOf(id))
            )
        )
      : []
  );
  const mainRootIds = rootIds.filter((id) => !excludedRoots.has(id));
  const mainBridges = bridges.filter((b) => !excludedRoots.has(b.a) && !excludedRoots.has(b.b));

  const orderedRoots = orderRootsForBridges(mainRootIds, mainBridges);
  const childOrderOverrides = computeChildOrderOverrides(persons, orderedRoots, mainBridges);

  // Pass 1 (dry run, ORIGINAL priority order over EVERY root, main or excluded):
  // decide which root owns each shared descendant. This has to stay independent of
  // on-screen position — otherwise a small family that gets moved next to a bigger
  // one purely for adjacency (e.g. a tiny linked cluster placed right before
  // Subramanian's tree) could claim a shared member first just because it happens
  // to run first, stealing them from the family they actually belong to (e.g.
  // Sowmiya ending up under her husband's tiny side-family instead of as
  // Manikandan's sister under Kesavamoorthy).
  const claimedBy = new Map(); // id -> owning rootId
  const dryPlaced = new Set();
  rootIds.forEach((rootId) => {
    const before = new Set(dryPlaced);
    computeTreeLayout(persons, rootId, collapsed, dryPlaced);
    dryPlaced.forEach((id) => {
      if (!before.has(id) && !claimedBy.has(id)) claimedBy.set(id, rootId);
    });
  });

  const pendingCrossLinks = []; // {parentId, childId} stubs, resolved to solid lines below

  // Excluded (satellite) roots: computed only to harvest their cross-link stubs in
  // case the other end IS rendered on this canvas — never added to the canvas
  // themselves.
  excludedRoots.forEach((rootId) => {
    const otherClaims = new Set(
      [...claimedBy.entries()].filter(([, owner]) => owner !== rootId).map(([claimedId]) => claimedId)
    );
    const tree = computeTreeLayout(persons, rootId, collapsed, otherClaims);
    pendingCrossLinks.push(...tree.crossLinks);
  });

  // Pass 2: lay out each main tree for real, in visual (bridge-adjacent) order. Each
  // root only treats ids owned by OTHER roots as "already placed" — its own claimed
  // ids (even though the dry run touched them too) are drawn normally here.
  //
  // Every root's OWN tree independently starts at depth 0 (y = 0) — fine for
  // genuinely separate families, but wrong for a lone auto-created placeholder
  // parent (see useFamily.js's addSibling) whose only child got claimed by a
  // DIFFERENT, earlier-processed root (e.g. that child's own spouse's tree). Such
  // a placeholder is collected into `batches` first (instead of going straight
  // onto the canvas) so it can be re-anchored one generation above its real
  // child's final position before anything is drawn — see below.
  let xOffset = 0;
  const batches = [];
  orderedRoots.forEach((rootId) => {
    const otherClaims = new Set(
      [...claimedBy.entries()].filter(([, owner]) => owner !== rootId).map(([claimedId]) => claimedId)
    );
    const tree = computeTreeLayout(persons, rootId, collapsed, otherClaims, childOrderOverrides.get(rootId) ?? null);
    if (!tree.nodes.length) return;
    batches.push({ rootId, tree, xOffset });
    pendingCrossLinks.push(...tree.crossLinks);
    out.maxDepth = Math.max(out.maxDepth, tree.maxDepth);
    xOffset += tree.width + TREE_GAP;
  });
  out.width = Math.max(0, xOffset - TREE_GAP);

  // A root that's an auto-created placeholder parent normally belongs one
  // generation ABOVE its real children — but if one of its children was claimed
  // by a different (earlier-processed) root, e.g. because that child already has
  // their own spouse/root elsewhere, the placeholder's own batch has no fixed
  // relationship to THAT root and, left alone, starts at row 0 like every other
  // independent root instead of one row above where the child actually ended up.
  // Detect that cross-linked case here and shift the placeholder's whole batch
  // (itself plus any of its own unclaimed children, e.g. a sibling added at the
  // same time) so it sits exactly one generation above the claimed child —
  // dragging its own unclaimed children along keeps them correctly one row below
  // the placeholder, and thus alongside their claimed sibling, same as before.
  batches.forEach((batch) => {
    const rootNode = batch.tree.nodes.find((n) => n.id === batch.rootId);
    if (!rootNode || !rootNode.person?.isPlaceholder) return;
    const link = batch.tree.crossLinks.find((l) => l.parentId === rootNode.id);
    if (!link) return;
    const childBatch = batches.find(
      (b) => b !== batch && b.tree.nodes.some((n) => n.id === link.childId || n.spouse?.id === link.childId)
    );
    if (!childBatch) return;
    const childNode = childBatch.tree.nodes.find((n) => n.id === link.childId || n.spouse?.id === link.childId);
    batch.yShift = childNode.y - (NODE_H + V_GAP) - rootNode.y;
  });

  batches.forEach(({ rootId, tree, xOffset: xo, yShift = 0 }) => {
    // Tags each node with which root's tree it was drawn from — lets the
    // dad-side/mom-side highlighting tell fatherRoot's tree apart from motherRoot's.
    tree.nodes.forEach((n) => out.nodes.push({ ...n, x: n.x + xo, y: n.y + yShift, treeRootId: rootId }));
    tree.links.forEach((l) =>
      out.links.push({ ...l, fromX: l.fromX + xo, toX: l.toX + xo, fromY: l.fromY + yShift, toY: l.toY + yShift })
    );
  });

  // A re-anchored placeholder can land above row 0 (negative y) — renormalize the
  // whole canvas so the topmost node is still at y = 0, keeping compatibility with
  // centerTree()'s pan math and anything else assuming the canvas starts at the origin.
  const minY = out.nodes.reduce((min, n) => Math.min(min, n.y), 0);
  if (minY < 0) {
    out.nodes.forEach((n) => {
      n.y -= minY;
    });
    out.links.forEach((l) => {
      l.fromY -= minY;
      l.toY -= minY;
    });
  }
  out.height = out.nodes.reduce((max, n) => Math.max(max, n.y + NODE_H), 0);

  // Resolve each cross-link stub against the final canvas. If BOTH ends are actually
  // rendered here (e.g. Kasi+Dhanam and Vanaja, since Kasi's family isn't excluded),
  // draw a normal SOLID connector straight into out.links. If one end isn't rendered
  // (an excluded satellite family, or simply out of scope for this layout call),
  // there's nothing to draw a line to — TreeNode's own jump badge (based directly on
  // parentIds, not this map) covers that case instead.
  const HALF_COUPLE_OFFSET = (NODE_W + COUPLE_GAP) / 2;
  pendingCrossLinks.forEach(({ parentId, childId }) => {
    const parentNode = out.nodes.find((n) => n.id === parentId);
    const childAsPrimary = parentNode ? out.nodes.find((n) => n.id === childId) : null;
    const childAsSpouse = parentNode && !childAsPrimary ? out.nodes.find((n) => n.spouse?.id === childId) : null;
    const childNode = childAsPrimary || childAsSpouse;

    if (parentNode && childNode) {
      const childX = childAsSpouse ? childNode.x + HALF_COUPLE_OFFSET : childNode.x;
      out.links.push({
        fromX: parentNode.x,
        fromY: parentNode.y + AVATAR_TOP + AVATAR_SIZE,
        toX: childX,
        toY: childNode.y + AVATAR_TOP,
      });
    }
  });

  return out;
}

export function useForestLayout(persons, rootIds, collapsed) {
  return useMemo(() => computeForestLayout(persons, rootIds, collapsed), [persons, rootIds, collapsed]);
}

// --- Full family pedigree (father's whole lineage + mother's whole lineage) ---
// Renders the focus person's father's entire family tree (every descendant of his
// own top-of-lineage ancestor — siblings, cousins, uncles/aunts, all of it) and
// the mother's entire family tree the same way, side by side, reusing the exact
// same bridge-adjacency machinery as the full forest view (findRootBridges /
// orderRootsForBridges / computeChildOrderOverrides) so the two lineages land
// next to each other with the parents' own marriage as the seam between them.
// Passing exactly these two roots (rather than every root in the dataset) and
// `excludeSatellites: false` guarantees nobody from either side is ever trimmed —
// unlike the general Full Tree View, which can hide a tiny bridged-in cluster.
// Centring the focus person on screen is handled entirely by FamilyTree's own
// pan/centre logic (it already searches the returned nodes for `rootId`), so no
// coordinate shifting is needed here.
export function computePedigreeLayout(persons, personId, collapsed = new Set()) {
  const person = persons[personId];
  if (!person) return { nodes: [], links: [], crossLinks: [], maxDepth: 0, width: 0, height: 0 };

  const { fatherRootId: fatherRoot, motherRootId: motherRoot } = getLineageRootIds(persons, personId);

  let rootIds;
  if (fatherRoot && motherRoot && fatherRoot !== motherRoot) {
    rootIds = [fatherRoot, motherRoot]; // deterministic order: father's lineage ends up left, mother's right
  } else if (fatherRoot || motherRoot) {
    rootIds = [fatherRoot || motherRoot];
  } else {
    // No recorded parents (the focus person is themself the top of a lineage) —
    // just show their own full family tree, nothing to split left/right.
    rootIds = [primaryLineageRoot(persons, personId)];
  }

  return computeForestLayout(persons, rootIds, collapsed, { excludeSatellites: false });
}

export function usePedigreeLayout(persons, personId, collapsed) {
  return useMemo(
    () => computePedigreeLayout(persons, personId, collapsed),
    [persons, personId, collapsed]
  );
}
