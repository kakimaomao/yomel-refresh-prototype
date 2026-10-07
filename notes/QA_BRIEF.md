# QA / correction pass — re-verify against current Figma state

## Why
The designer (kaki_mao) reviewed the built prototype and reported two things:
1. **Many spacings and button/icon sizes look off** across the screens — the
   first extraction pass (done by a different agent batch) was not precise
   enough about exact pixel values.
2. **They have since edited the Figma file**: several back-button icons were
   changed to menu/hamburger icons. Confirmed example: node `5270:86019`
   (`upload-pending-select-mode.html`) — though when re-checked, that specific
   header still shows a back-chevron icon (`M20.6667 24L12.6667 16L20.6667 8`,
   a plain "<" path), so the actual changed screen(s) may be elsewhere in your
   assigned set, or a different element within your screens. **Don't assume
   anything is unchanged** — re-pull fresh and look carefully.

## Your task
For EACH node id you were originally assigned (same list as before, given
below per group), do a full re-verification:

1. Re-fetch `mcp__figma-dev-mode__get_design_context` fresh for that node
   (don't rely on memory from the earlier session — the file may have changed).
   If the response says content is too large / sparse metadata, drill into
   the specific sub-frame (e.g. the header) to get full code for that part.
2. Read your own previously-built fragment at
   `/Users/kaki/Desktop/YomelRefreshProto/screens/<slug>.html`.
3. **Cross-check every measurement precisely** — the Tailwind arbitrary-value
   classes in the fresh Figma code (`top-[Npx]`, `left-[Npx]`, `w-[Npx]`,
   `h-[Npx]`, `gap-[Npx]`, `px-[Npx]`/`py-[Npx]`, `text-[Npx]`, `rounded-[Npx]`)
   give you the EXACT numbers. Compare them one by one against what's in your
   fragment's `<style>` block. Fix every mismatch you find — don't eyeball it,
   read the actual numbers from both sides.
4. **Check every icon/button for a shape change**, not just by component name
   (names can stay the same after a swap). For any header/nav icon, download
   the current asset's SVG from its Figma localhost URL and look at the raw
   path data:
   - A back chevron looks like a simple two-segment angle path (e.g.
     `M20.6667 24L12.6667 16L20.6667 8` — a "<" shape).
   - A hamburger/menu icon has three parallel horizontal lines.
   - A close/X icon has two crossing diagonal lines.
   If the current Figma icon's path shape differs from what your fragment
   currently uses, **replace the icon asset** (download the new one to
   `../assets/` with a descriptive name) **and update the `data-tap`**
   accordingly:
   - back-chevron → `data-tap="back"`
   - hamburger/menu → `data-tap="open:side-menu"` (opens the app's side
     drawer — same target used elsewhere in the prototype)
   - close/X → `data-tap="close:<something>"` or `data-tap="back"` depending
     on context (use judgment, note your reasoning)
   Report every such change clearly — this affects navigation wiring that's
   centrally maintained in `/Users/kaki/Desktop/YomelRefreshProto/app.js`, so
   the person integrating your fixes needs to know exactly which screens'
   header icon changed and to what.
5. Also re-check text content, colors (hex values), and font-weight against
   the fresh pull — fix anything that drifted.
6. Fix the fragment file in place. Keep the existing `id="scr-<slug>"` /
   `class="board"` contract and `data-tap` conventions from
   `/Users/kaki/Desktop/YomelRefreshProto/notes/AGENT_BRIEF.md` (still the
   governing contract for structure — this QA_BRIEF only adds the
   verification/correction task on top of it).

## Output
For each node id, after fixing: note in your final reply a short diff-style
summary per screen — "slug: fixed X (was Ypx now Zpx), fixed header icon
back→menu(open:side-menu), ..." or "slug: no changes needed, verified clean".
Be specific with numbers so the integration step can trust your report
without re-deriving it.

## Your group's node ids
(given in the dispatch message — same assignment as the original build)
