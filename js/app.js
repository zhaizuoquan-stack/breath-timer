/**
 * app.js — 装配：事件绑定、rAF 主循环、启动（浏览器）
 *
 * 对应文档：docs/tech-design.md §5.6、§7
 * 单向数据流：用户操作 → stateMachine.handleEvent → 新状态 → ui.render + audio.playPhase
 */
(function (root) {
  'use strict';

  var session = null;
  var settings = null;
  var audioOk = false;

  /* ---------- 启动 ---------- */
  function start() {
    settings = BT.settings.load();
    session = BT.stateMachine.createSession(settings);
    bindEvents();
    BT.ui.renderSettings(settings, BT.settings.MODES);
    BT.ui.renderSession(session, settings, Date.now());
    requestAnimationFrame(loop);
  }

  /* ---------- 主循环：时间戳驱动 ---------- */
  function loop() {
    if (session.status === 'RUNNING') {
      var now = Date.now();
      if (now >= session.phaseEndAt) {
        session = BT.stateMachine.handleEvent(session, 'PHASE_END', now);
        onPhaseEntered(session.phase);
      } else {
        BT.ui.renderSession(session, settings, now);
      }
    }
    requestAnimationFrame(loop);
  }

  /** 相位进入：播放对应音效 + 振动 + 渲染 */
  function onPhaseEntered(phase) {
    var durSec = BT.settings.phaseSec(settings, phase);
    if (audioOk) BT.audio.playPhase(phase, durSec);
    if (settings.vibrate && navigator.vibrate) {
      if (phase === 'INHALE' || phase === 'EXHALE' || phase === 'REST') {
        try { navigator.vibrate(phase === 'REST' ? [60, 40, 60] : 40); } catch (e) { /* 忽略 */ }
      }
    }
    BT.ui.renderSession(session, settings, Date.now());
  }

  /* ---------- 控制 ---------- */
  function onStart() {
    audioOk = BT.audio.init(); // 必须在用户手势中初始化 AudioContext
    var now = Date.now();
    session = BT.stateMachine.handleEvent(session, 'START', now);
    onPhaseEntered(session.phase);
  }

  function onPause() {
    BT.audio.stopAll();
    session = BT.stateMachine.handleEvent(session, 'PAUSE', Date.now());
    BT.ui.renderSession(session, settings, Date.now());
  }

  function onResume() {
    // 恢复后当前相位不重播音效（下一相位切换时再播），避免与剩余时间错位
    session = BT.stateMachine.handleEvent(session, 'RESUME', Date.now());
    BT.ui.renderSession(session, settings, Date.now());
  }

  function onStop() {
    BT.audio.stopAll();
    session = BT.stateMachine.handleEvent(session, 'STOP', Date.now());
    BT.ui.renderSession(session, settings, Date.now());
  }

  /* ---------- 设置：运行中修改即时生效（当前相位不中断） ---------- */
  function readDurations() {
    return {
      inhaleSec: Number($('inhaleSec').value),
      holdSec: Number($('holdSec').value),
      exhaleSec: Number($('exhaleSec').value),
      restSec: Number($('restSec').value),
    };
  }

  function onDurationsChanged() {
    var next = BT.settings.clamp(Object.assign({}, settings, readDurations()));
    applySettings(next);
  }

  function onModeChanged() {
    var next = BT.settings.applyMode(settings, $('mode-select').value);
    $('mode-hint').textContent = (BT.settings.MODES.find(function (m) { return m.id === next.mode; }) || {}).hint || '';
    applySettings(next);
  }

  function onVolumeChanged() {
    var v = Number($('volume-range').value) / 100;
    BT.audio.setVolume(v);
    $('volume-value').textContent = Math.round(v * 100) + '%';
    applySettings(Object.assign({}, settings, { volume: v }));
  }

  function onMutedChanged() {
    var muted = $('muted-toggle').checked;
    BT.audio.setMuted(muted);
    applySettings(Object.assign({}, settings, { muted: muted }));
  }

  function onVibrateChanged() {
    applySettings(Object.assign({}, settings, { vibrate: $('vibrate-toggle').checked }));
  }

  /** 统一设置入口：规范化 → 持久化 → 更新引用 → 派发 SETTINGS_CHANGED → 渲染 */
  function applySettings(next) {
    settings = BT.settings.clamp(next);
    BT.settings.save(settings);
    session = BT.stateMachine.handleEvent(session, 'SETTINGS_CHANGED', settings);
    BT.ui.renderSettings(settings, BT.settings.MODES);
    BT.ui.renderSession(session, settings, Date.now());
  }

  /* ---------- 事件绑定 ---------- */
  function bindEvents() {
    $('btn-start').addEventListener('click', onStart);
    $('btn-pause').addEventListener('click', onPause);
    $('btn-resume').addEventListener('click', onResume);
    $('btn-stop').addEventListener('click', onStop);

    $('mode-select').addEventListener('change', onModeChanged);

    // 步进按钮
    document.querySelectorAll('.step-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var row = btn.closest('.setting-row');
        var input = row.querySelector('.step-input');
        var delta = Number(btn.getAttribute('data-step'));
        input.value = String(Math.max(0, (Number(input.value) || 0) + delta));
        onDurationsChanged();
      });
    });
    // 数字输入
    document.querySelectorAll('.step-input').forEach(function (input) {
      input.addEventListener('change', onDurationsChanged);
    });

    $('volume-range').addEventListener('input', onVolumeChanged);
    $('muted-toggle').addEventListener('change', onMutedChanged);
    $('vibrate-toggle').addEventListener('change', onVibrateChanged);

    // 键盘可访问性：Enter 在输入框提交
    document.querySelectorAll('.step-input').forEach(function (input) {
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { input.blur(); onDurationsChanged(); }
      });
    });
  }

  function $(id) { return document.getElementById(id); }

  // 入口：DOM 就绪后启动（脚本在 body 底部，DOM 已可用）
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})(typeof window !== 'undefined' ? window : globalThis);
