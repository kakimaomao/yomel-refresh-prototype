/* YOMEL refresh click-through prototype — router & interaction layer. */
(function(){
  "use strict";

  var PARENT = {
    "login-space-id-keyboard": "login-space-id-empty",
    "login-space-id-filled": "login-space-id-keyboard",
    "login-space-id-error": "login-space-id-filled",
    "login-space-confirm": "login-space-id-filled",
    "recording-home-full": "login-space-confirm",
    "recording-home-offline-only": "recording-home-full",
    "recording-home-long-group": "recording-home-full",
    "recording-home-import-sheet": "recording-home-side-menu",
    "recording-home-side-menu": "recording-home-full",
    "recording-active": "recording-home-full",
    "recording-paused-transcript": "recording-active",
    "recording-paused-transcript-scrolled": "recording-paused-transcript",
    "recording-paused-loginfo": "recording-paused-transcript",
    "recording-paused-loginfo-scrolled": "recording-paused-loginfo",
    "recording-offline-active": "recording-home-full",
    "recording-offline-paused": "recording-offline-active",
    "metadata-edit": "recording-active",
    "metadata-group-picker": "metadata-edit",
    "metadata-status-picker": "metadata-edit",
    "metadata-tag-picker-2": "metadata-edit",
    "metadata-tag-picker-4": "metadata-tag-picker-2",
    "upload-pending-empty": "recording-home-side-menu",
    "upload-pending-list": "recording-home-side-menu",
    "upload-pending-row-player": "upload-pending-list",
    "upload-pending-select-mode": "upload-pending-list",
    "upload-pending-row-actions-sheet": "upload-pending-list",
    "upload-pending-edit-info-sheet": "upload-pending-row-actions-sheet",
    "upload-pending-delete-confirm": "upload-pending-list",
    "settings-general": "recording-home-side-menu",
    "settings-email-overflow": "recording-home-side-menu",
    "license-list": "settings-general"
  };

  var ROOT = "login-space-id-empty";
  var stack = [{slug: ROOT, type: null}];

  function el(slug){ return document.getElementById("scr-" + slug); }
  function currentSlug(){ return stack[stack.length - 1].slug; }

  function clearAnim(node){
    if(!node) return;
    // if an earlier animateCardsHeight() batch is still mid-flight on this
    // node, cancelling its WAAPI animation below makes that batch's own
    // `anim.finished` promise reject — which means the cleanup it deferred
    // to "once finished" (removing a collapsing card's player content for
    // real, resetting inline height/overflow) would otherwise never run.
    // Run it now, synchronously, before anything new touches this node.
    if(node._pendingCardCleanup){
      var cleanup = node._pendingCardCleanup;
      node._pendingCardCleanup = null;
      cleanup();
    }
    node.getAnimations().forEach(function(a){ a.cancel(); });
    node.style.transform = ""; node.style.filter = ""; node.style.opacity = "";
  }

  function animate(node, kf, opts){
    return node.animate(kf, Object.assign({duration: 320, easing: "cubic-bezier(.22,.61,.36,1)", fill: "forwards"}, opts || {})).finished;
  }

  // modal/modal-left screens contain ONLY a scrim + this inner element (the
  // sheet/drawer itself) — no baked copy of the screen behind them. The real
  // screen underneath is left visible and untouched; only this inner element
  // animates in/out, so the "background" never gets its own animation.
  function overlayInner(boardEl){
    return boardEl && boardEl.querySelector(".sheet, .drawer, .edit-sheet");
  }

  // for a screen-index jump straight to an overlay screen, the real screen it
  // was designed to sit over (shown underneath it, since the overlay no
  // longer carries its own baked copy).
  var OVERLAY_BASE = {
    "metadata-group-picker": "metadata-edit",
    "metadata-status-picker": "metadata-edit",
    "metadata-tag-picker-2": "metadata-edit",
    "metadata-tag-picker-4": "metadata-edit",
    "recording-home-import-sheet": "recording-home-full",
    "recording-home-side-menu": "recording-home-full",
    "upload-pending-row-actions-sheet": "upload-pending-list",
    "upload-pending-edit-info-sheet": "upload-pending-list",
    "upload-pending-delete-confirm": "upload-pending-list"
  };

  // the side drawer highlights whichever item matches where it was opened
  // from (e.g. opened from アップロード待ち → that row is highlighted, not
  // the hardcoded 録音 row). Figma ref: node 5285:164583.
  function setDrawerSection(section){
    var drawer = document.querySelector("#scr-recording-home-side-menu .drawer");
    if(!drawer) return;
    var items = drawer.querySelectorAll(".drawer-item, .drawer-settings");
    for(var i = 0; i < items.length; i++){ items[i].classList.remove("active"); }
    var SECTION_SELECTOR = {
      recording: '[data-tap="go:recording-home"]',
      upload: '[data-tap="go:upload-queue"]',
      settings: '.drawer-settings'
    };
    var target = SECTION_SELECTOR[section] && drawer.querySelector(SECTION_SELECTOR[section]);
    if(target) target.classList.add("active");
  }

  // the mic FAB checks the オフラインモード toggle's live state at tap time,
  // not a fixed destination — Figma ref: offline recording is 5270:78731.
  function startRecording(node){
    var board = node.closest(".board");
    var toggle = board && board.querySelector('[data-tap="toggle:offline-mode"]');
    var offline = toggle && toggle.classList.contains("on");
    resetRecordingClock();
    // a brand-new recording has no transcript yet — the baked-in mock
    // bubbles exist only so jumping straight to these boards from the
    // screen-index drawer has something to look at; a real "start" should
    // begin empty and let appendLiveBubble() build it up from scratch.
    clearLiveBubbles("recording-active");
    clearLiveBubbles("recording-paused-transcript");
    liveLineIndex = 0;
    transcriptEverScrolled = false;
    isFollowingLatest = true;
    goTo(offline ? "recording-offline-active" : "recording-active", "push");
  }

  function clearLiveBubbles(slug){
    var content = document.querySelector("#scr-" + slug + " .content");
    if(!content) return;
    content.querySelectorAll(".bubble").forEach(function(b){ b.remove(); });
  }

  // recording-paused-transcript is a separate DOM board with its own
  // originally-static mock bubbles — without this, pausing a freshly
  // started (and therefore still-empty or barely-started) recording would
  // jump to a screen still showing its old, unrelated 20-bubble mock
  // transcript. Keep it in sync with whatever recording-active actually has.
  function syncPausedTranscriptBubbles(){
    var fromContent = document.querySelector("#scr-recording-active .content");
    var toContent = document.querySelector("#scr-recording-paused-transcript .content");
    if(!fromContent || !toContent) return;
    var toFab = toContent.querySelector(".scroll-to-bottom");
    toContent.querySelectorAll(".bubble").forEach(function(b){ b.remove(); });
    fromContent.querySelectorAll(".bubble").forEach(function(b){
      var clone = b.cloneNode(true);
      clone.classList.remove("bubble-enter", "bubble-enter-active");
      if(toFab) toContent.insertBefore(clone, toFab); else toContent.appendChild(clone);
    });
  }

  // ---- simulated "live recording" feedback (no real mic/audio access) ----
  // a single shared clock drives every ".time-value" display across all 5
  // recording-related boards (mini timer on the online ones, big-timer on
  // the offline ones) so switching tabs/screens never shows two different
  // elapsed times for what is conceptually the same recording.
  var recordingStartTimestamp = null;
  var recordingElapsedBeforePause = 0;
  var recordingTimerInterval = null;
  function formatElapsed(totalSeconds){
    var m = Math.floor(totalSeconds / 60), s = totalSeconds % 60;
    return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }
  function updateAllTimerDisplays(){
    var running = recordingStartTimestamp ? Math.floor((Date.now() - recordingStartTimestamp) / 1000) : 0;
    var text = formatElapsed(recordingElapsedBeforePause + running);
    document.querySelectorAll(".time-value").forEach(function(el){ el.textContent = text; });
  }
  function startRecordingClock(){
    if(recordingStartTimestamp) return; // already running, no-op
    recordingStartTimestamp = Date.now();
    if(!recordingTimerInterval) recordingTimerInterval = setInterval(updateAllTimerDisplays, 1000);
  }
  function pauseRecordingClock(){
    if(recordingStartTimestamp){
      recordingElapsedBeforePause += Math.floor((Date.now() - recordingStartTimestamp) / 1000);
      recordingStartTimestamp = null;
    }
    if(recordingTimerInterval){ clearInterval(recordingTimerInterval); recordingTimerInterval = null; }
  }
  function resetRecordingClock(){
    recordingElapsedBeforePause = 0;
    recordingStartTimestamp = null;
    if(recordingTimerInterval){ clearInterval(recordingTimerInterval); recordingTimerInterval = null; }
    updateAllTimerDisplays();
  }

  // オフラインは録音後にしか文字起こししない仕様なので、ライブで吹き出しが
  // 増えていくのは recording-active（オンライン・録音中）だけでよい。
  var MOCK_LIVE_LINES = [
    "それでは次のトピックに移りたいと思います。",
    "承知しました、よろしくお願いします。",
    "そちらの件は後ほど資料を共有しますね。",
    "ありがとうございます、助かります。",
    "では認識齟齬がないか一度確認させてください。",
    "はい、問題ないと思います。",
    "では本日はここまでにしましょう。",
    "お疲れ様でした、ありがとうございました。"
  ];
  var liveLineIndex = 0;
  var transcriptAppendInterval = null;
  // whether newly-arriving bubbles should auto-scroll the view down to stay
  // visible. This can't just be "is scrollTop currently near the bottom" —
  // a fresh recording starts at scrollTop 0, and stays at 0 as content grows
  // past one screenful purely because nothing has scrolled it yet; reading
  // raw distance-from-bottom at that point would wrongly read as "the user
  // scrolled away" the instant it first overflows. Track actual user intent
  // instead: any real touch/wheel on the transcript means "stop following",
  // and either tapping the FAB or manually scrolling back near the bottom
  // means "resume following".
  var isFollowingLatest = true;
  function appendLiveBubble(){
    var root = document.getElementById("scr-recording-active");
    if(!root || getComputedStyle(root).display === "none") return;
    var content = root.querySelector(".content");
    if(!content) return;
    var bubble = document.createElement("div");
    bubble.className = "bubble bubble-enter";
    bubble.textContent = MOCK_LIVE_LINES[liveLineIndex % MOCK_LIVE_LINES.length];
    liveLineIndex++;
    content.appendChild(bubble);
    requestAnimationFrame(function(){ bubble.classList.add("bubble-enter-active"); });
    if(isFollowingLatest) content.scrollTop = content.scrollHeight;
  }
  function startLiveTranscript(){
    if(transcriptAppendInterval) return;
    appendLiveBubble();
    transcriptAppendInterval = setInterval(appendLiveBubble, 2000);
  }
  function stopLiveTranscript(){
    if(transcriptAppendInterval){ clearInterval(transcriptAppendInterval); transcriptAppendInterval = null; }
  }
  function startActiveRecordingEffects(){ startRecordingClock(); startLiveTranscript(); }
  function stopActiveRecordingEffects(){ pauseRecordingClock(); stopLiveTranscript(); }

  // Every z-index this app ever hands out comes from this single, forever-
  // increasing counter (see nextZ()) instead of small fixed numbers like
  // 1/2/3. A stray board left `display:block` from an earlier, unrelated
  // transition (overlays deliberately leave their "from" screen visible —
  // see present()'s keepFromVisible) used to be able to tie in z-index with
  // boards in a *later* transition, and CSS then breaks that tie by DOM
  // source order — which could put the stale board on top and make it flash
  // visible for a frame. Strictly-increasing z-indexes make that tie
  // structurally impossible: anything from an earlier transition always
  // sorts below anything from a later one.
  var zCounter = 10;
  function nextZ(){ return ++zCounter; }

  function present(fromSlug, toSlug, type, reverse){
    var fromEl = el(fromSlug), toEl = el(toSlug);
    if(!fromEl || !toEl) return Promise.resolve();
    clearAnim(fromEl); clearAnim(toEl);
    clearAnim(overlayInner(fromEl)); clearAnim(overlayInner(toEl));
    toEl.style.display = "block";

    var isOverlay = (type === "modal" || type === "modal-left" || type === "alert");
    var zBack = nextZ(), zFront = nextZ();
    if(isOverlay){
      if(reverse){ fromEl.style.zIndex = zFront; toEl.style.zIndex = zBack; }
      else { fromEl.style.zIndex = zBack; toEl.style.zIndex = zFront; }
    } else {
      toEl.style.zIndex = zFront; fromEl.style.zIndex = zBack;
    }

    var p;
    if(type === "push"){
      p = reverse
        ? Promise.all([
            animate(toEl, [{transform:"translateX(-22%) scale(.96)", filter:"brightness(.85)"}, {transform:"translateX(0) scale(1)", filter:"brightness(1)"}]),
            animate(fromEl, [{transform:"translateX(0)"}, {transform:"translateX(100%)"}])
          ])
        : Promise.all([
            animate(toEl, [{transform:"translateX(100%)"}, {transform:"translateX(0)"}]),
            animate(fromEl, [{transform:"translateX(0) scale(1)", filter:"brightness(1)"}, {transform:"translateX(-22%) scale(.96)", filter:"brightness(.85)"}])
          ]);
    } else if(type === "modal"){
      // only the sheet itself rises/falls — the scrim appears instantly (no
      // transition) and the real screen behind stays static throughout.
      var innerM = overlayInner(reverse ? fromEl : toEl) || (reverse ? fromEl : toEl);
      p = reverse
        ? animate(innerM, [{transform:"translateY(0)"}, {transform:"translateY(100%)"}])
        : animate(innerM, [{transform:"translateY(100%)"}, {transform:"translateY(0)"}]);
    } else if(type === "modal-left"){
      var innerL = overlayInner(reverse ? fromEl : toEl) || (reverse ? fromEl : toEl);
      p = reverse
        ? animate(innerL, [{transform:"translateX(0)"}, {transform:"translateX(-100%)"}])
        : animate(innerL, [{transform:"translateX(-100%)"}, {transform:"translateX(0)"}]);
    } else if(type === "cut"){
      // instant swap: no fade, no horizontal shift — used where the content
      // itself already communicates the state change (e.g. space-ID verified
      // successfully) and any transition would just feel like unneeded motion.
      p = Promise.resolve();
    } else if(type === "alert"){
      // centered dialog over a darkened scrim: the whole overlay board (scrim
      // + dialog together) simply fades in/out, same keepFromVisible overlay
      // semantics as modal/modal-left so the real screen stays visible (and
      // darkened by the scrim) underneath instead of being hidden.
      p = reverse
        ? animate(fromEl, [{opacity:1}, {opacity:0}], {duration:160})
        : animate(toEl, [{opacity:0}, {opacity:1}], {duration:160});
    } else { // fade
      p = animate(toEl, [{opacity:0}, {opacity:1}], {duration:180});
    }
    return p.then(function(){
      var keepFromVisible = isOverlay && !reverse;
      if(!keepFromVisible){
        fromEl.style.display = "none";
        clearAnim(fromEl);
      }
      clearAnim(toEl);
    });
  }

  function goTo(slug, type){
    type = type || "push";
    var fromSlug = currentSlug();
    if(fromSlug === slug || !el(slug)) return;
    stack.push({slug: slug, type: type});
    present(fromSlug, slug, type, false);
    onScreenShown(slug);
  }

  // per-slug layout that depends on the board's actual rendered width/content
  // (not knowable until it's display:block) — called from every place that
  // can make a screen the active one.
  function onScreenShown(slug){
    if(slug === "settings-general" || slug === "settings-email-overflow") initEmailRowLayout(slug);
    if(slug === "upload-pending-row-player") expandRowPlayer(expandedRec);
    if(slug === "recording-paused-transcript" || slug === "recording-paused-loginfo") syncStaticTitle(slug);
    if(slug === "recording-paused-loginfo") syncLoginfoTabLabel(loginfoReturnSlug);
    if(slug === "metadata-edit") syncMetadataEditTitle();
    if(slug === "recording-active" || slug === "recording-offline-active" || slug === "recording-offline-paused") syncEditableTitle(slug);
    if(slug === "recording-paused-transcript") syncPausedTranscriptBubbles();
    if(slug === "recording-active" || slug === "recording-paused-transcript") ensureTranscriptDefaultScroll(slug);
    if(slug === "recording-active" || slug === "recording-paused-transcript" || slug === "recording-paused-loginfo") applyHeaderProgress(slug);
    if(slug === "recording-active" || slug === "recording-offline-active") startActiveRecordingEffects();
    if(slug === "recording-paused-transcript" || slug === "recording-offline-paused") stopActiveRecordingEffects();
    if(slug === "metadata-group-picker"){
      if(openedGroupPickerForRec1Retry) clearGroupPickerSelection();
      else selectPickerItem("#scr-metadata-group-picker", currentGroupKey);
    }
  }

  // upload-pending-row-player: only one row is ever expanded at a time, so a
  // single <template> is physically moved into whichever card's .player-slot
  // is active rather than every card carrying its own copy.
  var expandedRec = 1;

  // measures what a card's height WOULD be once collapsed, without ever
  // touching the live card — scrollHeight reports full content size
  // regardless of overflow:hidden, so the only way to read "collapsed
  // height" is on something that actually has the expanded class/content
  // removed. Doing that on the live card first (then restoring it to
  // animate) meant the restore had to land perfectly invisibly or the
  // content would visibly flicker; measuring on a detached clone instead
  // means the live, on-screen card is never touched until the animation
  // genuinely starts, so there's nothing to flicker.
  function measureCollapsedHeight(card){
    var rect = card.getBoundingClientRect();
    var clone = card.cloneNode(true);
    clone.classList.remove("rec-card--expanded");
    var slot = clone.querySelector(".player-slot");
    if(slot) slot.innerHTML = "";
    clone.style.position = "absolute";
    clone.style.visibility = "hidden";
    clone.style.pointerEvents = "none";
    clone.style.height = "auto";
    clone.style.width = rect.width + "px";
    card.parentNode.appendChild(clone);
    var h = clone.scrollHeight;
    card.parentNode.removeChild(clone);
    return h;
  }

  // animates every changed card's height from its current height to its new
  // natural height together — since height is a real layout property (not a
  // compositor transform), every sibling below reflows in sync each frame,
  // which is what makes the rest of the list visibly slide down/up as cards
  // grow/shrink, not just the cards themselves resizing. All changed cards
  // are batched through one read/write/read/write pass (rather than
  // animated one at a time) so every animation is constructed and started
  // in the exact same tick.
  //
  // A collapsing card keeps its class and player content completely
  // untouched until the animation finishes — it just gets its height pinned
  // and overflow:hidden, so the still-present content is progressively
  // clipped away by the shrinking box (the expand's reveal, in reverse).
  // The actual class/content removal only happens once collapsed, in the
  // cleanup below — never mid-animation — so there's no moment where the
  // content is gone but the card hasn't shrunk yet.
  function animateCardsHeight(changes){
    changes.forEach(function(c){
      clearAnim(c.card);
      c.fromH = c.card.getBoundingClientRect().height;
      if(!c.expanding) c.toH = measureCollapsedHeight(c.card);
    });
    changes.forEach(function(c){
      if(c.expanding){ c.mutateClass(); c.insertContent(); }
      c.card.style.height = c.fromH + "px";
      c.card.style.overflow = "hidden";
    });
    changes.forEach(function(c){ void c.card.offsetHeight; });
    changes.forEach(function(c){ if(c.expanding) c.toH = c.card.scrollHeight; });
    changes.forEach(function(c){
      var anim = c.card.animate(
        [{height: c.fromH + "px"}, {height: c.toH + "px"}],
        {duration: 280, easing: "cubic-bezier(.22,.61,.36,1)"}
      );
      // registered on the card so clearAnim() can run this early (and only
      // once — see clearAnim) if a later call retargets this same card
      // before this animation gets to finish on its own.
      var cleanup = function(){
        c.card.style.height = "";
        c.card.style.overflow = "";
        if(!c.expanding){ c.mutateClass(); c.removeContent(); }
      };
      c.card._pendingCardCleanup = cleanup;
      anim.finished.then(function(){
        if(c.card._pendingCardCleanup === cleanup) c.card._pendingCardCleanup = null;
        cleanup();
      }, function(){});
    });
  }

  // simulated playback for whichever row's inline player is expanded — one
  // shared state object is enough since only one row is ever expanded at a
  // time (same reasoning as the single <template> itself). A freshly-expanded
  // row always starts at 0 elapsed, with the total taken from that
  // recording's own real duration (MOCK_RECORDINGS, "MM:SS") rather than a
  // single fixed value shared by every row.
  var playerState = {playing: false, elapsedSec: 0, totalSec: 0, timer: null};
  function formatPlayerTime(sec){
    sec = Math.max(0, Math.round(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }
  function parseDurationToSec(str){
    var parts = (str || "").split(":").map(Number);
    if(parts.length < 2 || parts.some(isNaN)) return 0;
    return parts[0] * 60 + parts[1];
  }
  function updatePlayerUI(){
    var root = document.getElementById("scr-upload-pending-row-player");
    // scoped to the specific expanding card (not just "whichever matches
    // first in the board") — a collapsing card's old player content is only
    // removed once its own animation finishes, so right after switching rows
    // both the old and new card can briefly coexist in the DOM, and the old
    // one sorts first in document order for rec-1..rec-3.
    var card = root && recCard(root, expandedRec);
    var fill = card && card.querySelector(".player-fill");
    if(!fill) return;
    var times = card.querySelectorAll(".player-times span");
    var btn = card.querySelector('[data-tap="toggle:play:current"]');
    var pct = playerState.totalSec > 0 ? Math.min(1, playerState.elapsedSec / playerState.totalSec) : 0;
    fill.style.width = (pct * 100) + "%";
    if(times[0]) times[0].textContent = formatPlayerTime(playerState.elapsedSec);
    if(times[1]) times[1].textContent = formatPlayerTime(playerState.totalSec - playerState.elapsedSec);
    if(btn){
      btn.src = "assets/" + (playerState.playing ? "icon-pause-button-circle.svg" : "play-button-circle.svg");
      btn.alt = playerState.playing ? "一時停止" : "再生";
    }
  }
  function pausePlayer(){
    playerState.playing = false;
    if(playerState.timer){ clearInterval(playerState.timer); playerState.timer = null; }
    updatePlayerUI();
  }
  function playPlayer(){
    if(playerState.playing || playerState.elapsedSec >= playerState.totalSec) return;
    playerState.playing = true;
    playerState.timer = setInterval(function(){
      playerState.elapsedSec += 1;
      if(playerState.elapsedSec >= playerState.totalSec){
        playerState.elapsedSec = playerState.totalSec;
        pausePlayer();
        return;
      }
      updatePlayerUI();
    }, 1000);
    updatePlayerUI();
  }
  function togglePlayerPlayPause(){
    if(playerState.playing) pausePlayer(); else playPlayer();
  }

  function expandRowPlayer(num, animate){
    var root = document.getElementById("scr-upload-pending-row-player");
    if(!root) return;
    var tpl = document.getElementById("rowPlayerTemplate");
    if(expandedRec !== num){
      playerState.playing = false;
      if(playerState.timer){ clearInterval(playerState.timer); playerState.timer = null; }
      playerState.elapsedSec = 0;
      var rec = MOCK_RECORDINGS[num - 1];
      playerState.totalSec = rec ? parseDurationToSec(rec.duration) : 0;
    }
    // A card needs to change if EITHER signal disagrees with the target:
    // - the "rec-card--expanded" class (the DOM's own record — this is what
    //   onScreenShown's resync call relies on, since right after a jump every
    //   card's class is false regardless of what `expandedRec` already says)
    // - `expandedRec`, the logical target (needed because a collapsing card
    //   deliberately KEEPS its class until its animation actually finishes —
    //   see animateCardsHeight — so a rapid re-tap mid-collapse would see a
    //   stale "already expanded" class and wrongly get skipped if the class
    //   were the only signal consulted).
    var wasExpandedNum = expandedRec;
    var changes = [];
    root.querySelectorAll(".rec-card").forEach(function(card){
      var isTarget = card.getAttribute("data-tap") === "toggle:row-player:rec-" + num;
      var isExpandedByClass = card.classList.contains("rec-card--expanded");
      var wasLogicalTarget = card.getAttribute("data-tap") === "toggle:row-player:rec-" + wasExpandedNum;
      if(isTarget === isExpandedByClass && isTarget === wasLogicalTarget) return; // already correct by both signals
      var slot = card.querySelector(".player-slot");
      changes.push({
        card: card,
        expanding: isTarget,
        mutateClass: function(){ card.classList.toggle("rec-card--expanded", isTarget); },
        insertContent: function(node){ if(!slot) return; slot.innerHTML = ""; slot.appendChild(node || tpl.content.cloneNode(true)); },
        // firstElementChild, not firstChild: the <template>'s own markup has
        // a leading newline/indentation before its one real element, which
        // clones in as a leading whitespace TEXT node — firstChild would
        // grab that instead of the actual player content and remove the
        // wrong (invisible, harmless) node, leaving the real content stuck
        // in the slot forever.
        removeContent: function(){ var n = slot && slot.firstElementChild; if(n) slot.removeChild(n); return n; }
      });
    });
    if(animate && changes.length){
      animateCardsHeight(changes);
    } else {
      changes.forEach(function(c){ c.mutateClass(); if(c.expanding) c.insertContent(); else c.removeContent(); });
    }
    expandedRec = num;
    updatePlayerUI();
  }
  function toggleRowPlayer(num){
    if(expandedRec === num){ pausePlayer(); goBack(); return; }
    expandRowPlayer(num, true);
  }

  // the row-actions-sheet's title/group used to always show rec-1's data
  // regardless of which row's "…" opened it ("every row opens the same
  // shared sheet" was an earlier simplification) — now that MOCK_RECORDINGS
  // already has per-row data, sync the sheet to whichever row was actually
  // tapped before presenting it. The second line shows the recording's group
  // (not who made it) — every recording on this phone has the same author
  // (whoever is using it), so an author name there wasn't useful info.
  var currentActionsRecNum = 1;
  function openRowActionsSheet(num){
    currentActionsRecNum = num;
    var rec = MOCK_RECORDINGS[num - 1];
    var root = document.getElementById("scr-upload-pending-row-actions-sheet");
    if(rec && root){
      var titleEl = root.querySelector(".sheet-title");
      var groupEl = root.querySelector(".sheet-group");
      if(titleEl) titleEl.textContent = rec.title;
      if(groupEl) groupEl.textContent = "グループ：" + rec.group;
    }
    goTo("upload-pending-row-actions-sheet", "modal");
  }

  // ---- upload-pending list: simulated upload progress + delete confirm ----
  // Both features physically mutate the rec-list DOM (rather than any data
  // model) since applyMockData() only ever ran once at boot to seed the 4
  // static cards — boards are never re-rendered, just shown/hidden, so once a
  // card is removed from a screen's DOM it stays gone for the rest of the
  // session with no further bookkeeping needed.
  function recCard(root, num){ return root && root.querySelector('.rec-card[data-tap$="rec-' + num + '"]'); }

  // collapses one card's height (and cancels the flex `gap` it leaves behind
  // with a matching negative margin) so the rest of the list visibly slides
  // up to fill the space, then removes it once the animation finishes.
  function animateRemoveCard(card, onRemoved){
    if(!card) return;
    clearAnim(card);
    var fromH = card.getBoundingClientRect().height;
    card.style.overflow = "hidden";
    var anim = card.animate(
      [{height: fromH + "px", opacity: 1, marginBottom: "0px"}, {height: "0px", opacity: 0, marginBottom: "-12px"}],
      {duration: 300, easing: "cubic-bezier(.22,.61,.36,1)"}
    );
    var done = function(){
      if(card.parentNode) card.parentNode.removeChild(card);
      if(onRemoved) onRemoved();
    };
    anim.finished.then(done, done);
  }

  function getUploadPendingCount(){
    var listRoot = document.getElementById("scr-upload-pending-list");
    return listRoot ? listRoot.querySelectorAll(".rec-list > .rec-card").length : 0;
  }

  // a zero count means nothing is pending, so the badge shouldn't claim
  // otherwise by showing an empty "0" circle — hide it outright, same as the
  // convention most badge counters use.
  function updateUploadBadge(){
    var count = getUploadPendingCount();
    document.querySelectorAll(".drawer-badge").forEach(function(el){
      el.textContent = count;
      el.style.display = count > 0 ? "" : "none";
    });
  }

  // home screen "N recordings pending upload" banner (Figma 5399:192133) —
  // shown on all 3 recording-home-* variants, reflecting the same count as
  // the drawer badge. Dismissing it (×) hides it for the rest of the
  // session even if the count hasn't changed.
  var uploadReminderDismissed = false;
  function updateUploadReminderBanner(){
    var count = getUploadPendingCount();
    var show = count > 0 && !uploadReminderDismissed;
    document.querySelectorAll(".upload-reminder-banner").forEach(function(el){
      el.style.display = show ? "" : "none";
      var textEl = el.querySelector(".upload-reminder-text");
      if(textEl) textEl.textContent = "アップロード待ちの録音データが" + count + "件あります";
    });
  }

  // once the real list has nothing left in it, swap the currently-visible
  // upload-pending-list for the empty-state screen (Figma ref 5270:83803) —
  // replacing the stack's current entry rather than pushing, so "back" from
  // the empty state still goes wherever "back" from the list would have.
  function checkUploadListEmpty(){
    var listRoot = document.getElementById("scr-upload-pending-list");
    if(!listRoot || listRoot.querySelectorAll(".rec-list > .rec-card").length > 0) return;
    if(currentSlug() !== "upload-pending-list") return;
    stack[stack.length - 1] = {slug: "upload-pending-empty", type: stack[stack.length - 1].type || "fade"};
    present("upload-pending-list", "upload-pending-empty", "fade", false);
  }

  // removes recording `num`'s card from every screen that lists it — animated
  // on whichever one the user can actually see, instant on the others (no one
  // is looking, and it must already match by the time that screen is shown).
  function removeRecCardsByNum(num){
    ["upload-pending-list", "upload-pending-select-mode", "upload-pending-row-player"].forEach(function(slug){
      var root = document.getElementById("scr-" + slug);
      if(!root) return;
      var card = recCard(root, num);
      if(!card) return;
      if(getComputedStyle(root).display !== "none"){
        animateRemoveCard(card, function(){ updateUploadBadge(); updateUploadReminderBanner(); updateSelectModeSummary(); checkUploadListEmpty(); });
      } else {
        card.parentNode.removeChild(card);
        updateUploadBadge();
        updateUploadReminderBanner();
        updateSelectModeSummary();
        checkUploadListEmpty();
      }
    });
  }

  function getSelectedRecNums(){
    var root = selectModeRoot();
    var nums = [];
    if(!root) return nums;
    root.querySelectorAll(".rec-checkbox").forEach(function(img){
      if(!isRecCheckboxChecked(img)) return;
      var m = (img.getAttribute("data-tap") || "").match(/rec-(\d+)/);
      if(m) nums.push(Number(m[1]));
    });
    return nums;
  }

  // rec-1 fails to upload for as long as its group is unset (demo of the
  // Figma error state, node 5397:176358 — "グループが存在しません" because
  // the row genuinely has no group selected, node 5399:199642's "未選択").
  // The card stays in the list (it's still pending, just errored) instead of
  // being removed like a successful upload. Once a group is picked via the
  // "グループを変更する" link, the banner collapses to the shorter "再試行"
  // form (node 5399:199642) without needing a fresh failed attempt first.
  var rec1GroupFixed = false;
  var openedGroupPickerForRec1Retry = false;

  function setRec1GroupLabel(label){
    var isPlaceholder = label === "未選択";
    ["upload-pending-list", "upload-pending-select-mode", "upload-pending-row-player"].forEach(function(slug){
      var root = document.getElementById("scr-" + slug);
      var card = root && recCard(root, 1);
      var grp = card && card.querySelector(".grp-label");
      if(!grp) return;
      grp.textContent = label;
      grp.style.color = isPlaceholder ? "var(--placeholder)" : "";
    });
  }

  function insertUploadErrorBanner(card, mode){
    var existing = card.querySelector(".rec-error");
    if(existing) existing.remove();
    var banner = document.createElement("div");
    banner.className = "rec-error";
    if(mode === "retry"){
      banner.classList.add("rec-success");
      banner.innerHTML =
        '<img src="assets/icon-upload-group-success.svg" alt="">' +
        '<div class="rec-error-body">' +
          '<div class="rec-error-detail">' +
            '<span>グループを変更しました。</span>' +
          '</div>' +
          '<div class="rec-error-detail">' +
            '<span class="rec-error-link" data-tap="retry:upload-rec-1">' +
              '<span>アップロード再試行</span>' +
              '<img src="assets/icon-upload-error-arrow.svg" alt="">' +
            '</span>' +
          '</div>' +
        '</div>' +
        '<img class="rec-error-close" src="assets/icon-upload-reminder-close.svg" alt="閉じる" data-tap="dismiss:rec1-upload-notice">';
    } else {
      banner.innerHTML =
        '<img src="assets/icon-upload-error-warning.svg" alt="">' +
        '<div class="rec-error-body">' +
          '<p class="rec-error-title">アップロードに失敗しました。</p>' +
          '<div class="rec-error-detail">' +
            '<span>グループが存在しません。</span>' +
            '<span class="rec-error-link" data-tap="open:group-picker">' +
              '<span>グループを変更する</span>' +
              '<img src="assets/icon-upload-error-arrow.svg" alt="">' +
            '</span>' +
          '</div>' +
        '</div>';
    }
    card.appendChild(banner);
  }

  // picking a group from the picker fixes the one thing that was actually
  // wrong — it doesn't retry the upload itself, so the row just moves from
  // "here's why it failed" straight to "ready, tap to retry".
  function resolveRec1GroupFixed(label){
    rec1GroupFixed = true;
    setRec1GroupLabel(label);
    var listRoot = document.getElementById("scr-upload-pending-list");
    var card = listRoot && recCard(listRoot, 1);
    if(card) insertUploadErrorBanner(card, "retry");
  }

  // the status-icon slot (normally the "…" menu button) swaps to a
  // determinate progress ring that fills from empty to full (not an
  // indeterminate spinner), then either a brief static "complete" cloud
  // before the whole card is removed (success), or back to the normal "…"
  // icon plus an inline error banner that stays in the card (failure).
  // Always plays out on the real list (the only screen with this icon slot
  // in the Figma reference), so any trigger elsewhere returns to the list
  // first.
  function runUploadForNum(num){
    var root = document.getElementById("scr-upload-pending-list");
    var card = root && recCard(root, num);
    var icon = card && card.querySelector(".rec-menu-btn");
    if(!icon) return;
    var existingError = card.querySelector(".rec-error");
    if(existingError) existingError.remove();
    var ring = document.createElement("div");
    ring.className = "upload-progress-ring";
    ring.innerHTML =
      '<svg width="20" height="20" viewBox="0 0 20 20">' +
        '<circle cx="10" cy="10" r="7.5" fill="none" stroke="#1F2329" stroke-opacity=".15" stroke-width="1.5"/>' +
        '<circle class="fill" cx="10" cy="10" r="7.5" fill="none" stroke="#16C098" stroke-width="1.5" ' +
          'stroke-linecap="round" stroke-dasharray="47.12" stroke-dashoffset="47.12" transform="rotate(-90 10 10)"/>' +
      '</svg>';
    icon.replaceWith(ring);
    setTimeout(function(){
      if(num === 1 && !rec1GroupFixed){
        var menuIcon = document.createElement("img");
        menuIcon.className = "rec-menu-btn";
        menuIcon.src = "assets/row-menu-dots.svg";
        menuIcon.width = 20; menuIcon.height = 20; menuIcon.alt = "メニュー";
        menuIcon.setAttribute("data-tap", "open:row-menu:rec-" + num);
        ring.replaceWith(menuIcon);
        insertUploadErrorBanner(card, "detail");
        return;
      }
      var cloud = document.createElement("img");
      cloud.className = "rec-menu-btn";
      cloud.src = "assets/icon-upload-complete-cloud.svg";
      cloud.width = 20; cloud.height = 20;
      cloud.alt = "";
      ring.replaceWith(cloud);
      setTimeout(function(){
        toast("アップロードしました");
        removeRecCardsByNum(num);
      }, 450);
    }, 1400);
  }

  function startUploadSimulation(nums){
    if(!nums || !nums.length) return;
    nums.forEach(function(num, i){ setTimeout(function(){ runUploadForNum(num); }, i * 250); });
  }

  var pendingDeleteTarget = null;
  function openDeleteConfirm(target){
    pendingDeleteTarget = target;
    goTo("upload-pending-delete-confirm", "alert");
  }
  function performPendingDelete(){
    var target = pendingDeleteTarget;
    pendingDeleteTarget = null;
    if(!target) return;
    popToSlug("upload-pending-list", "alert");
    var nums = target.type === "selected" ? target.nums : [target.num];
    setTimeout(function(){ nums.forEach(removeRecCardsByNum); }, 260);
  }

  // 録音情報の変更シート：タップされた行の録音には既にタイトルがあるので、
  // 「タイトルを入力」の空プレースホルダーではなく実際のタイトルを表示する。
  function syncEditInfoSheetTitle(){
    var rec = MOCK_RECORDINGS[currentActionsRecNum - 1];
    var titleEl = document.querySelector('#scr-upload-pending-edit-info-sheet .editable-title[data-placeholder="タイトルを入力"]');
    if(rec && titleEl) titleEl.textContent = rec.title;
  }

  // メールアドレス行: 短ければ横並び（ラベル…値）、長くて収まらなければ
  // settings-email-overflow.html の "stacked" レイアウト（ラベルを上段、値を
  // 下段フル幅で word-break）に実測で切り替える。Figma ref: 5270:85507。
  function initEmailRowLayout(slug){
    var root = document.getElementById("scr-" + slug);
    if(!root) return;
    root.querySelectorAll(".setting-row").forEach(function(row){
      var label = row.querySelector(".label");
      if(!label || label.textContent.indexOf("メールアドレス") === -1) return;
      var value = row.querySelector(".value");
      if(!value) return;
      row.classList.remove("stacked");
      var available = row.clientWidth - label.offsetWidth - 12;
      if(value.scrollWidth > available) row.classList.add("stacked");
    });
  }

  // recording-paused-loginfo is reached two ways — from recording-active
  // (still actively recording, just viewing the ログ情報 tab) or from
  // recording-paused-transcript (genuinely paused) — but its bottom bar only
  // ever showed the "paused" look (再開 button), so switching to this tab
  // while actively recording looked like it silently paused you too. Now the
  // bar reflects whichever state is actually true, and toggling it here
  // flips the visual state in place instead of navigating to a different
  // screen (recording-active has no ログ情報 tab content of its own).
  function setRecordingPausedUI(slug, paused){
    var root = document.getElementById("scr-" + slug);
    if(!root) return;
    var resumeBtn = root.querySelector(".resume-btn");
    var pauseBtn = root.querySelector(".pause-btn");
    if(resumeBtn) resumeBtn.style.display = paused ? "flex" : "none";
    if(pauseBtn) pauseBtn.style.display = paused ? "none" : "flex";
    var waveStatic = root.querySelector(".wave-static");
    var waveLive = root.querySelector(".timer-wave-live");
    if(waveStatic) waveStatic.style.display = paused ? "block" : "none";
    if(waveLive) waveLive.style.display = paused ? "none" : "flex";
    if(paused) stopActiveRecordingEffects(); else startActiveRecordingEffects();
  }

  // recording-paused-loginfo is also the ログ情報 tab for OFFLINE recording —
  // Figma never designed a separate "offline, viewing ログ情報" screen, and
  // its content (作成者/日時/タグ/ステータス) doesn't actually depend on
  // online vs offline, so it's correct to reuse the same screen rather than
  // the old "out of scope" toast. What DOES need to be remembered is which
  // screen "書き起こし" should return to, since that differs by both
  // paused/active AND online/offline (4 combinations).
  var loginfoReturnSlug = "recording-active";
  function enterLoginfoTab(returnSlug, paused){
    loginfoReturnSlug = returnSlug;
    setRecordingPausedUI("recording-paused-loginfo", paused);
    syncLoginfoTabLabel(returnSlug);
    // offline-active/-paused have no scrollable content of their own, so
    // they never legitimately produce a collapsed header — any nonzero
    // sharedHeaderProgress at this point is leftover from an unrelated
    // online recording visited earlier (e.g. via the all-screens index) and
    // would otherwise make ログ情報 open already collapsed (title hidden,
    // tabs stuck to the top) for no reason tied to this screen.
    var isOffline = returnSlug === "recording-offline-active" || returnSlug === "recording-offline-paused";
    if(isOffline) sharedHeaderProgress = 0;
    goTo("recording-paused-loginfo", "fade");
  }

  // offline mode doesn't transcribe live (it's text-after-upload only), so
  // the left tab there is labeled "録音" rather than "書き起こし" — when the
  // ログ情報 tab is reached FROM an offline screen, its left tab (which
  // switches back to whichever screen we came from) must say the same thing,
  // or it reads as if offline mode suddenly grew a live transcript.
  function syncLoginfoTabLabel(returnSlug){
    var isOffline = returnSlug === "recording-offline-active" || returnSlug === "recording-offline-paused";
    var span = document.querySelector('#scr-recording-paused-loginfo [data-tap="switch-tab:transcript"] span');
    if(span) span.textContent = isOffline ? "録音" : "書き起こし";
    // the offline recording screens use a shorter header (no divider line,
    // less top padding — Figma 5270:78731) than the online ones; ログ情報
    // is shared between both, so it has to match whichever one it was
    // reached from or switching tabs visibly jumps the whole header.
    var header = document.querySelector("#scr-recording-paused-loginfo .header");
    if(header) header.classList.toggle("offline-mode", isOffline);
  }

  function goBack(){
    if(stack.length <= 1) return;
    var top = stack.pop();
    var toSlug = currentSlug();
    present(top.slug, toSlug, top.type || "push", true);
  }

  // an overlay (modal/modal-left) deliberately leaves its "from" screen
  // visible underneath without popping it off `stack` — that's what lets a
  // screenshot-perfect close animation show the real screen behind it. But if
  // the user only closes the TOP overlay and then taps directly on that real
  // screen underneath (rather than also dismissing the overlay still open one
  // level up), the stack's logical top no longer matches whatever board the
  // tap physically landed on. Resync it first so goTo()'s own fromSlug check
  // — and the now-correctly-routed OVERRIDES handler — see reality, and hide
  // whatever stale overlay(s) get skipped over in the process.
  function syncStackTo(slug){
    if(currentSlug() === slug) return;
    var idx = -1;
    for(var i = stack.length - 1; i >= 0; i--){ if(stack[i].slug === slug){ idx = i; break; } }
    if(idx === -1){
      var path = [slug], p = PARENT[slug];
      while(p){ path.unshift(p); p = PARENT[p]; }
      stack = path.map(function(s){ return {slug: s, type: "push"}; });
      return;
    }
    for(var j = stack.length - 1; j > idx; j--){
      var stale = el(stack[j].slug);
      if(stale){ clearAnim(stale); stale.style.display = "none"; }
    }
    stack = stack.slice(0, idx + 1);
  }

  // safety net: overlay screens keep their base visible underneath them, so a
  // jump/root-reset/pop-to that skips the normal close step can leave a
  // stray board visible. Sweep anything not in `keepSlugs` away.
  function hideAllExcept(keepSlugs){
    var keep = {};
    (Array.isArray(keepSlugs) ? keepSlugs : [keepSlugs]).forEach(function(s){ if(s) keep["scr-" + s] = true; });
    document.querySelectorAll("#stack .board").forEach(function(b){
      if(!keep[b.id] && b.style.display !== "none"){
        clearAnim(b); b.style.display = "none";
      }
    });
  }

  function goToRoot(slug, type){
    if(!el(slug)) return;
    var fromSlug = currentSlug();
    stack = [{slug: slug, type: null}];
    if(type && fromSlug && fromSlug !== slug){
      present(fromSlug, slug, type, false);
    } else {
      var t = el(slug);
      clearAnim(t);
      t.style.display = "block"; t.style.zIndex = nextZ();
    }
    hideAllExcept(slug);
    onScreenShown(slug);
  }

  function popToSlug(targetSlug, type){
    var idx = -1;
    for(var i = 0; i < stack.length; i++){ if(stack[i].slug === targetSlug) idx = i; }
    if(idx === -1){ jumpTo(targetSlug); return; }
    var fromSlug = currentSlug();
    stack = stack.slice(0, idx + 1);
    present(fromSlug, targetSlug, type || "modal", true).then(function(){
      hideAllExcept(targetSlug);
    });
  }

  function jumpTo(slug){
    if(!el(slug)) return;
    var path = [slug], p = PARENT[slug];
    while(p){ path.unshift(p); p = PARENT[p]; }
    stack = path.map(function(s){ return {slug: s, type: "push"}; });
    var t = el(slug);
    clearAnim(t);
    var jumpZFront = nextZ(), jumpZBack = nextZ();
    t.style.display = "block"; t.style.zIndex = jumpZFront;
    // overlay screens carry no baked background anymore — show their real
    // base screen underneath too, so the jump doesn't land on a blank board.
    var baseSlug = OVERLAY_BASE[slug];
    if(baseSlug && el(baseSlug)){
      clearAnim(el(baseSlug));
      el(baseSlug).style.display = "block";
      el(baseSlug).style.zIndex = jumpZBack;
    }
    hideAllExcept([slug, baseSlug]);
    closeIndex();
    onScreenShown(slug);
  }

  var toastTimer = null;
  function toast(msg){
    var t = document.getElementById("toastEl");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ t.classList.remove("show"); }, 1800);
  }

  // ---- per-screen navigation overrides: "slug|data-tap" -> handler ----
  var OVERRIDES = {
    // real typing: tap the field, use the real keyboard, "ernie" succeeds,
    // anything else shows the same error toast node 5270:80690 specifies.
    "login-space-id-empty|open:space-id-info": function(){ toast("スペースIDとは（説明は未実装です）"); },
    "login-space-id-empty|clear:space-id-input": function(){
      var input = document.getElementById("spaceIdInput");
      input.value = ""; input.focus();
      updateSpaceIdButtonState();
    },
    "login-space-id-empty|go:verify-space-id": function(){
      var input = document.getElementById("spaceIdInput");
      if(input.value.trim() === "ernie"){ goTo("login-space-confirm", "cut"); }
      else { toast("スペースIDが存在しません"); }
    },

    "login-space-id-keyboard|focus:space-id-input": function(){ goTo("login-space-id-filled", "fade"); },
    "login-space-id-keyboard|dismiss-keyboard": function(){ goTo("login-space-id-empty", "fade"); },
    "login-space-id-keyboard|open:space-id-info": function(){ toast("スペースIDとは（説明は未実装です）"); },

    "login-space-id-filled|clear:space-id-input": function(){ goTo("login-space-id-empty", "fade"); },
    "login-space-id-filled|go:verify-space-id": function(){ goTo("login-space-confirm", "cut"); },
    "login-space-id-filled|open:space-id-info": function(){ toast("スペースIDとは（説明は未実装です）"); },

    "login-space-id-error|clear:space-id-input": function(){ goTo("login-space-id-empty", "fade"); },
    "login-space-id-error|go:verify-space-id": function(){ goTo("login-space-confirm", "cut"); },
    "login-space-id-error|open:space-id-info": function(){ toast("スペースIDとは（説明は未実装です）"); },

    "login-space-confirm|go:login-success": function(){ goToRoot("recording-home-full"); },
    "login-space-confirm|open:terms": function(){ toast("利用規約（プロトタイプ外）"); },
    "login-space-confirm|open:privacy-policy": function(){ toast("プライバシーポリシー（プロトタイプ外）"); },
    "login-space-confirm|go:change-space-id": function(){ goToRoot("login-space-id-empty"); },

    "recording-home-full|open:side-menu": function(){ setDrawerSection("recording"); goTo("recording-home-side-menu", "modal-left"); },
    "recording-home-full|go:start-recording": function(node){ startRecording(node); },
    "recording-home-full|open:group-picker": function(){ goTo("metadata-group-picker", "modal"); },
    "recording-home-full|dismiss:upload-reminder": function(){ uploadReminderDismissed = true; updateUploadReminderBanner(); },
    "recording-home-offline-only|open:side-menu": function(){ setDrawerSection("recording"); goTo("recording-home-side-menu", "modal-left"); },
    "recording-home-offline-only|go:start-recording": function(node){ startRecording(node); },
    "recording-home-offline-only|open:group-picker": function(){ goTo("metadata-group-picker", "modal"); },
    "recording-home-offline-only|dismiss:upload-reminder": function(){ uploadReminderDismissed = true; updateUploadReminderBanner(); },
    "recording-home-long-group|open:side-menu": function(){ setDrawerSection("recording"); goTo("recording-home-side-menu", "modal-left"); },
    "recording-home-long-group|go:start-recording": function(node){ startRecording(node); },
    "recording-home-long-group|open:group-picker": function(){ goTo("metadata-group-picker", "modal"); },
    "recording-home-long-group|dismiss:upload-reminder": function(){ uploadReminderDismissed = true; updateUploadReminderBanner(); },

    "recording-home-import-sheet|close:import-sheet": function(){ goBack(); },
    "recording-home-import-sheet|go:import-file-picker": function(){ toast("OSのファイル選択（プロトタイプ外）"); },
    "recording-home-import-sheet|open:import-other-apps-help": function(){ toast("取り込み方法のヘルプ（プロトタイプ外）"); },

    "recording-home-side-menu|close:side-menu": function(){ goBack(); },
    "recording-home-side-menu|go:recording-home": function(){ goToRoot("recording-home-full", "fade"); },
    "recording-home-side-menu|go:upload-queue": function(){ goTo("upload-pending-list", "push"); },
    "recording-home-side-menu|open:import-sheet": function(){ goTo("recording-home-import-sheet", "modal"); },
    "recording-home-side-menu|go:settings": function(){ goTo("settings-general", "push"); },

    // 2026-10-05 designer edit: several header back-chevrons were swapped
    // for a hamburger that opens this same global side drawer.
    "settings-general|open:side-menu": function(){ setDrawerSection("settings"); goTo("recording-home-side-menu", "modal-left"); },
    "settings-email-overflow|open:side-menu": function(){ setDrawerSection("settings"); goTo("recording-home-side-menu", "modal-left"); },
    "license-list|open:side-menu": function(){ setDrawerSection("settings"); goTo("recording-home-side-menu", "modal-left"); },
        "upload-pending-empty|open:side-menu": function(){ setDrawerSection("upload"); goTo("recording-home-side-menu", "modal-left"); },
    "upload-pending-list|open:side-menu": function(){ setDrawerSection("upload"); goTo("recording-home-side-menu", "modal-left"); },
    "upload-pending-row-player|open:side-menu": function(){ setDrawerSection("upload"); goTo("recording-home-side-menu", "modal-left"); },

    "recording-active|open:workspace-picker": function(){ goTo("metadata-group-picker", "modal"); },
    "recording-active|switch-tab:loginfo": function(){ enterLoginfoTab("recording-active", false); },
    "recording-active|toggle:pause-recording": function(){ goTo("recording-paused-transcript", "fade"); },
    "recording-active|go:stop-recording": function(){ goTo("metadata-edit", "push"); },
    "recording-active|scroll-to-bottom": function(node){ scrollContentToBottom(node); },

    "recording-paused-transcript|open:edit-title": function(){ toast("タイトル編集（プロトタイプ外）"); },
    "recording-paused-transcript|open:workspace-picker": function(){ goTo("metadata-group-picker", "modal"); },
    "recording-paused-transcript|switch-tab:loginfo": function(){ enterLoginfoTab("recording-paused-transcript", true); },
    "recording-paused-transcript|go:resume-recording": function(){ goTo("recording-active", "fade"); },
    "recording-paused-transcript|go:stop-recording": function(){ goTo("metadata-edit", "push"); },
    "recording-paused-transcript|scroll-to-bottom": function(node){ scrollContentToBottom(node); },

    "recording-paused-transcript-scrolled|switch-tab:loginfo": function(){ goTo("recording-paused-loginfo-scrolled", "fade"); },
    "recording-paused-transcript-scrolled|scroll-to-bottom": function(){ goTo("recording-paused-transcript", "fade"); },
    "recording-paused-transcript-scrolled|go:resume-recording": function(){ goTo("recording-active", "fade"); },
    "recording-paused-transcript-scrolled|go:stop-recording": function(){ goTo("metadata-edit", "push"); },

    "recording-paused-loginfo|open:edit-title": function(){ toast("タイトル編集（プロトタイプ外）"); },
    "recording-paused-loginfo|open:workspace-picker": function(){ goTo("metadata-group-picker", "modal"); },
    "recording-paused-loginfo|open:creator-profile": function(){ toast("作成者プロフィール（プロトタイプ外）"); },
    "recording-paused-loginfo|switch-tab:transcript": function(){ goTo(loginfoReturnSlug, "fade"); },
    "recording-paused-loginfo|open:edit-tags": function(){ goTo("metadata-tag-picker-2", "modal"); },
    "recording-paused-loginfo|open:edit-status": function(){ goTo("metadata-status-picker", "modal"); },
    "recording-paused-loginfo|toggle:pause-recording-inline": function(){ setRecordingPausedUI("recording-paused-loginfo", true); },
    "recording-paused-loginfo|go:resume-recording-inline": function(){ setRecordingPausedUI("recording-paused-loginfo", false); },
    "recording-paused-loginfo|go:stop-recording": function(){ goTo("metadata-edit", "push"); },
    "recording-paused-loginfo|scroll-to-bottom": function(node){ scrollContentToBottom(node); },

    "recording-paused-loginfo-scrolled|switch-tab:transcript": function(){ goTo("recording-paused-transcript-scrolled", "fade"); },
    "recording-paused-loginfo-scrolled|open:creator-profile": function(){ toast("作成者プロフィール（プロトタイプ外）"); },
    "recording-paused-loginfo-scrolled|open:edit-tags": function(){ goTo("metadata-tag-picker-2", "modal"); },
    "recording-paused-loginfo-scrolled|open:edit-status": function(){ goTo("metadata-status-picker", "modal"); },
    "recording-paused-loginfo-scrolled|go:resume-recording": function(){ goTo("recording-active", "fade"); },
    "recording-paused-loginfo-scrolled|go:stop-recording": function(){ goTo("metadata-edit", "push"); },

    "recording-offline-active|open:workspace-picker": function(){ goTo("metadata-group-picker", "modal"); },
    "recording-offline-active|switch-tab:loginfo": function(){ enterLoginfoTab("recording-offline-active", false); },
    "recording-offline-active|toggle:pause-recording": function(){ goTo("recording-offline-paused", "fade"); },
    "recording-offline-active|go:stop-recording": function(){ goTo("metadata-edit", "push"); },

    "recording-offline-paused|open:workspace-picker": function(){ goTo("metadata-group-picker", "modal"); },
    "recording-offline-paused|switch-tab:loginfo": function(){ enterLoginfoTab("recording-offline-paused", true); },
    "recording-offline-paused|go:resume-recording": function(){ goTo("recording-offline-active", "fade"); },
    "recording-offline-paused|go:stop-recording": function(){ goTo("metadata-edit", "push"); },

    "metadata-edit|open:group-picker": function(){ goTo("metadata-group-picker", "modal"); },
    "metadata-edit|open:tag-picker": function(){ goTo("metadata-tag-picker-2", "modal"); },
    "metadata-edit|open:status-picker": function(){ goTo("metadata-status-picker", "modal"); },
    "metadata-edit|save:metadata": function(){ toast("保存しました（デモ）"); goToRoot("recording-home-full"); },

    "metadata-group-picker|close:group-picker": function(){ openedGroupPickerForRec1Retry = false; goBack(); },
    "metadata-group-picker|apply:group-selection": function(){
      var label = GROUP_LABELS[currentGroupKey];
      applyGroupLabel(label);
      if(openedGroupPickerForRec1Retry){
        openedGroupPickerForRec1Retry = false;
        resolveRec1GroupFixed(label);
      }
      goBack();
    },
    "metadata-status-picker|close:status-picker": function(){ goBack(); },
    "metadata-status-picker|apply:status-selection": function(){ applyStatusLabel(STATUS_LABELS[currentStatusKey]); goBack(); },

    // tag-picker-2 is the real, live-editable sheet; tag-picker-4 was Figma's
    // separate "4 tags selected" mock snapshot — now that checking a tag here
    // actually mutates the chip row in place, there's no need to hop to a
    // different static screen to show that state, so it's reachable only via
    // the screen index for design reference (same treatment as
    // recording-home-long-group's long-name reference state).
    "metadata-tag-picker-2|close:tag-picker": function(){ goBack(); },
    "metadata-tag-picker-2|apply:tag-selection": function(){ applyTagSelection(); goBack(); },

    "metadata-tag-picker-4|close:tag-picker": function(){ goBack(); },
    "metadata-tag-picker-4|apply:tag-selection": function(){ goBack(); },

    "upload-pending-list|toggle:select-mode": function(){ resetSelectMode(); goTo("upload-pending-select-mode", "fade"); },
    "upload-pending-list|open:row-menu:rec-1": function(){ openRowActionsSheet(1); },
    "upload-pending-list|open:row-menu:rec-2": function(){ openRowActionsSheet(2); },
    "upload-pending-list|open:row-menu:rec-3": function(){ openRowActionsSheet(3); },
    "upload-pending-list|open:row-menu:rec-4": function(){ openRowActionsSheet(4); },
    "upload-pending-list|open:group-picker": function(){ openedGroupPickerForRec1Retry = true; goTo("metadata-group-picker", "modal"); },
    "upload-pending-list|retry:upload-rec-1": function(){ runUploadForNum(1); },
    "upload-pending-list|dismiss:rec1-upload-notice": function(node){ var banner = node.closest(".rec-error"); if(banner) banner.remove(); },

    // tapping the card body itself (iOS Voice Memos-style) expands THAT row's
    // own inline player (any of the 4, not just rec-1); tapping the "…" icon
    // opens the action sheet instead. expandRowPlayer() moves the one shared
    // <template> into whichever card's .player-slot should show it.
    "upload-pending-list|toggle:row-player:rec-1": function(){ expandRowPlayer(1); goTo("upload-pending-row-player", "fade"); },
    "upload-pending-list|toggle:row-player:rec-2": function(){ expandRowPlayer(2); goTo("upload-pending-row-player", "fade"); },
    "upload-pending-list|toggle:row-player:rec-3": function(){ expandRowPlayer(3); goTo("upload-pending-row-player", "fade"); },
    "upload-pending-list|toggle:row-player:rec-4": function(){ expandRowPlayer(4); goTo("upload-pending-row-player", "fade"); },

    // on this screen itself, tapping the already-expanded row's body collapses
    // back to the list; tapping a different row's body switches the player to
    // that row in place (no navigation).
    "upload-pending-row-player|toggle:row-player:rec-1": function(){ toggleRowPlayer(1); },
    "upload-pending-row-player|toggle:row-player:rec-2": function(){ toggleRowPlayer(2); },
    "upload-pending-row-player|toggle:row-player:rec-3": function(){ toggleRowPlayer(3); },
    "upload-pending-row-player|toggle:row-player:rec-4": function(){ toggleRowPlayer(4); },
    "upload-pending-row-player|toggle:select-mode": function(){ resetSelectMode(); goTo("upload-pending-select-mode", "fade"); },
    "upload-pending-row-player|open:row-menu:rec-1": function(){ openRowActionsSheet(1); },
    "upload-pending-row-player|open:row-menu:rec-2": function(){ openRowActionsSheet(2); },
    "upload-pending-row-player|open:row-menu:rec-3": function(){ openRowActionsSheet(3); },
    "upload-pending-row-player|open:row-menu:rec-4": function(){ openRowActionsSheet(4); },
    "upload-pending-row-player|delete:current": function(){
      var num = expandedRec;
      popToSlug("upload-pending-list", "fade");
      setTimeout(function(){ openDeleteConfirm({type: "single", num: num}); }, 260);
    },
    "upload-pending-row-player|go:upload-single:current": function(){
      var num = expandedRec;
      popToSlug("upload-pending-list", "fade");
      setTimeout(function(){ startUploadSimulation([num]); }, 260);
    },
    "upload-pending-row-player|seek:back15:current": function(){ toast("15秒戻す（デモ）"); },
    "upload-pending-row-player|seek:fwd15:current": function(){ toast("15秒進める（デモ）"); },
    "upload-pending-row-player|toggle:play:current": function(){ togglePlayerPlayPause(); },

    "upload-pending-select-mode|toggle:select-mode-off": function(){ goBack(); },
    "upload-pending-select-mode|toggle:select-all": function(){ toggleSelectAll(); },
    "upload-pending-select-mode|toggle:checkbox-rec-1": function(){ toggleRecCheckbox(1); },
    "upload-pending-select-mode|toggle:checkbox-rec-2": function(){ toggleRecCheckbox(2); },
    "upload-pending-select-mode|toggle:checkbox-rec-3": function(){ toggleRecCheckbox(3); },
    "upload-pending-select-mode|toggle:checkbox-rec-4": function(){ toggleRecCheckbox(4); },
    "upload-pending-select-mode|delete:selected": function(){
      var nums = getSelectedRecNums();
      if(!nums.length) return;
      popToSlug("upload-pending-list", "fade");
      setTimeout(function(){ openDeleteConfirm({type: "selected", nums: nums}); }, 260);
    },
    "upload-pending-select-mode|go:upload-selected": function(){
      var nums = getSelectedRecNums();
      if(!nums.length) return;
      popToSlug("upload-pending-list", "fade");
      setTimeout(function(){ startUploadSimulation(nums); }, 260);
    },

    "upload-pending-row-actions-sheet|close:row-actions-sheet": function(){ goBack(); },
    "upload-pending-row-actions-sheet|go:upload-single": function(){
      var num = currentActionsRecNum;
      goBack();
      setTimeout(function(){ startUploadSimulation([num]); }, 260);
    },
    "upload-pending-row-actions-sheet|open:edit-info-sheet": function(){ syncEditInfoSheetTitle(); goTo("upload-pending-edit-info-sheet", "modal"); },
    "upload-pending-row-actions-sheet|delete:recording": function(){
      var num = currentActionsRecNum;
      goBack();
      setTimeout(function(){ openDeleteConfirm({type: "single", num: num}); }, 260);
    },

    "upload-pending-edit-info-sheet|close:edit-info-sheet": function(){ goBack(); },
    "upload-pending-edit-info-sheet|open:group-picker": function(){ goTo("metadata-group-picker", "modal"); },
    "upload-pending-edit-info-sheet|save:recording-info": function(){ toast("保存しました（デモ）"); popToSlug("upload-pending-list", "modal"); },

    "upload-pending-delete-confirm|cancel:delete": function(){ pendingDeleteTarget = null; goBack(); },
    "upload-pending-delete-confirm|confirm:delete": function(){ performPendingDelete(); toast("削除しました"); },

    "settings-general|logout": function(){ toast("ログアウトしました（デモ）"); goToRoot("login-space-id-empty"); },
    "settings-general|open:license-list": function(){ goTo("license-list", "push"); },
    "settings-email-overflow|logout": function(){ toast("ログアウトしました（デモ）"); goToRoot("login-space-id-empty"); },
    "settings-email-overflow|open:license-list": function(){ goTo("license-list", "push"); },

    "license-list|open:license-detail": function(){ toast("ライセンス詳細（プロトタイプ外）"); }
  };

  // group/status pickers are single-select sheets: tapping an item moves the
  // checkmark exclusively to it, and "適用" writes the label back to every
  // screen that displays it (metadata-edit's rows, the workspace chip shown
  // mid-recording, etc. — anywhere carrying a .js-group-value/.js-status-value
  // hook). Keys mirror each item's "select:<key>" data-tap suffix.
  var GROUP_LABELS = {
    "group-uiux-design": "UIUXデザイン",
    "group-product-design-dept": "プロダクトデザイン開発推進チーム統括本部",
    "group-private-mode": "プライベートモード"
  };
  var STATUS_LABELS = {
    "status-nego": "商談中",
    "status-next-action-extracted": "ネクストアクション抽出済み",
    "status-unconfirmed": "未確認",
    "status-next-action-extracted-2": "ネクストアクション抽出済み",
    "status-stage-1": "1.初期接点/ヘルススコアgood支援",
    "status-stage-2": "2.DX部門との関係構築",
    "status-stage-3": "3.ユーザー拡大支援",
    "status-stage-4": "4.データ活用の価値提案",
    "status-cancelled": "解約",
    "status-private-mode": "プライベートモード"
  };
  // matches whichever item each picker's static markup already shows checked
  var currentGroupKey = "group-uiux-design";
  var currentStatusKey = "status-nego";

  function selectPickerItem(boardSelector, key){
    var root = document.querySelector(boardSelector);
    if(!root) return;
    root.querySelectorAll(".sheet-list .item .check").forEach(function(c){ c.remove(); });
    var item = root.querySelector('.item[data-tap="select:' + key + '"]');
    if(!item) return;
    var check = document.createElement("img");
    check.className = "check";
    check.src = "assets/icon-check-selected.svg";
    check.alt = "selected";
    item.appendChild(check);
  }

  // used when the group picker is opened to fix a recording that genuinely
  // has no group yet (rec-1's "未選択" state) — showing the app's last-used
  // group as pre-checked there would misleadingly imply it already has one.
  function clearGroupPickerSelection(){
    document.querySelectorAll("#scr-metadata-group-picker .sheet-list .item .check").forEach(function(c){ c.remove(); });
  }

  function applyGroupLabel(label){
    document.querySelectorAll(".js-group-value").forEach(function(el){ el.textContent = label; });
  }
  function applyStatusLabel(label){
    document.querySelectorAll(".js-status-value").forEach(function(el){ el.textContent = label; });
  }

  Object.keys(GROUP_LABELS).forEach(function(key){
    OVERRIDES["metadata-group-picker|select:" + key] = function(){
      currentGroupKey = key;
      selectPickerItem("#scr-metadata-group-picker", key);
    };
  });
  Object.keys(STATUS_LABELS).forEach(function(key){
    OVERRIDES["metadata-status-picker|select:" + key] = function(){
      currentStatusKey = key;
      selectPickerItem("#scr-metadata-status-picker", key);
    };
  });

  // tag picker is multi-select: each row's checkbox icon actually swaps
  // asset+state, the chips-box mirrors the checked rows live, and "適用"
  // writes the resulting tag set back to every screen that summarizes it
  // (metadata-edit's "first tag + +N" chip, recording-paused-loginfo's full
  // chip row). Figma ref: tag-picker-2 (5270:81585) was the only sheet that
  // ever needed real interaction here — see the retirement note on
  // tag-picker-4 above.
  var TAG_LABELS = {
    "tag-online-consultation": "オンライン相談会",
    "tag-internal-meeting": "社内会議",
    "tag-unconfirmed": "未確認",
    "tag-next-action-extracted": "ネクストアクション抽出済み",
    "tag-external-meeting": "社外会議",
    "tag-cancelled": "解約"
  };
  var TAG_ORDER = Object.keys(TAG_LABELS);

  function tagPickerRoot(){ return document.getElementById("scr-metadata-tag-picker-2"); }

  function setTagRowChecked(row, checked){
    row.classList.toggle("checked", checked);
    var img = row.querySelector(".checkbox");
    img.src = checked ? "assets/icon-checkbox-checked.svg" : "assets/icon-checkbox-unchecked.svg";
    img.alt = checked ? "checked" : "unchecked";
  }
  function isTagRowChecked(row){ return row.classList.contains("checked"); }

  function syncTagChips(){
    var root = tagPickerRoot();
    var box = root.querySelector(".chips-box");
    box.innerHTML = "";
    TAG_ORDER.forEach(function(key){
      var row = root.querySelector('.checkbox-row[data-tap="toggle:' + key + '"]');
      if(!row || !isTagRowChecked(row)) return;
      var chip = document.createElement("span");
      chip.className = "selected-chip";
      chip.textContent = TAG_LABELS[key];
      var x = document.createElement("img");
      x.src = "assets/icon-chip-remove.svg"; x.alt = "remove";
      x.setAttribute("data-tap", "remove:" + key);
      chip.appendChild(x);
      box.appendChild(chip);
    });
  }

  function toggleTagRow(key){
    var root = tagPickerRoot();
    var row = root.querySelector('.checkbox-row[data-tap="toggle:' + key + '"]');
    if(!row) return;
    setTagRowChecked(row, !isTagRowChecked(row));
    syncTagChips();
  }

  function removeTagChip(key){
    var root = tagPickerRoot();
    var row = root.querySelector('.checkbox-row[data-tap="toggle:' + key + '"]');
    if(!row) return;
    setTagRowChecked(row, false);
    syncTagChips();
  }

  function getSelectedTagLabels(){
    var root = tagPickerRoot();
    var labels = [];
    TAG_ORDER.forEach(function(key){
      var row = root.querySelector('.checkbox-row[data-tap="toggle:' + key + '"]');
      if(row && isTagRowChecked(row)) labels.push(TAG_LABELS[key]);
    });
    return labels;
  }

  function applyTagSelection(){
    var labels = getSelectedTagLabels();

    var editRow = document.querySelector('#scr-metadata-edit .card-row[data-tap="open:tag-picker"] .row-right');
    if(editRow){
      var chevron = editRow.querySelector("img");
      editRow.querySelectorAll(".tag-chip").forEach(function(c){ c.remove(); });
      if(labels.length > 0){
        var first = document.createElement("span");
        first.className = "chip tag-chip";
        first.textContent = labels[0];
        editRow.insertBefore(first, chevron);
        if(labels.length > 1){
          var more = document.createElement("span");
          more.className = "chip tag-chip";
          more.textContent = "+" + (labels.length - 1);
          editRow.insertBefore(more, chevron);
        }
      }
    }

    ["#scr-recording-paused-loginfo .tags-row", "#scr-recording-paused-loginfo-scrolled .tags-row"].forEach(function(sel){
      var row = document.querySelector(sel);
      if(!row) return;
      var icon = row.querySelector(".edit-icon");
      row.querySelectorAll(".chip").forEach(function(c){ c.remove(); });
      labels.forEach(function(label){
        var chip = document.createElement("span");
        chip.className = "chip";
        chip.textContent = label;
        row.insertBefore(chip, icon);
      });
    });
  }

  Object.keys(TAG_LABELS).forEach(function(key){
    OVERRIDES["metadata-tag-picker-2|toggle:" + key] = function(){ toggleTagRow(key); };
    OVERRIDES["metadata-tag-picker-2|remove:" + key] = function(){ removeTagChip(key); };
  });

  // upload-pending select-mode: the icon asset itself flips (not just a CSS
  // class), count/"すべて選択" stay in sync, and entering via the real "選択"
  // tap always starts from zero — the Figma mock's hardcoded 3-of-4
  // pre-selected state was only ever a single snapshot, not the real default.
  function selectModeRoot(){ return document.getElementById("scr-upload-pending-select-mode"); }

  function setRecCheckboxChecked(img, checked){
    img.src = checked ? "assets/icon-checkbox-checked.svg" : "assets/icon-checkbox-unchecked.svg";
    img.alt = checked ? "選択中" : "未選択";
    img.classList.toggle("checked", checked);
  }
  function isRecCheckboxChecked(img){ return img.classList.contains("checked"); }

  function updateSelectModeSummary(){
    var root = selectModeRoot();
    var boxes = root.querySelectorAll(".rec-checkbox");
    var checkedCount = 0;
    boxes.forEach(function(b){ if(isRecCheckboxChecked(b)) checkedCount++; });
    var countEl = root.querySelector(".select-count");
    if(countEl) countEl.textContent = checkedCount + "件選択中";
    var allEl = root.querySelector(".select-all");
    if(allEl) allEl.textContent = (checkedCount > 0 && checkedCount === boxes.length) ? "選択を解除" : "すべて選択";
  }

  function toggleRecCheckbox(num){
    var root = selectModeRoot();
    var img = root.querySelector('.rec-checkbox[data-tap="toggle:checkbox-rec-' + num + '"]');
    if(!img) return;
    setRecCheckboxChecked(img, !isRecCheckboxChecked(img));
    updateSelectModeSummary();
  }

  function toggleSelectAll(){
    var root = selectModeRoot();
    var boxes = root.querySelectorAll(".rec-checkbox");
    var allChecked = Array.prototype.every.call(boxes, isRecCheckboxChecked);
    boxes.forEach(function(b){ setRecCheckboxChecked(b, !allChecked); });
    updateSelectModeSummary();
  }

  function resetSelectMode(){
    var root = selectModeRoot();
    root.querySelectorAll(".rec-checkbox").forEach(function(b){ setRecCheckboxChecked(b, false); });
    updateSelectModeSummary();
  }

  // sync the "checked" class (used by the toggle handlers above) to whatever
  // each static screen's markup already shows via its icon src, so a
  // screen-index jump straight into select-mode or the tag picker behaves
  // consistently with its own reference state before any tap happens.
  function initSelectModeCheckboxes(){
    var root = selectModeRoot();
    if(!root) return;
    root.querySelectorAll(".rec-checkbox").forEach(function(img){
      img.classList.toggle("checked", img.src.indexOf("checkbox-checked") !== -1);
    });
  }

  function initTagPickerRows(){
    var root = tagPickerRoot();
    if(!root) return;
    root.querySelectorAll(".checkbox-row").forEach(function(row){
      var img = row.querySelector(".checkbox");
      row.classList.toggle("checked", img.src.indexOf("checkbox-checked") !== -1);
    });
  }

  function handleTap(slug, tap, node){
    var key = slug + "|" + tap;
    if(OVERRIDES[key]){ OVERRIDES[key](node); return; }

    if(tap === "back"){ goBack(); return; }
    if(tap === "noop"){ return; }
    if(tap.indexOf("close:") === 0 || tap.indexOf("apply:") === 0){ goBack(); return; }
    if(tap.indexOf("save:") === 0){ toast("保存しました（デモ）"); goBack(); return; }
    if(tap === "dismiss-keyboard"){
      var kb = document.getElementById("scr-" + slug).querySelector(".keyboard, .kb");
      if(kb) kb.style.display = "none";
      return;
    }
    if(tap.indexOf("toggle:") === 0 || tap.indexOf("select:") === 0){
      node.classList.toggle("on");
      node.classList.toggle("checked");
      return;
    }
    if(tap.indexOf("remove:") === 0){
      node.style.transition = "opacity .2s, transform .2s";
      node.style.opacity = "0"; node.style.transform = "scale(.8)";
      return;
    }
    if(tap.indexOf("focus:") === 0){
      var editable = (node.querySelector && node.querySelector('[contenteditable="true"]')) || (node.parentElement && node.parentElement.querySelector('[contenteditable="true"]'));
      if(editable) editable.focus();
      return;
    }
    if(tap.indexOf("edit:") === 0){ return; }
    if(tap.indexOf("delete:") === 0){ toast("削除しました（デモ）"); return; }
    if(tap.indexOf("go:") === 0 || tap.indexOf("open:") === 0 || tap.indexOf("switch-tab:") === 0){
      toast("この操作はこの原型の範囲外です");
      return;
    }
    // unknown prefix: silent no-op
  }

  document.addEventListener("DOMContentLoaded", function(){
    document.getElementById("stack").addEventListener("click", function(e){
      var node = e.target.closest ? e.target.closest("[data-tap]") : null;
      if(!node) return;
      // attribute the tap to whichever board it physically landed on, not to
      // the nav-stack's logical top: a closed overlay (e.g. the import sheet)
      // only pops itself off the stack, leaving the overlay underneath it
      // (e.g. the side menu) as the "current" slug even once it's no longer
      // visible/interactive — keying off currentSlug() there would route a
      // tap on the real screen beneath both of them to the wrong handler map.
      var board = node.closest(".board");
      var slug = board ? board.id.replace(/^scr-/, "") : currentSlug();
      syncStackTo(slug);
      handleTap(slug, node.getAttribute("data-tap"), node);
    });

    // draggable seek on the inline row player's progress track. A plain tap
    // already seeks (pointerdown alone fires the first seekFromClientX), and
    // dragging continues to track the pointer until release. The transition
    // on .player-fill (smooth per-second ticking during playback) is turned
    // off for the duration of the drag so the fill follows the pointer
    // immediately instead of chasing it with a 1s lag.
    var draggingTrack = null;
    function seekFromClientX(track, clientX){
      var rect = track.getBoundingClientRect();
      var ratio = playerState.totalSec > 0 ? Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) : 0;
      playerState.elapsedSec = Math.round(ratio * playerState.totalSec);
      updatePlayerUI();
    }
    document.getElementById("stack").addEventListener("pointerdown", function(e){
      var track = e.target.closest && e.target.closest(".player-track");
      if(!track) return;
      draggingTrack = track;
      track.classList.add("dragging");
      if(track.setPointerCapture){ try{ track.setPointerCapture(e.pointerId); }catch(err){} }
      seekFromClientX(track, e.clientX);
      e.preventDefault();
    });
    // move/up listen on document (not just #stack) so the drag keeps tracking
    // correctly even if the pointer strays outside the track or the stack's
    // own bounds before being released — setPointerCapture alone isn't
    // enough to rely on across every environment this prototype runs in.
    document.addEventListener("pointermove", function(e){
      if(!draggingTrack) return;
      seekFromClientX(draggingTrack, e.clientX);
    });
    function endTrackDrag(){
      if(!draggingTrack) return;
      draggingTrack.classList.remove("dragging");
      draggingTrack = null;
    }
    document.addEventListener("pointerup", endTrackDrag);
    document.addEventListener("pointercancel", endTrackDrag);

    document.getElementById("indexBtn").addEventListener("click", function(){
      document.getElementById("indexOverlay").classList.add("open");
    });
    document.getElementById("indexClose").addEventListener("click", closeIndex);
    document.getElementById("indexOverlay").addEventListener("click", function(e){
      if(e.target.id === "indexOverlay") closeIndex();
    });
    document.getElementById("indexPanel").addEventListener("click", function(e){
      var row = e.target.closest(".idx-row");
      if(row) jumpTo(row.getAttribute("data-slug"));
    });

    // show only the root screen initially
    document.querySelectorAll("#stack .board").forEach(function(b){
      if(b.id !== "scr-" + ROOT) b.style.display = "none";
    });

    applyMockData();
    updateUploadReminderBanner();
    setRec1GroupLabel("未選択");
    // expandRowPlayer's own reset-on-switch only fires when `num` actually
    // differs from the already-expanded row, which is never true the very
    // first time (expandedRec defaults to 1, matching rec-1's own resync
    // call) — so rec-1's real duration needs to be seeded here once up front.
    playerState.totalSec = parseDurationToSec(MOCK_RECORDINGS[expandedRec - 1].duration);
    initSpaceIdInput();
    initEditableTitles();
    initSelectModeCheckboxes();
    initTagPickerRows();
    setupScrollCollapse("recording-active");
    setupScrollCollapse("recording-paused-transcript");
    setupScrollCollapse("recording-paused-loginfo");
    fitStage();
    window.addEventListener("resize", fitStage);
  });

  // ---- realistic mock data for the upload-pending list family of screens ----
  // Figma's own placeholder repeated the same title/date/duration on every
  // row; swapping in varied real-looking data exercises title wrapping
  // (very short vs. very long, 2-line clamp), group-name overflow, and
  // date/duration/author variety the static mock couldn't show.
  var MOCK_RECORDINGS = [
    { title: "新機能リリース判定会議", group: "UIUXデザイン", date: "2026/01/15", duration: "18:42", author: "片岡新太郎" },
    { title: "プロダクトデザイン開発推進チーム統括本部との全社横断システム連携に関する定例報告会議", group: "プロダクトデザイン開発推進チーム統括本部", date: "2026/02/22", duration: "61:05", author: "山田太郎" },
    { title: "顧客ヒアリング：A社導入前打ち合わせ", group: "営業部", date: "2026/03/02", duration: "42:30", author: "伊藤あかり" },
    { title: "朝会", group: "UIUXデザイン", date: "2026/03/10", duration: "05:12", author: "中村健太" }
  ];

  function setTextKeepingImg(el, text){
    if(!el) return;
    var img = el.querySelector("img");
    el.innerHTML = "";
    if(img) el.appendChild(img);
    el.appendChild(document.createTextNode(text));
  }

  function applyMockData(){
    // side-drawer's "アップロード待ち" badge was a decorative hardcoded "5"
    // disconnected from the actual list — tie it to the real count instead.
    document.querySelectorAll(".drawer-badge").forEach(function(el){
      el.textContent = MOCK_RECORDINGS.length;
    });
    var slugs = [
      "upload-pending-list", "upload-pending-select-mode", "upload-pending-row-player",
      "upload-pending-row-actions-sheet", "upload-pending-edit-info-sheet"
    ];
    slugs.forEach(function(slug){
      var root = document.getElementById("scr-" + slug);
      if(!root) return;
      var cards = root.querySelectorAll(".rec-list > .rec-card");
      cards.forEach(function(card, i){
        var rec = MOCK_RECORDINGS[i];
        if(!rec) return;
        var titleEl = card.querySelector(".rec-title");
        if(titleEl) titleEl.textContent = rec.title;
        var grpLabel = card.querySelector(".grp .grp-label");
        if(grpLabel) grpLabel.textContent = rec.group;
        setTextKeepingImg(card.querySelector(".dur"), rec.duration);
        var dateEl = card.querySelector(".rec-meta-left > span:not(.grp):not(.dur):not(.sep)");
        if(dateEl) dateEl.textContent = rec.date;
      });
      // the row-actions-sheet's floating title/group block defaults to the
      // first record here; openRowActionsSheet() re-syncs it to whichever
      // row's "…" was actually tapped before the real navigation path shows it.
      var sheetTitle = root.querySelector(".sheet-title");
      var sheetGroup = root.querySelector(".sheet-group");
      if(sheetTitle) sheetTitle.textContent = MOCK_RECORDINGS[0].title;
      if(sheetGroup) sheetGroup.textContent = "グループ：" + MOCK_RECORDINGS[0].group;
      // edit-info-sheet's "グループ" row shows the first record's group
      var editGroupValue = root.querySelector(".edit-row-right .js-group-value");
      if(editGroupValue) editGroupValue.textContent = MOCK_RECORDINGS[0].group;
    });
  }

  // ---- real text input: login space-ID field ----
  function updateSpaceIdButtonState(){
    var input = document.getElementById("spaceIdInput");
    var btn = document.getElementById("spaceIdNextBtn");
    var clear = document.getElementById("spaceIdClear");
    if(!input || !btn) return;
    var has = input.value.trim().length > 0;
    btn.classList.toggle("btn-primary", has);
    btn.classList.toggle("btn-disabled", !has);
    if(clear) clear.classList.toggle("show", has);
  }

  function initSpaceIdInput(){
    var input = document.getElementById("spaceIdInput");
    if(!input) return;
    input.addEventListener("input", updateSpaceIdButtonState);
    input.addEventListener("keydown", function(e){
      if(e.key === "Enter"){
        e.preventDefault();
        if(input.value.trim().length > 0) document.getElementById("spaceIdNextBtn").click();
      }
    });
    updateSpaceIdButtonState();
  }

  // ---- real typing: any "タイトルを入力" placeholder is contenteditable;
  // Enter submits (blurs) instead of inserting a newline (titles are one line).
  // The recording screens' title also feeds a shared value: pausing (which
  // shows a different, static title-line screen) and stopping (which lands on
  // metadata-edit's own title field) should both reflect whatever was
  // actually typed, not silently revert to the Figma mock's "ミニマムプロジェクト".
  var currentRecordingTitle = "";
  function initEditableTitles(){
    document.addEventListener("keydown", function(e){
      if(e.key === "Enter" && e.target && e.target.isContentEditable){
        e.preventDefault();
        e.target.blur();
      }
    }, true);
    document.querySelectorAll(".title-placeholder[contenteditable], .title-line .title[contenteditable]").forEach(function(el){
      el.addEventListener("input", function(){
        currentRecordingTitle = el.textContent;
        // typing can push a title from one line to two, which changes the
        // title-row's natural height — drop the cached measurement and
        // reflow immediately so a wrap never clips against a stale value.
        var board = el.closest(".board");
        if(board){
          delete titleRowNaturalHeights[board.id.replace(/^scr-/, "")];
          applyHeaderProgress(board.id.replace(/^scr-/, ""));
        }
      });
    });
  }

  // recording-paused-transcript/recording-paused-loginfo's title is now also
  // a real contenteditable field (tapping the text OR the pencil icon both
  // let you type in place) — just keep it in sync with whatever was typed
  // anywhere else; the native [contenteditable]:empty:before placeholder
  // rule (base.css) handles the "タイトルを入力" display when it's blank.
  function syncStaticTitle(slug){
    var root = document.getElementById("scr-" + slug);
    var titleEl = root && root.querySelector(".title-line .title");
    if(titleEl) titleEl.textContent = currentRecordingTitle;
  }

  function syncMetadataEditTitle(){
    var titleEl = document.querySelector("#scr-metadata-edit .editable-title");
    if(titleEl && currentRecordingTitle) titleEl.textContent = currentRecordingTitle;
  }

  // recording-active/recording-offline-active/recording-offline-paused each
  // carry their OWN separate contenteditable title field (unlike the paused
  // "online" screens, which share one static span kept in sync via
  // syncStaticTitle). Switching between offline active<->paused is a real
  // navigation between two different DOM elements, so without this, a title
  // typed on one would appear to "disappear" on the other even though
  // currentRecordingTitle itself was never cleared.
  function syncEditableTitle(slug){
    var el = document.querySelector("#scr-" + slug + " .title-placeholder[contenteditable]");
    if(el) el.textContent = currentRecordingTitle;
  }

  // ---- scroll-driven header collapse: the title/workspace row shrinks away
  // and the tab bar sticks to the top once the transcript/log-info content
  // scrolls down; scrolling back to the top restores it. Figma ref: 5270:79859.
  // This tracks scrollTop directly (1:1, not a fixed on/off threshold) so the
  // header visibly rides up WITH the first bit of scrolling and only "sticks"
  // once fully collapsed, instead of sitting still and then snapping away.
  // 書き起こし/ログ情報 tabs are separate boards (separate .content scroll
  // positions), but conceptually share one header collapse state: scrolling
  // down on one tab and switching to the other should keep the header stuck,
  // not reset it to fully expanded just because the destination's own scroll
  // position happens to be 0.
  var sharedHeaderProgress = 0;
  // title-row's natural (uncollapsed) height can only be measured while the
  // board is visible (boards start display:none, so it can't be measured at
  // setup time) AND before any collapse has ever been applied to it (once
  // max-height:0 lands on this flex column, scrollHeight reports the
  // already-shrunk size, not the natural one — flex items shrink to fit a
  // constrained cross size). So it's measured lazily, exactly once, by
  // whichever of setupScrollCollapse/applyHeaderProgress touches this slug
  // first, and cached for the other to reuse safely forever after.
  var titleRowNaturalHeights = {};
  function getNaturalTitleRowHeight(slug, titleRow){
    if(titleRowNaturalHeights[slug] == null){
      var priorMaxHeight = titleRow.style.maxHeight;
      titleRow.style.maxHeight = "";
      titleRowNaturalHeights[slug] = titleRow.scrollHeight;
      titleRow.style.maxHeight = priorMaxHeight;
    }
    return titleRowNaturalHeights[slug];
  }

  // the "scroll to latest" FAB is about distance from the BOTTOM of the
  // transcript, which is a completely different thing from how far the
  // header has collapsed — a long transcript can be fully collapsed while
  // still scrolled miles away from the latest message. Keep them separate.
  function updateScrollToBottomFab(root, content){
    var fab = root.querySelector(".scroll-to-bottom");
    if(!fab) return;
    var distanceFromBottom = content.scrollHeight - content.scrollTop - content.clientHeight;
    fab.classList.toggle("show", distanceFromBottom > 40);
  }

  function setupScrollCollapse(slug){
    var root = document.getElementById("scr-" + slug);
    if(!root) return;
    var content = root.querySelector(".content");
    var header = root.querySelector(".header");
    var titleRow = header && header.querySelector(".title-row");
    if(!content || !header || !titleRow) return;
    content.addEventListener("scroll", function(){
      transcriptEverScrolled = true;
      var naturalHeight = getNaturalTitleRowHeight(slug, titleRow);
      var progress = Math.min(1, Math.max(0, content.scrollTop / naturalHeight));
      sharedHeaderProgress = progress;
      titleRow.style.maxHeight = progress <= 0 ? "" : ((1 - progress) * naturalHeight) + "px";
      titleRow.style.opacity = String(1 - progress);
      header.classList.toggle("collapsed", progress >= 1);
      updateScrollToBottomFab(root, content);
      if(slug === "recording-active" && (content.scrollHeight - content.scrollTop - content.clientHeight) < 40){
        isFollowingLatest = true;
      }
    });
    if(slug === "recording-active"){
      ["wheel", "touchstart"].forEach(function(evt){
        content.addEventListener(evt, function(){ isFollowingLatest = false; }, {passive: true});
      });
    }
  }

  function applyHeaderProgress(slug){
    var root = document.getElementById("scr-" + slug);
    if(!root) return;
    var content = root.querySelector(".content");
    var header = root.querySelector(".header");
    var titleRow = header && header.querySelector(".title-row");
    if(!content || !header || !titleRow) return;
    var naturalHeight = getNaturalTitleRowHeight(slug, titleRow);
    var progress = sharedHeaderProgress;
    titleRow.style.maxHeight = progress <= 0 ? "" : ((1 - progress) * naturalHeight) + "px";
    titleRow.style.opacity = String(1 - progress);
    header.classList.toggle("collapsed", progress >= 1);
    // recording-active/recording-paused-transcript hold a real (long)
    // transcript whose default position is "scrolled to the latest message",
    // not just "scrolled exactly as far as the collapse animation needs" —
    // forcing scrollTop to naturalHeight there would yank the view back up
    // to an arbitrary early point. recording-paused-loginfo has no such
    // content (its scroll range exists purely to drive this same gesture),
    // so keeping it pinned at naturalHeight keeps a re-expand swipe short.
    var isTranscript = slug === "recording-active" || slug === "recording-paused-transcript";
    if(progress >= 1 && isTranscript){
      content.scrollTop = Math.max(naturalHeight, content.scrollHeight - content.clientHeight);
    } else {
      content.scrollTop = progress * naturalHeight;
    }
    updateScrollToBottomFab(root, content);
  }

  // 書き起こし画面は「最新のメッセージが見えている」のが既定状態であるべき
  // （チャットアプリと同様）。一度でも本物のスクロール操作が行われたら、以降は
  // それ（と上の sharedHeaderProgress 経由の引き継ぎ）を尊重する。
  var transcriptEverScrolled = false;
  function ensureTranscriptDefaultScroll(slug){
    if(transcriptEverScrolled) return;
    var root = document.getElementById("scr-" + slug);
    var content = root && root.querySelector(".content");
    if(!content) return;
    transcriptEverScrolled = true;
    // a freshly-started recording has no content to scroll past yet — leave
    // the header visible until there's actually enough transcript to need
    // collapsing (appendLiveBubble's own "stick to bottom while following
    // live" logic naturally carries it into the collapsed state from there).
    if(content.scrollHeight > content.clientHeight){
      sharedHeaderProgress = 1;
      content.scrollTop = content.scrollHeight;
    }
  }

  function scrollContentToBottom(node){
    var board = node.closest(".board");
    var content = board && board.querySelector(".content");
    if(!content) return;
    if(board.id === "scr-recording-active") isFollowingLatest = true;
    content.scrollTo({top: content.scrollHeight, behavior: "smooth"});
  }

  var DESKTOP_BREAKPOINT = 640;
  var IS_COARSE_POINTER = (function(){
    try { return window.matchMedia("(pointer: coarse)").matches; } catch(e){ return false; }
  })();

  function fitStage(){
    var outer = document.getElementById("stageOuter");
    var app = document.getElementById("app");
    if(!outer || !app) return;

    var vw = window.innerWidth, vh = window.innerHeight;
    var isDesktop = vw >= DESKTOP_BREAKPOINT;
    var isMobileReal = !isDesktop && IS_COARSE_POINTER;
    document.body.classList.toggle("desktop-shell", isDesktop);
    document.body.classList.toggle("mobile-real", isMobileReal);

    if(isDesktop){
      var naturalW = 458, naturalH = 960;
      var scale = Math.min(1, (vw - 32) / naturalW);
      app.style.transform = "scale(" + scale + ")";
      app.style.transformOrigin = "top center";
      outer.style.width = Math.ceil(naturalW * scale) + "px";
      outer.style.height = Math.ceil(naturalH * scale) + "px";
    } else {
      // real phone: fill the actual screen, fit both dimensions, no bezel.
      // On a real touch device the OS status bar replaces our fake one, so
      // the visible board height shrinks from 932 to 881 (see shell.css).
      var naturalH2 = isMobileReal ? 881 : 932;
      var scale2 = Math.min(vw / 430, vh / naturalH2);
      app.style.transform = "scale(" + scale2 + ")";
      app.style.transformOrigin = "center center";
      outer.style.width = "100vw";
      outer.style.height = "100vh";
    }
  }

  function closeIndex(){ document.getElementById("indexOverlay").classList.remove("open"); }

  window.__proto = { goTo: goTo, goBack: goBack, goToRoot: goToRoot, jumpTo: jumpTo };
})();
