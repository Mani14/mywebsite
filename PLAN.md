# Plan: Family Hierarchy Web App

## TL;DR
React + Vite SPA. Classic top-down SVG family tree, unlimited depth, zoom+pan+expand/collapse navigation. Photo upload with initials-avatar fallback. Full CRUD via UI. JSON file + localStorage. Light/dark theme. Single family tree.

## Confirmed Requirements
- Visual Style: Classic top-down tree diagram
- Scale: Unlimited depth
- Siblings: Yes — show brothers/sisters in same generation row
- Fields: DOB, DOD, Alive/Passed Away, Occupation/Work, City/Location, Phone (display only)
- Profile photo: file upload in PersonForm → converted to base64 → stored in localStorage; falls back to initials avatar if no photo
- Add / Edit / Delete: Full CRUD in the UI
- Data: JSON file + localStorage for persistence
- One family tree only
- Tech: React + Vite, English, light theme
- Navigation: Scroll-to-zoom + click expand/collapse branches
- Root/Focus: User can pick any person as root via "Set as Root" in detail panel
- Deceased: Grey card + dagger symbol (†) before name + "Passed Away" badge + muted border

## Data Model (family.json)
Each person object:
- `id`: string (required)
- `firstName`, `lastName`: string (required)
- `gender`: "male" | "female" | "other" (required)
- `dob`: "YYYY-MM-DD" (optional)
- `dod`: "YYYY-MM-DD" (optional — date of death; implies isAlive = false)
- `isAlive`: boolean (default true)
- `work`: string (optional)
- `location`: string (optional)
- `phone`: string (optional, displayed as text, not a link)
- `photo`: string (optional, base64 data URL — stored in localStorage)
- `notes`: string (optional, free-text bio/memories)
- `spouseId`: string (optional)
- `marriageDate`: "YYYY-MM-DD" (optional, stored on the person with the lower id of the couple)
- `parentIds`: string[] (0-2)
- `childrenIds`: string[]

`rootPersonId`: string — initial focus; user can change via UI

## Component Architecture
```
src/
  data/family.json          — seed data (12-person, 3-gen + siblings)
  components/
    PersonCard.jsx          — compact card: photo (or initials avatar fallback), name, dates, badges
    PersonDetail.jsx        — right-side panel: all fields + relationships + CRUD
    PersonForm.jsx          — add/edit modal form
    FamilyTree.jsx          — zoomable/pannable SVG canvas
    TreeNode.jsx            — one node in the SVG (foreignObject + PersonCard + expand toggle)
    ConnectorLines.jsx      — SVG path lines between nodes
    SearchBar.jsx           — name search input; highlights matching node(s) in the tree
    MiniMap.jsx             — small SVG overview in bottom-right corner showing viewport position
    ImportExport.jsx        — buttons to download JSON file and upload/replace it
    ThemeToggle.jsx         — light/dark mode switch stored in localStorage
    BirthdayWidget.jsx      — scans all persons with DOB, shows upcoming birthdays within 30 days in a top banner
    SaveIndicator.jsx       — small transient "Saved ✓" toast shown after any localStorage write
  hooks/
    useFamily.js            — state, CRUD, localStorage sync
    useTreeLayout.js        — recursive layout algorithm (x/y per node)
  utils/
    familyUtils.js          — getParents, getChildren, getSpouse, getSiblings, buildTree
  styles/
    global.css              — CSS variables, reset, light + dark theme tokens
    PersonCard.css
    FamilyTree.css
    PersonDetail.css
    PersonForm.css
  App.jsx
  main.jsx
```

## Tree Rendering Strategy
- SVG canvas inside a div; CSS transform (scale + translate) for zoom/pan
- Mouse wheel = zoom; click-drag = pan
- Each person = HTML card inside SVG foreignObject; positioned by useTreeLayout
- Expand/collapse: +/- toggle on each node shows/hides children subtree
- Siblings in same horizontal row as person
- "Set as Root" in PersonDetail re-runs layout from that person outward

## PersonCard Design
- Photo circle: shows uploaded photo if available, else coloured initials (blue=male, rose=female, grey=other)
- Full name bold; relationship label below (Father, Spouse, etc.)
- Alive: green dot
- Deceased: grey background, muted border, † before name, "Passed Away" badge
- DOB shown; DOD shown if set
- Work, Location, Phone as small icon rows
- Click = opens PersonDetail panel

## PersonDetail Side Panel (slides in from right)
- All fields displayed (including Notes/Bio as a text block, Marriage Date if spouse set)
- Age auto-calculated: "Age: 54" for living, "Lived 72 years" for deceased
- Relationships: spouse (+ marriage date if set), parents, children, siblings — all clickable
- Edit → PersonForm modal
- Delete → confirm then remove (cleans up all references)
- "Add Child" + "Add Spouse" shortcut buttons
- "Set as Root" button

## PersonForm Modal
- All optional fields labelled "(optional)"
- Photo upload: file input → FileReader → base64 data URL → preview shown before save
- Notes/Bio: multi-line textarea
- Marriage Date: date picker (shown only when a spouse is selected)
- Spouse dropdown (select existing person)
- Parents multi-select (max 2 from existing persons)
- Validation: firstName + lastName required
- Add / Save / Cancel

## Phases

### Phase 1 — Scaffold + Data
1. Init Vite React project
2. `family.json` with 12-person, 3-gen sample (includes siblings, deceased member)
3. `familyUtils.js`: getParents, getChildren, getSpouse, getSiblings, buildTree
4. `useFamily.js`: state + CRUD + localStorage sync

### Phase 2 — Tree Layout + Canvas
5. `useTreeLayout.js`: recursive x/y layout (Reingold-Tilford style)
6. `FamilyTree.jsx`: SVG canvas, zoom/pan handlers
7. `TreeNode.jsx`: foreignObject wrapper + expand/collapse toggle
8. `ConnectorLines.jsx`: SVG curved paths parent→child

### Phase 3 — Cards + Detail + Edit
9. `PersonCard.jsx` + CSS: photo/initials avatar, age display, deceased styling
10. `PersonDetail.jsx`: side panel + relationship links + age calculation + marriage date + notes
11. `PersonForm.jsx`: add/edit modal with photo upload, notes, marriage date
12. Wire full CRUD into `useFamily.js` + relationship cleanup on delete

### Phase 4 — Search + Tools
13. `SearchBar.jsx`: filter by name, scroll/highlight matching node in tree
14. `BirthdayWidget.jsx`: scans all DOBs, banner shows "🎂 X's birthday in N days" for anyone within 30 days; dismissible per session
15. `ImportExport.jsx`: download family.json / upload to replace data
    - Import: confirmation dialog before overwriting existing tree
    - Import: JSON schema validation; reject malformed data with friendly error toast
16. `ThemeToggle.jsx`: dark/light mode, preference saved in localStorage
    - `SaveIndicator.jsx`: "Saved ✓" toast triggered by useFamily after each write

### Phase 5 — Polish
17. `global.css`: CSS vars, light + dark theme tokens, transitions
18. Empty state: "Add First Person" prompt
19. Keyboard: Escape closes panel/modal
20. Favicon + page title "Family Tree"

## Verification
1. `npm install && npm run dev` — starts with no errors
2. Sample 3-gen tree with siblings renders on load
3. Scroll to zoom, drag to pan works
4. Expand/collapse toggle shows/hides children
5. Clicking a card opens detail panel
6. "Set as Root" re-centres tree
7. Edit persists after page refresh (localStorage)
8. Add child re-renders in tree
9. Delete cleans up all relationship refs
10. Deceased person shows grey + † + badge

## Scope Boundaries (Version 1 — Local)
**Included:** unlimited depth, siblings, zoom+pan, expand/collapse, full CRUD, photo upload (base64), initials avatar fallback, deceased styling, re-root, search/highlight, age calculation, marriage date, notes/bio, import/export JSON (with confirm + validation), mini-map, dark mode, upcoming birthdays widget, auto-save indicator

**Excluded from V1:** server-side storage, authentication, multiple trees, print/PNG export, touch gestures, relationship path finder

## Roadmap

### Version 1 — Local App (current plan)
- Runs entirely in the browser; data in localStorage
- Single user on a single device
- Sharing only via manual JSON export/import
- All 20 tasks / 5 phases above

### Version 2 — Cloud / Shared (future)
Goal: share the app so relatives can update their own family details online.
Requires adding a backend — the localStorage layer is swapped for API calls.
- **Auth:** Google OAuth (sign in with Google); anyone signed in can edit
- **Backend:** REST API (e.g. Node/Express or Azure Functions) exposing CRUD for persons
- **Database:** hosted store (e.g. Azure SQL / Cosmos DB / Postgres) as the single shared source of truth
- **Photo storage:** move base64 → blob/object storage (e.g. Azure Blob Storage) to keep the DB small
- **Hosting:** Azure Static Web Apps (frontend) + Azure Functions (API) + database
- **Concurrency:** last-write-wins initially; consider edit history / audit log later
- **Migration:** V1's `useFamily` hook is written to isolate storage, so V2 only replaces the storage functions (localStorage → fetch/API) — the UI components stay the same

**Design note for V1:** keep all persistence inside `useFamily.js` (no component reads/writes localStorage directly). This makes the V2 swap to a cloud API a change in one file, not the whole app.
