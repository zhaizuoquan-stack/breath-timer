/**
 * stateMachine.js — 会话状态机 + 四相位机（纯逻辑，UMD）
 *
 * 浏览器：挂载到 window.BT.stateMachine
 * Node  ：require('./js/stateMachine.js')
 *
 * 对应文档：docs/tech-design.md §5.2、§6
 *
 * 事件约定：handleEvent(session, event, payload)
 *   START / PAUSE / RESUME / STOP / PHASE_END  → payload 为当前时间戳 now(ms)
 *   SETTINGS_CHANGED                           → payload 为新的 Settings 对象
 */
(function (root) {
  'use strict';

  var PHASES = ['INHALE', 'HOLD', 'EXHALE', 'REST'];
  var STATUS = { IDLE: 'IDLE', RUNNING: 'RUNNING', PAUSED: 'PAUSED' };

  /** 取某相位时长（秒），从 settings 对象直接读取（本模块不依赖 settings.js） */
  function phaseSec(s, phase) {
    switch (phase) {
      case 'INHALE': return s.inhaleSec;
      case 'HOLD': return s.holdSec;
      case 'EXHALE': return s.exhaleSec;
      case 'REST': return s.restSec;
      default: return 0;
    }
  }

  /** 创建初始（IDLE）会话 */
  function createSession(settings) {
    return {
      status: STATUS.IDLE,
      phase: 'INHALE',
      phaseEndAt: 0,        // 相位结束绝对时间戳 ms
      phaseStartedAt: 0,    // 相位开始绝对时间戳 ms（供进度渲染）
      pausedRemainMs: 0,    // 暂停时保存的剩余 ms
      cycleCount: 0,
      startedAt: 0,
      settings: settings,
    };
  }

  /**
   * 相位转移：INHALE→HOLD→EXHALE→(rest>0?REST:INHALE)→INHALE…
   * restSec === 0 时 EXHALE 结束跳过 REST 直接回 INHALE。
   */
  function nextPhase(phase, restSec) {
    switch (phase) {
      case 'INHALE': return 'HOLD';
      case 'HOLD': return 'EXHALE';
      case 'EXHALE': return restSec > 0 ? 'REST' : 'INHALE';
      case 'REST': return 'INHALE';
      default: return 'INHALE';
    }
  }

  /**
   * 该相位退出时是否完成一个周期（周期 +1 时机）：
   *   - REST 结束（restSec > 0）→ +1
   *   - EXHALE 结束且 restSec === 0 → +1
   */
  function cycleCompleteOnExit(phase, restSec) {
    if (phase === 'REST') return true;
    if (phase === 'EXHALE' && restSec === 0) return true;
    return false;
  }

  /** RUNNING 下相位归零 → 推进到下一相位（周期计数一并更新） */
  function advancePhase(s, now) {
    var restSec = s.settings.restSec;
    var completed = cycleCompleteOnExit(s.phase, restSec);
    var next = nextPhase(s.phase, restSec);
    var durMs = phaseSec(s.settings, next) * 1000;
    return {
      status: STATUS.RUNNING,
      phase: next,
      phaseEndAt: now + durMs,
      phaseStartedAt: now,
      pausedRemainMs: 0,
      cycleCount: s.cycleCount + (completed ? 1 : 0),
      startedAt: s.startedAt,
      settings: s.settings,
    };
  }

  /**
   * 状态机入口。非法事件返回原状态（不变式：返回对象 !== 输入对象 仅当状态真的变化）。
   */
  function handleEvent(s, event, payload) {
    var now = typeof payload === 'number' ? payload : 0;
    switch (s.status) {
      case STATUS.IDLE:
        if (event === 'START') {
          var inhaleMs = phaseSec(s.settings, 'INHALE') * 1000;
          return {
            status: STATUS.RUNNING,
            phase: 'INHALE',
            phaseEndAt: now + inhaleMs,
            phaseStartedAt: now,
            pausedRemainMs: 0,
            cycleCount: 0,
            startedAt: now,
            settings: s.settings,
          };
        }
        if (event === 'SETTINGS_CHANGED') {
          return Object.assign({}, s, { settings: payload });
        }
        return s;
      case STATUS.RUNNING:
        if (event === 'PAUSE') {
          return Object.assign({}, s, {
            status: STATUS.PAUSED,
            pausedRemainMs: Math.max(0, s.phaseEndAt - now),
          });
        }
        if (event === 'STOP') return createSession(s.settings);
        if (event === 'SETTINGS_CHANGED') {
          return Object.assign({}, s, { settings: payload });
        }
        if (event === 'PHASE_END') return advancePhase(s, now);
        return s;
      case STATUS.PAUSED:
        if (event === 'RESUME') {
          return Object.assign({}, s, {
            status: STATUS.RUNNING,
            phaseEndAt: now + s.pausedRemainMs,
            phaseStartedAt: now - Math.max(0, phaseSec(s.settings, s.phase) * 1000 - s.pausedRemainMs),
          });
        }
        if (event === 'STOP') return createSession(s.settings);
        if (event === 'SETTINGS_CHANGED') {
          return Object.assign({}, s, { settings: payload });
        }
        return s;
      default:
        return s;
    }
  }

  var api = {
    PHASES: PHASES,
    STATUS: STATUS,
    createSession: createSession,
    handleEvent: handleEvent,
    nextPhase: nextPhase,
    cycleCompleteOnExit: cycleCompleteOnExit,
    phaseSec: phaseSec,
  };

  root.BT = root.BT || {};
  root.BT.stateMachine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
