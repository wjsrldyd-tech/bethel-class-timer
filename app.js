(function () {
  "use strict";

  var STORAGE_KEY = "bethel-class-timer-v1";

  var displayScale = 1;
  var DISPLAY_SCALE_MIN = 0.65;
  var DISPLAY_SCALE_MAX = 1.45;
  var DISPLAY_SCALE_STEP = 0.07;

  /** @typedef {{ title: string, presetSeconds: number, endAt: number | null, remainingSeconds: number }} TimerState */

  /** @type {TimerState[]} */
  var timers = [
    { title: "", presetSeconds: 600, endAt: null, remainingSeconds: 600 },
    { title: "", presetSeconds: 600, endAt: null, remainingSeconds: 600 },
    { title: "", presetSeconds: 600, endAt: null, remainingSeconds: 600 },
  ];

  /** @type {1 | 2 | 3} */
  var timerCount = 1;

  var appRoot = document.querySelector(".app");
  var grid = document.getElementById("timer-grid");
  var cards = document.querySelectorAll(".timer-card");
  var countButtons = document.querySelectorAll(".count-btn");

  var modal = document.getElementById("edit-modal");
  var editMin = document.getElementById("edit-min");
  var editSec = document.getElementById("edit-sec");
  var editSave = document.getElementById("edit-save");
  var editCancel = document.getElementById("edit-cancel");
  var btnFullscreen = document.getElementById("btn-fullscreen");
  var btnZoomIn = document.getElementById("btn-zoom-in");
  var btnZoomOut = document.getElementById("btn-zoom-out");

  /** @type {number | null} */
  var editTargetIndex = null;

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  /**
   * @param {TimerState} t
   * @returns {number}
   */
  function getSecondsRemaining(t) {
    if (t.endAt !== null) {
      var ms = t.endAt - Date.now();
      return Math.max(0, Math.ceil(ms / 1000));
    }
    return t.remainingSeconds;
  }

  /**
   * @param {number} totalSec
   * @returns {string}
   */
  function formatMMSS(totalSec) {
    var s = Math.max(0, Math.floor(totalSec));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return String(m).padStart(2, "0") + ":" + String(r).padStart(2, "0");
  }

  function applyDisplayScale() {
    document.documentElement.style.setProperty("--timer-display-scale", String(displayScale));
  }

  function persist() {
    try {
      var payload = {
        timerCount: timerCount,
        displayScale: displayScale,
        timers: timers.map(function (t) {
          return {
            title: t.title,
            presetSeconds: t.presetSeconds,
            endAt: t.endAt,
            remainingSeconds: t.endAt !== null ? getSecondsRemaining(t) : t.remainingSeconds,
          };
        }),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      /* ignore */
    }
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (data.timerCount === 1 || data.timerCount === 2 || data.timerCount === 3) {
        timerCount = data.timerCount;
      }
      if (typeof data.displayScale === "number" && data.displayScale >= DISPLAY_SCALE_MIN && data.displayScale <= DISPLAY_SCALE_MAX) {
        displayScale = data.displayScale;
      }
      if (Array.isArray(data.timers)) {
        for (var i = 0; i < 3 && i < data.timers.length; i++) {
          var d = data.timers[i];
          if (typeof d.presetSeconds === "number" && d.presetSeconds >= 0) {
            timers[i].presetSeconds = d.presetSeconds;
          }
          if (typeof d.title === "string") timers[i].title = d.title;
          if (d.endAt != null && typeof d.endAt === "number") {
            if (d.endAt > Date.now()) {
              timers[i].endAt = d.endAt;
              timers[i].remainingSeconds =
                typeof d.remainingSeconds === "number" ? d.remainingSeconds : timers[i].presetSeconds;
            } else {
              timers[i].endAt = null;
              timers[i].remainingSeconds = 0;
            }
          } else {
            timers[i].endAt = null;
            if (typeof d.remainingSeconds === "number" && d.remainingSeconds >= 0) {
              timers[i].remainingSeconds = d.remainingSeconds;
            } else {
              timers[i].remainingSeconds = timers[i].presetSeconds;
            }
          }
        }
      }
    } catch (e) {
      /* ignore */
    }
  }

  /**
   * @param {number} index
   */
  function syncCard(index) {
    var card = cards[index];
    if (!card) return;
    var t = timers[index];
    var display = card.querySelector(".timer-display");
    var titleInput = card.querySelector(".timer-title");
    var toggleBtn = card.querySelector(".btn-toggle");

    display.textContent = formatMMSS(getSecondsRemaining(t));
    titleInput.value = t.title;

    toggleBtn.textContent = t.endAt !== null ? "중지" : "시작";
    toggleBtn.classList.remove("is-running", "is-paused");
    if (t.endAt !== null) {
      toggleBtn.classList.add("is-running");
    } else if (getSecondsRemaining(t) > 0) {
      toggleBtn.classList.add("is-paused");
    }
    card.classList.toggle("finished", false);
  }

  var lastFormatted = ["", "", ""];

  function tick() {
    for (var i = 0; i < 3; i++) {
      var t = timers[i];
      if (t.endAt !== null && Date.now() >= t.endAt) {
        t.endAt = null;
        t.remainingSeconds = 0;
        var c = cards[i];
        c.classList.remove("finished");
        void c.offsetWidth;
        c.classList.add("finished");
        c.addEventListener(
          "animationend",
          function onEnd() {
            c.classList.remove("finished");
            c.removeEventListener("animationend", onEnd);
          },
          { once: true }
        );
        persist();
      }
      var sec = getSecondsRemaining(t);
      var fmt = formatMMSS(sec);
      if (fmt !== lastFormatted[i]) {
        lastFormatted[i] = fmt;
        var display = cards[i].querySelector(".timer-display");
        display.textContent = fmt;
        var toggleBtn = cards[i].querySelector(".btn-toggle");
        toggleBtn.textContent = t.endAt !== null ? "중지" : "시작";
        toggleBtn.classList.toggle("is-running", t.endAt !== null);
        toggleBtn.classList.toggle("is-paused", t.endAt === null && sec > 0);
      }
    }
    requestAnimationFrame(tick);
  }

  /**
   * @param {number} index
   */
  function openEditModal(index) {
    editTargetIndex = index;
    var t = timers[index];
    var total = t.endAt !== null ? getSecondsRemaining(t) : t.remainingSeconds;
    var m = Math.floor(total / 60);
    var s = total % 60;
    editMin.value = String(m);
    editSec.value = String(s);
    modal.hidden = false;
    editMin.focus();
  }

  function closeEditModal() {
    modal.hidden = true;
    editTargetIndex = null;
  }

  function applyEditFromModal() {
    if (editTargetIndex === null) return;
    var m = clamp(parseInt(editMin.value, 10) || 0, 0, 599);
    var s = clamp(parseInt(editSec.value, 10) || 0, 0, 59);
    var total = m * 60 + s;
    if (total <= 0) total = 1;

    var t = timers[editTargetIndex];
    t.endAt = null;
    t.presetSeconds = total;
    t.remainingSeconds = total;
    lastFormatted[editTargetIndex] = "";
    syncCard(editTargetIndex);
    persist();
    closeEditModal();
  }

  /**
   * @param {number} index
   */
  function resetTimer(index) {
    var t = timers[index];
    t.endAt = null;
    t.remainingSeconds = t.presetSeconds;
    lastFormatted[index] = "";
    syncCard(index);
    persist();
  }

  /**
   * @param {number} index
   */
  function toggleTimer(index) {
    var t = timers[index];
    var sec = getSecondsRemaining(t);
    if (t.endAt !== null) {
      t.remainingSeconds = sec;
      t.endAt = null;
    } else {
      if (sec <= 0) {
        t.remainingSeconds = t.presetSeconds;
        sec = t.presetSeconds;
      }
      t.endAt = Date.now() + sec * 1000;
    }
    lastFormatted[index] = "";
    syncCard(index);
    persist();
  }

  function setTimerCount(count) {
    timerCount = count;
    grid.classList.toggle("count-1", count === 1);
    grid.classList.toggle("count-2", count === 2);
    grid.classList.toggle("count-3", count === 3);
    if (appRoot) appRoot.classList.toggle("app--single", count === 1);
    countButtons.forEach(function (btn) {
      var c = parseInt(btn.getAttribute("data-count"), 10);
      btn.setAttribute("aria-pressed", c === count ? "true" : "false");
    });
    persist();
  }

  function bindCard(card, index) {
    card.querySelector(".timer-title").addEventListener("change", function () {
      timers[index].title = card.querySelector(".timer-title").value;
      persist();
    });
    card.querySelector(".timer-title").addEventListener("blur", function () {
      timers[index].title = card.querySelector(".timer-title").value;
      persist();
    });

    card.addEventListener("click", function (e) {
      var btn = e.target.closest("button");
      if (!btn) return;
      var action = btn.getAttribute("data-action");
      if (action === "edit") openEditModal(index);
      else if (action === "reset") resetTimer(index);
      else if (action === "toggle") toggleTimer(index);
    });
  }

  cards.forEach(function (card, i) {
    bindCard(card, i);
  });

  countButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var c = parseInt(btn.getAttribute("data-count"), 10);
      if (c === 1 || c === 2 || c === 3) setTimerCount(c);
    });
  });

  editSave.addEventListener("click", applyEditFromModal);
  editCancel.addEventListener("click", closeEditModal);
  modal.querySelector("[data-close-modal]").addEventListener("click", closeEditModal);

  [editMin, editSec].forEach(function (el) {
    el.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        applyEditFromModal();
      }
    });
  });

  modal.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeEditModal();
  });

  function getFullscreenElement() {
    return (
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.msFullscreenElement ||
      null
    );
  }

  function isAppFullscreen() {
    return getFullscreenElement() === appRoot;
  }

  function enterFullscreen() {
    if (!appRoot) return;
    var req = appRoot.requestFullscreen || appRoot.webkitRequestFullscreen || appRoot.msRequestFullscreen;
    if (req) {
      var p = req.call(appRoot);
      if (p && typeof p.catch === "function") p.catch(function () {});
    }
  }

  function exitFullscreen() {
    var ex = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
    if (ex) {
      var p = ex.call(document);
      if (p && typeof p.catch === "function") p.catch(function () {});
    }
  }

  function updateFullscreenUi() {
    var active = isAppFullscreen();
    if (appRoot) appRoot.classList.toggle("is-fs-active", active);
    if (!btnFullscreen) return;
    var iconEnter = btnFullscreen.querySelector(".icon-fs-enter");
    var iconExit = btnFullscreen.querySelector(".icon-fs-exit");
    if (iconEnter) iconEnter.hidden = active;
    if (iconExit) iconExit.hidden = !active;
    btnFullscreen.setAttribute("aria-pressed", active ? "true" : "false");
    btnFullscreen.setAttribute("aria-label", active ? "전체 화면 종료" : "전체 화면");
    btnFullscreen.title = active ? "전체 화면 종료" : "전체 화면";
  }

  if (btnFullscreen && appRoot) {
    btnFullscreen.addEventListener("click", function () {
      if (isAppFullscreen()) exitFullscreen();
      else enterFullscreen();
    });
    document.addEventListener("fullscreenchange", updateFullscreenUi);
    document.addEventListener("webkitfullscreenchange", updateFullscreenUi);
    document.addEventListener("MSFullscreenChange", updateFullscreenUi);
  }

  if (btnZoomIn && btnZoomOut) {
    btnZoomIn.addEventListener("click", function () {
      displayScale = clamp(displayScale + DISPLAY_SCALE_STEP, DISPLAY_SCALE_MIN, DISPLAY_SCALE_MAX);
      applyDisplayScale();
      persist();
    });
    btnZoomOut.addEventListener("click", function () {
      displayScale = clamp(displayScale - DISPLAY_SCALE_STEP, DISPLAY_SCALE_MIN, DISPLAY_SCALE_MAX);
      applyDisplayScale();
      persist();
    });
  }

  load();
  applyDisplayScale();
  setTimerCount(timerCount);
  for (var j = 0; j < 3; j++) {
    lastFormatted[j] = "";
    syncCard(j);
  }
  updateFullscreenUi();
  requestAnimationFrame(tick);
})();
