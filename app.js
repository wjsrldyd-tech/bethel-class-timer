(function () {
  "use strict";

  var STORAGE_KEY = "bethel-class-timer-v1";

  /** @typedef {{ id: string, title: string, presetSeconds: number }} TimerPreset */

  /** @type {TimerPreset[]} */
  var presets = [];

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
  var btnSettings = document.getElementById("btn-settings");
  var settingsModal = document.getElementById("settings-modal");
  var presetListEl = document.getElementById("preset-list");
  var presetApplyTarget = document.getElementById("preset-apply-target");
  var presetNewTitle = document.getElementById("preset-new-title");
  var presetNewMin = document.getElementById("preset-new-min");
  var presetNewSec = document.getElementById("preset-new-sec");
  var presetAddBtn = document.getElementById("preset-add-btn");
  var settingsCloseBtn = document.getElementById("settings-close-btn");

  /** @type {number | null} */
  var editTargetIndex = null;

  function getDefaultPresets() {
    return [
      { id: "default-h", title: "고등 모의 시험", presetSeconds: 6000 },
      { id: "default-m", title: "중등 모의 시험", presetSeconds: 5400 },
      { id: "default-s", title: "학력평가", presetSeconds: 2700 },
    ];
  }

  function generatePresetId() {
    return "p_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
  }

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

  function persist() {
    try {
      var payload = {
        timerCount: timerCount,
        presets: presets,
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
      if (Array.isArray(data.presets)) {
        presets = data.presets.filter(function (p) {
          return (
            p &&
            typeof p.id === "string" &&
            typeof p.title === "string" &&
            typeof p.presetSeconds === "number" &&
            p.presetSeconds >= 1
          );
        });
      } else {
        presets = getDefaultPresets();
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
   * @type {Record<string, ReturnType<typeof setTimeout> | null>}
   */
  var startBurstTimeouts = {};

  /**
   * 시작 전광 애니메이션 중단 (재설정 등)
   * @param {Element | null} card
   */
  function cancelStartBurst(card) {
    if (!card) return;
    var key = card.getAttribute("data-index") || "0";
    if (startBurstTimeouts[key]) {
      clearTimeout(startBurstTimeouts[key]);
      startBurstTimeouts[key] = null;
    }
    card.classList.remove("timer-card--start-burst");
  }

  function resetTimer(index) {
    cancelStartBurst(cards[index]);
    var t = timers[index];
    t.endAt = null;
    t.remainingSeconds = t.presetSeconds;
    lastFormatted[index] = "";
    syncCard(index);
    persist();
  }

  /**
   * 시작 버튼으로 타이머가 돌아가기 시작할 때만, 시각 효과 (CSS 애니메이션 길이와 동일)
   * @param {Element} card
   */
  function triggerStartBurst(card) {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    cancelStartBurst(card);
    var key = card.getAttribute("data-index") || "0";
    void card.offsetWidth;
    card.classList.add("timer-card--start-burst");
    startBurstTimeouts[key] = setTimeout(function () {
      card.classList.remove("timer-card--start-burst");
      startBurstTimeouts[key] = null;
    }, 6000);
  }

  function toggleTimer(index) {
    var t = timers[index];
    var sec = getSecondsRemaining(t);
    if (t.endAt !== null) {
      cancelStartBurst(cards[index]);
      t.remainingSeconds = sec;
      t.endAt = null;
    } else {
      if (sec <= 0) {
        t.remainingSeconds = t.presetSeconds;
        sec = t.presetSeconds;
      }
      t.endAt = Date.now() + sec * 1000;
      if (cards[index]) triggerStartBurst(cards[index]);
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

  function renderPresetList() {
    if (!presetListEl) return;
    presetListEl.innerHTML = "";
    if (presets.length === 0) {
      var empty = document.createElement("li");
      empty.className = "preset-item";
      empty.textContent = "저장된 프리셋이 없습니다. 아래에서 추가하세요.";
      empty.style.color = "var(--muted)";
      presetListEl.appendChild(empty);
      return;
    }
    presets.forEach(function (p) {
      var li = document.createElement("li");
      li.className = "preset-item";

      var name = document.createElement("span");
      name.className = "preset-item__name";
      name.textContent = p.title;

      var time = document.createElement("span");
      time.className = "preset-item__time";
      time.textContent = formatMMSS(p.presetSeconds);

      var actions = document.createElement("div");
      actions.className = "preset-item__actions";

      var btnApply = document.createElement("button");
      btnApply.type = "button";
      btnApply.className = "preset-item__btn preset-item__btn--apply";
      btnApply.textContent = "적용";
      btnApply.setAttribute("data-preset-apply", p.id);

      var btnDel = document.createElement("button");
      btnDel.type = "button";
      btnDel.className = "preset-item__btn preset-item__btn--del";
      btnDel.textContent = "삭제";
      btnDel.setAttribute("data-preset-delete", p.id);

      actions.appendChild(btnApply);
      actions.appendChild(btnDel);
      li.appendChild(name);
      li.appendChild(time);
      li.appendChild(actions);
      presetListEl.appendChild(li);
    });
  }

  function applyPresetToTimer(presetId) {
    var p = null;
    for (var i = 0; i < presets.length; i++) {
      if (presets[i].id === presetId) {
        p = presets[i];
        break;
      }
    }
    if (!p || !presetApplyTarget) return;
    var ti = clamp(parseInt(presetApplyTarget.value, 10) || 0, 0, 2);
    var t = timers[ti];
    t.title = p.title;
    t.presetSeconds = p.presetSeconds;
    t.endAt = null;
    t.remainingSeconds = p.presetSeconds;
    lastFormatted[ti] = "";
    syncCard(ti);
    persist();
  }

  function deletePreset(presetId) {
    presets = presets.filter(function (x) {
      return x.id !== presetId;
    });
    persist();
    renderPresetList();
  }

  function addPresetFromForm() {
    if (!presetNewTitle || !presetNewMin || !presetNewSec) return;
    var title = (presetNewTitle.value || "").trim();
    if (!title) {
      window.alert("이름을 입력하세요.");
      presetNewTitle.focus();
      return;
    }
    var m = clamp(parseInt(presetNewMin.value, 10) || 0, 0, 599);
    var s = clamp(parseInt(presetNewSec.value, 10) || 0, 0, 59);
    var total = m * 60 + s;
    if (total < 1) total = 1;
    presets.push({ id: generatePresetId(), title: title, presetSeconds: total });
    presetNewTitle.value = "";
    presetNewMin.value = "50";
    presetNewSec.value = "0";
    persist();
    renderPresetList();
  }

  function openSettingsModal() {
    if (!settingsModal) return;
    renderPresetList();
    settingsModal.hidden = false;
    if (presetNewTitle) presetNewTitle.focus();
  }

  function closeSettingsModal() {
    if (!settingsModal) return;
    settingsModal.hidden = true;
  }

  if (presetListEl) {
    presetListEl.addEventListener("click", function (e) {
      var applyBtn = e.target.closest("[data-preset-apply]");
      var delBtn = e.target.closest("[data-preset-delete]");
      if (applyBtn) {
        applyPresetToTimer(applyBtn.getAttribute("data-preset-apply"));
      } else if (delBtn) {
        deletePreset(delBtn.getAttribute("data-preset-delete"));
      }
    });
  }

  if (btnSettings) {
    btnSettings.addEventListener("click", openSettingsModal);
  }
  if (settingsCloseBtn) {
    settingsCloseBtn.addEventListener("click", closeSettingsModal);
  }
  if (settingsModal) {
    settingsModal.querySelectorAll("[data-close-settings]").forEach(function (el) {
      el.addEventListener("click", closeSettingsModal);
    });
    settingsModal.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeSettingsModal();
    });
  }
  if (presetAddBtn) {
    presetAddBtn.addEventListener("click", addPresetFromForm);
  }

  load();
  setTimerCount(timerCount);
  for (var j = 0; j < 3; j++) {
    lastFormatted[j] = "";
    syncCard(j);
  }
  updateFullscreenUi();
  requestAnimationFrame(tick);
})();
