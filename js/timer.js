/**
 * timer.js — 时间戳计时计算（纯逻辑，UMD）
 *
 * 浏览器：挂载到 window.BT.timer
 * Node  ：require('./js/timer.js')
 *
 * 对应文档：docs/tech-design.md §5.3、§7
 */
(function (root) {
  'use strict';

  /** 当前相位剩余毫秒（钳制 ≥ 0） */
  function remainingMs(s, now) {
    if (s.status === 'IDLE') return 0;
    return Math.max(0, s.phaseEndAt - now);
  }

  /** 会话总用时（ms）：now - startedAt（含暂停前累计的进行时间） */
  function elapsedMs(s, now) {
    if (s.status === 'IDLE') return 0;
    return Math.max(0, now - s.startedAt);
  }

  /** 秒显示："2.0 s"（1 位小数） */
  function formatSec(ms) {
    return (ms / 1000).toFixed(1) + ' s';
  }

  /** 时钟显示："1:24" */
  function formatClock(ms) {
    var total = Math.floor(Math.max(0, ms) / 1000);
    var m = Math.floor(total / 60);
    var sec = total % 60;
    return m + ':' + String(sec).padStart(2, '0');
  }

  var api = {
    remainingMs: remainingMs,
    elapsedMs: elapsedMs,
    formatSec: formatSec,
    formatClock: formatClock,
  };

  root.BT = root.BT || {};
  root.BT.timer = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
