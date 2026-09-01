/**
 * ui.js — DOM 渲染（浏览器）
 *
 * 对应文档：docs/tech-design.md §5.5、§10
 * 职责：把 session + settings 渲染到页面；不含业务逻辑。
 */
(function (root) {
  'use strict';

  var PHASE_LABEL = {
    INHALE: '吸气',
    HOLD: '屏息',
    EXHALE: '呼气',
    REST: '休息',
  };

  var PHASE_SUB = {
    INHALE: '缓缓吸气',
    HOLD: '屏住呼吸',
    EXHALE: '缓缓呼气',
    REST: '请休息',
  };

  var RING_LEN = 741.42; // 2π × 118

  var el = {
    guide: null, ringProgress: null, phaseName: null, phaseSub: null, phaseRemain: null,
    btnStart: null, btnPause: null, btnResume: null, btnStop: null,
    statCycles: null, statElapsed: null,
  };

  function $(id) { return document.getElementById(id); }

  function cache() {
    if (el.guide) return;
    el.guide = $('guide-ring').parentElement;
    el.ringProgress = $('ring-progress');
    el.phaseName = $('phase-name');
    el.phaseSub = $('phase-sub');
    el.phaseRemain = $('phase-remain');
    el.btnStart = $('btn-start');
    el.btnPause = $('btn-pause');
    el.btnResume = $('btn-resume');
    el.btnStop = $('btn-stop');
    el.statCycles = $('stat-cycles');
    el.statElapsed = $('stat-elapsed');
  }

  /** 渲染引导区 + 统计 + 控制按钮（tick 中高频调用，保持轻量） */
  function renderSession(session, settings, now) {
    cache();
    var status = session.status;
    var isRunning = status === 'RUNNING';
    var isPaused = status === 'PAUSED';

    // 相位展示
    if (status === 'IDLE') {
      el.guide.setAttribute('data-phase', '');
      el.phaseName.textContent = '准备开始';
      el.phaseSub.textContent = '请设置时长后点击开始';
      el.phaseRemain.textContent = '—';
      el.ringProgress.style.strokeDashoffset = String(RING_LEN);
    } else {
      var phase = session.phase;
      var label = PHASE_LABEL[phase] || phase;
      el.guide.setAttribute('data-phase', phase);
      el.phaseName.textContent = label;
      el.phaseSub.textContent = isPaused ? '已暂停' : (PHASE_SUB[phase] || '');
      var remain = BT.timer.remainingMs(session, now);
      el.phaseRemain.textContent = BT.timer.formatSec(remain);

      var durMs = BT.settings.phaseSec(settings, phase) * 1000;
      var progress = durMs > 0 ? 1 - remain / durMs : 0;
      progress = Math.min(1, Math.max(0, progress));
      el.ringProgress.style.strokeDashoffset = String(RING_LEN * (1 - progress));
    }

    // 统计
    el.statCycles.textContent = String(session.cycleCount);
    el.statElapsed.textContent = BT.timer.formatClock(BT.timer.elapsedMs(session, now));

    // 控制按钮
    el.btnStart.hidden = status !== 'IDLE';
    el.btnPause.hidden = !isRunning;
    el.btnResume.hidden = !isPaused;
    el.btnStop.hidden = status === 'IDLE';
  }

  /** 渲染设置表单回显（不触发输入事件，避免事件循环） */
  function renderSettings(settings, modes) {
    cache();
    for (var i = 0; i < modes.length; i++) {
      var opt = document.createElement('option');
      opt.value = modes[i].id;
      opt.textContent = modes[i].name;
      opt.selected = modes[i].id === settings.mode;
      $('mode-select').appendChild(opt);
    }
    $('mode-hint').textContent = (modes.find(function (m) { return m.id === settings.mode; }) || {}).hint || '';
    $('inhaleSec').value = String(settings.inhaleSec);
    $('holdSec').value = String(settings.holdSec);
    $('exhaleSec').value = String(settings.exhaleSec);
    $('restSec').value = String(settings.restSec);
    $('volume-range').value = String(Math.round(settings.volume * 100));
    $('volume-value').textContent = Math.round(settings.volume * 100) + '%';
    $('muted-toggle').checked = settings.muted;
    $('vibrate-toggle').checked = settings.vibrate;
  }

  var api = { renderSession: renderSession, renderSettings: renderSettings };

  root.BT = root.BT || {};
  root.BT.ui = api;
})(typeof window !== 'undefined' ? window : globalThis);
