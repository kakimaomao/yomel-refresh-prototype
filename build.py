import json, re, pathlib

ROOT = pathlib.Path(__file__).parent
SCREENS = ROOT / "screens"

GROUPS = [
    ("ログイン", ["login-space-id-empty","login-space-id-keyboard","login-space-id-filled","login-space-id-error","login-space-confirm"]),
    ("録音ホーム", ["recording-home-full","recording-home-offline-only","recording-home-long-group","recording-home-import-sheet","recording-home-side-menu"]),
    ("録音中", ["recording-active","recording-paused-transcript","recording-paused-transcript-scrolled","recording-paused-loginfo","recording-paused-loginfo-scrolled","recording-offline-active","recording-offline-paused"]),
    ("録音後の情報編集", ["metadata-edit","metadata-group-picker","metadata-status-picker","metadata-tag-picker-2","metadata-tag-picker-4"]),
    ("アップロード待ち", ["upload-pending-empty","upload-pending-list","upload-pending-row-player","upload-pending-select-mode","upload-pending-row-actions-sheet","upload-pending-edit-info-sheet","upload-pending-delete-confirm"]),
    ("設定・その他", ["settings-general","settings-email-overflow","license-list"]),
]

# load titles + figma node ids from all manifests
titles = {}
nodeids = {}
for mf in (ROOT / "notes").glob("manifest-*.json"):
    data = json.loads(mf.read_text())
    for entry in data:
        titles[entry["slug"]] = entry.get("title", entry["slug"])
        nodeids[entry["slug"]] = entry.get("figmaNodeId", "")

all_slugs = [s for _, slugs in GROUPS for s in slugs]
assert len(all_slugs) == 32, f"expected 32 screens, got {len(all_slugs)}"
assert len(set(all_slugs)) == 32, "duplicate slug in GROUPS"

fragment_files = sorted(p.stem for p in SCREENS.glob("*.html"))
assert set(fragment_files) == set(all_slugs), f"mismatch:\nmissing={set(all_slugs)-set(fragment_files)}\nextra={set(fragment_files)-set(all_slugs)}"

# ---- build board fragments (rewrite ../assets/ -> assets/) ----
boards = []
for slug in all_slugs:
    html = (SCREENS / f"{slug}.html").read_text()
    html = html.replace("../assets/", "assets/")
    boards.append(html)
boards_html = "\n".join(boards)

# ---- build screen index drawer ----
idx_parts = []
for group_name, slugs in GROUPS:
    idx_parts.append(f'<div class="grp-title">{group_name}</div>')
    for slug in slugs:
        title = titles.get(slug, slug)
        nid = nodeids.get(slug, "")
        idx_parts.append(
            f'<div class="idx-row" data-slug="{slug}"><span>{title}</span><span class="fig">{nid}</span></div>'
        )
idx_html = "\n".join(idx_parts)

base_css = (ROOT / "base.css").read_text()
shell_css = (ROOT / "shell.css").read_text()
app_js = (ROOT / "app.js").read_text()

body = f"""<div id="stageOuter">
<div id="app">
  <div class="hint">タップして進む ／ 右上ボタンで全画面一覧</div>
  <div id="phoneFrame">
    <div id="stack">
{boards_html}
      <div id="toastEl"></div>
    </div>
  </div>
  <button id="indexBtn" title="全画面一覧">⋮⋮</button>
</div>
</div>

<div id="indexOverlay">
  <div id="indexPanel">
    <h2>全画面一覧（{len(all_slugs)}）</h2>
{idx_html}
    <button id="indexClose">閉じる</button>
  </div>
</div>

<script>
{app_js}
</script>
"""

standalone = f"""<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<title>YOMEL UI刷新 プロトタイプ</title>
<style>
{base_css}
{shell_css}
</style>
</head>
<body>
{body}
</body>
</html>
"""

fragment = f"""<title>YOMEL UI刷新</title>
<style>
{base_css}
{shell_css}
</style>
{body}
"""

(ROOT / "index.html").write_text(standalone)
(ROOT / "artifact.html").write_text(fragment)
print("wrote index.html", len(standalone), "bytes")
print("wrote artifact.html", len(fragment), "bytes")
