# YOMEL UI-refresh click-through prototype — screen extraction brief

## Context
YOMEL is an iOS meeting-recording app. The designer (kaki_mao) refreshed a large
part of the app's visual style in Figma and wants it turned into a tappable,
click-through HTML prototype (screenshots-free — we rebuild each screen in real
HTML/CSS from the Figma dev-mode data, not as flat images). This is explicitly
a **lightweight** prototype: visual fidelity should be close but does not need
to be pixel-perfect, and we are NOT wiring real input logic (no real forms,
no real audio) — just believable tap-through navigation between static states.

Figma file key: `XJ9JGrf3zyR7v48PxxjBTc` (file "WIP SP-YOMEL").
Section node: `5270:77473` ("【作業中】マオマオ") — this is the whole working area;
you only need your assigned child node IDs below, not the whole section.

## Tools
The Figma Dev Mode MCP tools are deferred in a fresh session — load them first:
`ToolSearch({query: "select:mcp__figma-dev-mode__get_design_context,mcp__figma-dev-mode__get_metadata,mcp__figma-dev-mode__get_screenshot", max_results: 5})`

For each assigned node id, call:
`mcp__figma-dev-mode__get_design_context({nodeId: "<id>", clientLanguages: "html,css,javascript", clientFrameworks: "none", artifactType: "WEB_PAGE_OR_APP_SCREEN", taskType: "CREATE_ARTIFACT"})`
This returns React+Tailwind reference code, a screenshot image, and asset URLs
(`http://localhost:3845/assets/<hash>.svg|png`). **Ignore the React/Tailwind
syntax** — you are writing plain HTML + CSS, not JSX. Use the screenshot to
verify what you build actually matches.

## Design tokens (already confirmed from this design system — reuse, don't re-derive)
- Primary green `#16c098`, main text `#1f2329`, secondary text `#646a73`,
  faint text `#8f959e`, placeholder `#bbbfc4`, hairline border `#dee0e3`,
  weak bg `#f8f9fa` / `#f4f4f4`.
- Font: Hiragino Kaku Gothic ProN / Hiragino Sans. Body text weight is **W3
  (CSS weight 300)**, headings/buttons W6 (600). (iOS has no "Hiragino Kaku
  Gothic ProN" and falls back to Hiragino Sans — explicit 300 avoids text
  looking too bold.)
- Board size 430×932 (iPhone). Status bar 51px tall, home indicator 21px tall.
- Common radii: cards/sections 12px, inputs/buttons 8px, chips 4px.
- A shared stylesheet already exists at `../base.css` (relative to your
  fragment files) with ready classes: `.board`, `.statusbar`, `.home-indicator`,
  `.navbar`, `.btn` / `.btn-primary` / `.btn-disabled`, `.field`, `.chip`,
  `.row`. **Read it** (`/Users/kaki/Desktop/YomelRefreshProto/base.css`)
  before writing CSS so you reuse instead of duplicating.
- Copy the status-bar / home-indicator markup verbatim from
  `/Users/kaki/Desktop/YomelRefreshProto/notes/snippets.html` — don't
  rebuild those from the Figma code, they're identical on every screen.

## Output contract — for EACH assigned node id, produce:

1. **`/Users/kaki/Desktop/YomelRefreshProto/screens/<slug>.html`**
   A single self-contained fragment (NOT a full HTML document — no
   `<html>/<head>/<body>`), structured as:
   ```html
   <section class="board" id="scr-<slug>">
     <style>
       /* styles scoped under #scr-<slug> — bespoke to this screen only.
          Reuse base.css classes for anything generic (buttons, fields, rows). */
       #scr-<slug> .foo { ... }
     </style>
     <!-- paste statusbar + home-indicator snippet -->
     <!-- real screen content, plain div/p/img, no React/JSX/Tailwind -->
   </section>
   ```
   Pick `<slug>` yourself: short, kebab-case, English, based on the screen's
   actual content/purpose (e.g. `login-space-id`, `recording-active`,
   `tag-edit-sheet`). Figma's internal layer names (often generic like "home"
   or "Frame 1000001927") are NOT reliable — name it for what it visually is.

   Mark every tappable element with a `data-tap="<intent>"` attribute, e.g.
   `data-tap="back"`, `data-tap="go:next-step"`, `data-tap="open:tag-sheet"`,
   `data-tap="toggle:checkbox-foo"`. You're describing INTENT in plain words;
   exact routing between screens will be wired centrally afterward, so it's
   fine if the intent string isn't an exact slug — just be clear and short.
   Cover: back/close icons, primary buttons, list rows, tabs, nav icons,
   FABs, chips, checkboxes/toggles, anything that looks interactive in the
   screenshot.

   For any **new** image/icon asset referenced in the Figma code that isn't
   already in `/Users/kaki/Desktop/YomelRefreshProto/assets/` (check with
   `ls` first, and reuse an existing file by relative path `../assets/<name>`
   if it's visually the same icon — e.g. the status bar / yomel logo /
   background wave assets are already downloaded, don't redownload them):
   `curl -s -o ../assets/<descriptive-kebab-name>.svg "http://localhost:3845/assets/<hash>.svg"`
   then verify the file is non-empty and starts with `<svg` (or valid PNG
   header for .png) before referencing it. Use a descriptive name, not the
   hash.

2. One entry appended to a JSON array you maintain at
   **`/Users/kaki/Desktop/YomelRefreshProto/notes/manifest-<yourgroup>.json`**
   (create it once per your batch, a JSON array of objects — don't touch
   other groups' manifest files, to avoid write collisions):
   ```json
   {
     "slug": "login-space-id",
     "figmaNodeId": "5270:80580",
     "title": "スペースIDでログイン",
     "fragmentFile": "screens/login-space-id.html",
     "description": "1-2 sentences: what this screen is / where it sits in the flow",
     "tapTargets": [
       {"dataTap": "go:next-step", "label": "次へ button", "guessedTarget": "probably goes to password/SSO screen or home after space id entered"}
     ],
     "notes": "anything ambiguous, inconsistent with sibling screens, or that you had to guess"
   }
   ```

## Quality bar
- Priority order: correct structure & real tap targets > visual polish.
  Close color/spacing/typography match is good; don't burn time pixel-chasing.
  Do NOT invent screens, features, or content that aren't in the Figma file.
- Keep each fragment's bespoke CSS scoped under its own `#scr-<slug>` id so
  31 screens' styles never collide when concatenated into one page later.
- When several node ids you're assigned are clearly state-variants of the
  *same* screen (e.g. a "scrolled" or "offline" variant), still produce a
  separate fragment per node id (don't merge them yourself) — centralized
  assembly will decide whether to merge into CSS-toggled states or keep as
  separate screens. Just note the relationship in your manifest's `notes`.

## When done
Reply with the list of slugs you created and a one-line note of anything
that blocked you (missing asset, confusing design, etc).
