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

  var TAB_TITLE_BASE = "벧엘 타이머";
  var lastTabTitle = "";

  /** @type {(number | null)[]} */
  var lastSecondsRemaining = [null, null, null];

  /** @type {boolean[]} */
  var pendingStart = [false, false, false];

  /** @type {({ alarm?: HTMLAudioElement, voice?: HTMLAudioElement } | HTMLAudioElement | null)[]} */
  var startNarrationAudio = [null, null, null];

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
  var btnPresets = document.getElementById("btn-presets");
  var btnSettings = document.getElementById("btn-settings");
  var settingsModal = document.getElementById("settings-modal");
  var presetListEl = document.getElementById("preset-list");
  var presetApplyTarget = document.getElementById("preset-apply-target");
  var presetNewTitle = document.getElementById("preset-new-title");
  var presetNewMin = document.getElementById("preset-new-min");
  var presetNewSec = document.getElementById("preset-new-sec");
  var presetAddBtn = document.getElementById("preset-add-btn");
  var settingsCloseBtn = document.getElementById("settings-close-btn");
  var timerTitleTarget = document.getElementById("timer-title-target");
  var timerTitleInput = document.getElementById("timer-title-input");
  var timerTitleSaveBtn = document.getElementById("timer-title-save-btn");

  var presetPickerModal = document.getElementById("preset-picker-modal");
  var presetPickerListEl = document.getElementById("preset-picker-list");
  var presetPickerTarget = document.getElementById("preset-picker-target");
  var presetPickerCloseBtn = document.getElementById("preset-picker-close-btn");
  var presetPickerManageBtn = document.getElementById("preset-picker-manage-btn");

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

  /**
   * @param {Date} d
   * @returns {string}
   */
  function formatHHMM(d) {
    var h24 = d.getHours();
    var mm = String(d.getMinutes()).padStart(2, "0");
    var ampm = h24 >= 12 ? "PM" : "AM";
    var h12 = h24 % 12;
    if (h12 === 0) h12 = 12;
    return ampm + " " + String(h12) + ":" + mm;
  }

  function syncTabTitle() {
    var now = new Date();
    var next = TAB_TITLE_BASE + " · " + formatHHMM(now);
    if (next !== lastTabTitle) {
      document.title = next;
      lastTabTitle = next;
    }
  }

  /**
   * @param {string} src
   * @param {number} volume
   */
  function playAudio(src, volume) {
    try {
      var a = new Audio(src);
      a.volume = clamp(volume, 0, 1);
      var p = a.play();
      if (p && typeof p.catch === "function") p.catch(function () {});
    } catch (e) {
      /* ignore */
    }
  }

  /**
   * 알람 후 음성. 나레이션(알람+음성)이 끝날 때까지 해당 카드에 전광(timer-card--start-burst).
   * ended 이벤트가 발화되지 않는 기기(삼성 전자칠판 등 Android 브라우저)를 위해
   * 타임아웃 폴백을 사용하며, 중복 호출 방지 플래그로 PC 동작에 영향을 주지 않는다.
   * @param {string} voiceSrc
   * @param {number} volume
   * @param {Element | null} [card]
   * @param {{ narrationSlot?: number, onVoiceEnded?: () => void }} [opts]
   */
  function playAlarmThenVoice(voiceSrc, volume, card, opts) {
    opts = opts || {};
    var narrationSlot = opts.narrationSlot;
    var onVoiceEnded = opts.onVoiceEnded;
    var v = clamp(volume, 0, 1);
    if (card) triggerStartBurst(card);

    // 중복 호출 방지 플래그
    var voicePlayed = false;
    var burstEnded = false;
    var alarmFallbackTimer = null;
    var voiceFallbackTimer = null;

    function endBurst() {
      if (burstEnded) return;
      burstEnded = true;
      clearTimeout(voiceFallbackTimer);
      if (card) cancelStartBurst(card);
      if (narrationSlot !== undefined) startNarrationAudio[narrationSlot] = null;
      if (onVoiceEnded) onVoiceEnded();
    }

    function playVoice() {
      if (voicePlayed) return;
      voicePlayed = true;
      clearTimeout(alarmFallbackTimer);
      try {
        var voice = new Audio(voiceSrc);
        voice.volume = v;
        if (narrationSlot !== undefined) {
          var b = startNarrationAudio[narrationSlot] || {};
          b.voice = voice;
          startNarrationAudio[narrationSlot] = b;
        }
        // 음성 ended 이벤트 미발화 대비 폴백 (30초)
        voiceFallbackTimer = setTimeout(endBurst, 30000);
        if (narrationSlot !== undefined && startNarrationAudio[narrationSlot]) {
          startNarrationAudio[narrationSlot].voiceFallback = voiceFallbackTimer;
        }
        voice.addEventListener("ended", endBurst);
        voice.addEventListener("error", endBurst);
        var pv = voice.play();
        if (pv && typeof pv.catch === "function") pv.catch(endBurst);
      } catch (e) {
        endBurst();
      }
    }

    try {
      var alarm = new Audio("assets/audio/alam.mp3");
      alarm.volume = v;
      var bundle = { alarm: alarm };
      if (narrationSlot !== undefined) {
        startNarrationAudio[narrationSlot] = bundle;
      }
      // alam.mp3 재생 후 ended 이벤트 미발화 대비 폴백 (5초)
      alarmFallbackTimer = setTimeout(playVoice, 5000);
      bundle.alarmFallback = alarmFallbackTimer;
      alarm.addEventListener("ended", playVoice);
      alarm.addEventListener("error", playVoice);
      var p = alarm.play();
      if (p && typeof p.catch === "function") p.catch(playVoice);
    } catch (e) {
      playVoice();
    }
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
    if (titleInput) titleInput.textContent = t.title || "";

    toggleBtn.textContent = pendingStart[index] ? "준비중" : t.endAt !== null ? "중지" : "시작";
    toggleBtn.classList.remove("is-running", "is-paused");
    if (t.endAt !== null) {
      toggleBtn.classList.add("is-running");
    } else if (getSecondsRemaining(t) > 0) {
      toggleBtn.classList.add("is-paused");
    }
  }

  var lastFormatted = ["", "", ""];

  function tick() {
    syncTabTitle();
    for (var i = 0; i < 3; i++) {
      var t = timers[i];
      var secNow = getSecondsRemaining(t);
      var prevSec = lastSecondsRemaining[i];

      if (t.endAt !== null && prevSec !== null) {
        if (prevSec > 20 * 60 && secNow <= 20 * 60)
          playAlarmThenVoice("assets/audio/20m.mp3", 0.9, cards[i]);
        if (prevSec > 10 * 60 && secNow <= 10 * 60)
          playAlarmThenVoice("assets/audio/10m.mp3", 0.9, cards[i]);
        if (prevSec > 5 * 60 && secNow <= 5 * 60)
          playAlarmThenVoice("assets/audio/5m.mp3", 0.9, cards[i]);
      }

      if (t.endAt !== null && Date.now() >= t.endAt) {
        t.endAt = null;
        t.remainingSeconds = 0;
        playAlarmThenVoice("assets/audio/exam-end.mp3", 0.9, cards[i]);
        persist();
      }
      var sec = secNow;
      var fmt = formatMMSS(sec);
      if (fmt !== lastFormatted[i]) {
        lastFormatted[i] = fmt;
        var display = cards[i].querySelector(".timer-display");
        display.textContent = fmt;
        var toggleBtn = cards[i].querySelector(".btn-toggle");
        toggleBtn.textContent = pendingStart[i] ? "준비중" : t.endAt !== null ? "중지" : "시작";
        toggleBtn.classList.toggle("is-running", t.endAt !== null);
        toggleBtn.classList.toggle("is-paused", t.endAt === null && sec > 0);
      }

      lastSecondsRemaining[i] = sec;
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
   * 시험 시작 나래이션(exam-start) 재생 중이면 중단
   * @param {number} index
   */
  function stopStartNarration(index) {
    var bundle = startNarrationAudio[index];
    startNarrationAudio[index] = null;
    if (!bundle) return;
    try {
      if (bundle.alarmFallback) clearTimeout(bundle.alarmFallback);
      if (bundle.voiceFallback) clearTimeout(bundle.voiceFallback);
      if (bundle.alarm) {
        bundle.alarm.pause();
        bundle.alarm.currentTime = 0;
      }
      if (bundle.voice) {
        bundle.voice.pause();
        bundle.voice.currentTime = 0;
      }
      if (typeof bundle.pause === "function") {
        bundle.pause();
        bundle.currentTime = 0;
      }
    } catch (e) {
      /* ignore */
    }
  }

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
    stopStartNarration(index);
    pendingStart[index] = false;
    cancelStartBurst(cards[index]);
    var t = timers[index];
    t.endAt = null;
    t.remainingSeconds = t.presetSeconds;
    lastFormatted[index] = "";
    lastSecondsRemaining[index] = t.remainingSeconds;
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
    }, 20000);
  }

  function toggleTimer(index) {
    var t = timers[index];
    var sec = getSecondsRemaining(t);
    if (t.endAt !== null) {
      cancelStartBurst(cards[index]);
      t.remainingSeconds = sec;
      t.endAt = null;
      lastSecondsRemaining[index] = t.remainingSeconds;
      pendingStart[index] = false;
    } else {
      if (pendingStart[index]) return;
      if (sec <= 0) {
        t.remainingSeconds = t.presetSeconds;
        sec = t.presetSeconds;
      }

      pendingStart[index] = true;
      lastFormatted[index] = "";
      syncCard(index);

      try {
        playAlarmThenVoice("assets/audio/exam-start.mp3", 0.8, cards[index], {
          narrationSlot: index,
          onVoiceEnded: function () {
            pendingStart[index] = false;
            t.endAt = Date.now() + sec * 1000;
            lastFormatted[index] = "";
            syncCard(index);
            persist();
          },
        });
      } catch (e) {
        startNarrationAudio[index] = null;
        pendingStart[index] = false;
        cancelStartBurst(cards[index]);
        t.endAt = Date.now() + sec * 1000;
        lastFormatted[index] = "";
        syncCard(index);
        persist();
      }
      return;
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
    syncApplyTargetOptions(presetApplyTarget);
    syncApplyTargetOptions(presetPickerTarget);
    persist();
  }

  function bindCard(card, index) {
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
    if (appRoot) {
      appRoot.classList.toggle("is-menu-visible", false);
    }
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

  if (appRoot) {
    appRoot.addEventListener("click", function (e) {
      if (!isAppFullscreen()) return;
      if (!appRoot) return;

      // 버튼/입력 등 조작 요소 클릭은 메뉴 토글하지 않음
      if (
        e.target.closest("button") ||
        e.target.closest("input") ||
        e.target.closest("select") ||
        e.target.closest("textarea") ||
        e.target.closest("a") ||
        e.target.closest("label")
      ) {
        return;
      }

      // 모달이 열려 있을 땐 토글하지 않음
      if (e.target.closest(".modal") && !e.target.closest(".modal[hidden]")) return;

      appRoot.classList.toggle("is-menu-visible");
    });
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

  /**
   * @param {HTMLSelectElement | null} selectEl
   */
  function syncApplyTargetOptions(selectEl) {
    if (!selectEl) return;
    for (var i = 0; i < 3; i++) {
      var opt = selectEl.querySelector('option[value="' + i + '"]');
      if (!opt) continue;
      var enabled = i < timerCount;
      opt.disabled = !enabled;
      opt.hidden = !enabled;
    }
    var current = clamp(parseInt(selectEl.value, 10) || 0, 0, 2);
    if (current >= timerCount) selectEl.value = "0";
  }

  /**
   * @param {string} presetId
   * @param {number} targetIndex
   */
  function applyPresetToTimerIndex(presetId, targetIndex) {
    var p = null;
    for (var i = 0; i < presets.length; i++) {
      if (presets[i].id === presetId) {
        p = presets[i];
        break;
      }
    }
    if (!p) return;
    var ti = clamp(targetIndex, 0, 2);
    var t = timers[ti];
    t.title = p.title;
    t.presetSeconds = p.presetSeconds;
    t.endAt = null;
    t.remainingSeconds = p.presetSeconds;
    lastFormatted[ti] = "";
    syncCard(ti);
    persist();
  }

  function applyPresetToTimer(presetId) {
    if (!presetApplyTarget) return;
    syncApplyTargetOptions(presetApplyTarget);
    var ti = clamp(parseInt(presetApplyTarget.value, 10) || 0, 0, 2);
    applyPresetToTimerIndex(presetId, ti);
  }

  function renderPresetPickerList() {
    if (!presetPickerListEl) return;
    presetPickerListEl.innerHTML = "";
    if (presets.length === 0) {
      var empty = document.createElement("li");
      empty.className = "preset-item";
      empty.textContent = "저장된 프리셋이 없습니다. 설정에서 추가하세요.";
      empty.style.color = "var(--muted)";
      presetPickerListEl.appendChild(empty);
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
      btnApply.setAttribute("data-picker-apply", p.id);

      actions.appendChild(btnApply);
      li.appendChild(name);
      li.appendChild(time);
      li.appendChild(actions);
      presetPickerListEl.appendChild(li);
    });
  }

  function openPresetPickerModal() {
    if (!presetPickerModal) return;
    syncApplyTargetOptions(presetPickerTarget);
    renderPresetPickerList();
    presetPickerModal.hidden = false;
    if (presetPickerTarget) presetPickerTarget.focus();
  }

  function closePresetPickerModal() {
    if (!presetPickerModal) return;
    presetPickerModal.hidden = true;
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
    syncApplyTargetOptions(presetApplyTarget);
    syncApplyTargetOptions(timerTitleTarget);
    if (timerTitleInput && timerTitleTarget) {
      var ti = clamp(parseInt(timerTitleTarget.value, 10) || 0, 0, 2);
      timerTitleInput.value = timers[ti].title || "";
    }
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

  if (presetPickerListEl) {
    presetPickerListEl.addEventListener("click", function (e) {
      var applyBtn = e.target.closest("[data-picker-apply]");
      if (!applyBtn) return;
      var presetId = applyBtn.getAttribute("data-picker-apply");
      if (!presetId) return;
      syncApplyTargetOptions(presetPickerTarget);
      var ti = presetPickerTarget ? clamp(parseInt(presetPickerTarget.value, 10) || 0, 0, 2) : 0;
      applyPresetToTimerIndex(presetId, ti);
      closePresetPickerModal();
    });
  }

  if (btnPresets) {
    btnPresets.addEventListener("click", openPresetPickerModal);
  }
  if (presetPickerCloseBtn) {
    presetPickerCloseBtn.addEventListener("click", closePresetPickerModal);
  }
  if (presetPickerManageBtn) {
    presetPickerManageBtn.addEventListener("click", function () {
      closePresetPickerModal();
      openSettingsModal();
    });
  }
  if (presetPickerModal) {
    presetPickerModal.querySelectorAll("[data-close-preset-picker]").forEach(function (el) {
      el.addEventListener("click", closePresetPickerModal);
    });
    presetPickerModal.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closePresetPickerModal();
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
  if (timerTitleTarget && timerTitleInput) {
    timerTitleTarget.addEventListener("change", function () {
      syncApplyTargetOptions(timerTitleTarget);
      var ti = clamp(parseInt(timerTitleTarget.value, 10) || 0, 0, 2);
      timerTitleInput.value = timers[ti].title || "";
    });
  }
  if (timerTitleSaveBtn && timerTitleTarget && timerTitleInput) {
    timerTitleSaveBtn.addEventListener("click", function () {
      syncApplyTargetOptions(timerTitleTarget);
      var ti = clamp(parseInt(timerTitleTarget.value, 10) || 0, 0, 2);
      timers[ti].title = (timerTitleInput.value || "").trim();
      syncCard(ti);
      persist();
    });
  }

  load();
  syncTabTitle();
  setTimerCount(timerCount);
  for (var j = 0; j < 3; j++) {
    lastFormatted[j] = "";
    lastSecondsRemaining[j] = getSecondsRemaining(timers[j]);
    syncCard(j);
  }
  updateFullscreenUi();
  requestAnimationFrame(tick);
})();
