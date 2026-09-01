/**
 * stateMachine.test.js — 状态机模块单测（Node 内置 test runner）
 * 运行：node --test test/
 * 覆盖：docs/tech-design.md §11.1 stateMachine 用例
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const sm = require('../js/stateMachine.js');

const SETTINGS = {
  mode: 'qigong-hard',
  inhaleSec: 2, holdSec: 20, exhaleSec: 10, restSec: 20,
  volume: 0.8, muted: false, vibrate: true,
};
const SETTINGS_NO_REST = Object.assign({}, SETTINGS, { restSec: 0 });

const T0 = 1_000_000;

test('createSession：初始为 IDLE，相位 INHALE，周期 0', () => {
  const s = sm.createSession(SETTINGS);
  assert.equal(s.status, 'IDLE');
  assert.equal(s.phase, 'INHALE');
  assert.equal(s.cycleCount, 0);
  assert.equal(s.startedAt, 0);
});

test('IDLE + START → RUNNING/INHALE，phaseEndAt = now + inhale×1000', () => {
  const s = sm.handleEvent(sm.createSession(SETTINGS), 'START', T0);
  assert.equal(s.status, 'RUNNING');
  assert.equal(s.phase, 'INHALE');
  assert.equal(s.phaseEndAt, T0 + 2 * 1000);
  assert.equal(s.phaseStartedAt, T0);
  assert.equal(s.cycleCount, 0);
});

test('非法事件：IDLE + PAUSE / IDLE + STOP / RUNNING + START / RUNNING + RESUME 均返回原状态', () => {
  const idle = sm.createSession(SETTINGS);
  assert.equal(sm.handleEvent(idle, 'PAUSE', T0), idle);
  assert.equal(sm.handleEvent(idle, 'STOP', T0), idle);
  const running = sm.handleEvent(idle, 'START', T0);
  assert.equal(sm.handleEvent(running, 'START', T0), running);
  assert.equal(sm.handleEvent(running, 'RESUME', T0), running);
});

test('PHASE_END 流转：INHALE→HOLD→EXHALE→REST→INHALE，REST 结束周期 +1', () => {
  let s = sm.handleEvent(sm.createSession(SETTINGS), 'START', T0);
  const expect = [
    { from: 'INHALE', to: 'HOLD', dur: 20, cycles: 0 },
    { from: 'HOLD', to: 'EXHALE', dur: 10, cycles: 0 },
    { from: 'EXHALE', to: 'REST', dur: 20, cycles: 0 },
    { from: 'REST', to: 'INHALE', dur: 2, cycles: 1 },
  ];
  let t = T0;
  for (const e of expect) {
    t = s.phaseEndAt;
    s = sm.handleEvent(s, 'PHASE_END', t);
    assert.equal(s.phase, e.to, `期望 ${e.from} → ${e.to}`);
    assert.equal(s.phaseEndAt, t + e.dur * 1000, `相位时长应为 ${e.dur}s`);
    assert.equal(s.cycleCount, e.cycles, '周期计数');
    assert.equal(s.status, 'RUNNING');
  }
});

test('restSec=0：EXHALE 结束直接 → INHALE 且周期 +1', () => {
  let s = sm.handleEvent(sm.createSession(SETTINGS_NO_REST), 'START', T0);
  assert.equal(s.phase, 'INHALE');
  s = sm.handleEvent(s, 'PHASE_END', s.phaseEndAt); // → HOLD
  assert.equal(s.phase, 'HOLD');
  s = sm.handleEvent(s, 'PHASE_END', s.phaseEndAt); // → EXHALE
  assert.equal(s.phase, 'EXHALE');
  s = sm.handleEvent(s, 'PHASE_END', s.phaseEndAt); // EXHALE + rest=0 → INHALE 且 +1
  assert.equal(s.phase, 'INHALE');
  assert.equal(s.cycleCount, 1);
});

test('PAUSE 保存剩余 → RESUME 从暂停点继续（phaseEndAt = now + 剩余）', () => {
  let s = sm.handleEvent(sm.createSession(SETTINGS), 'START', T0);
  const pauseAt = T0 + 500; // INHALE 已过 0.5s，剩余 1.5s
  s = sm.handleEvent(s, 'PAUSE', pauseAt);
  assert.equal(s.status, 'PAUSED');
  assert.equal(s.pausedRemainMs, 1500);

  const resumeAt = pauseAt + 10_000; // 暂停 10s 后恢复
  s = sm.handleEvent(s, 'RESUME', resumeAt);
  assert.equal(s.status, 'RUNNING');
  assert.equal(s.phaseEndAt, resumeAt + 1500);
});

test('PAUSED + PHASE_END 被忽略（暂停中不推进相位）', () => {
  let s = sm.handleEvent(sm.createSession(SETTINGS), 'START', T0);
  s = sm.handleEvent(s, 'PAUSE', T0 + 500);
  const paused = s;
  s = sm.handleEvent(s, 'PHASE_END', T0 + 5000);
  assert.equal(s, paused);
});

test('STOP（RUNNING / PAUSED）→ IDLE 且周期归零', () => {
  let s = sm.handleEvent(sm.createSession(SETTINGS), 'START', T0);
  s = sm.handleEvent(s, 'PHASE_END', s.phaseEndAt);
  s = sm.handleEvent(s, 'PHASE_END', s.phaseEndAt);
  s = sm.handleEvent(s, 'PHASE_END', s.phaseEndAt);
  s = sm.handleEvent(s, 'PHASE_END', s.phaseEndAt); // 完成 1 周期
  assert.equal(s.cycleCount, 1);
  const stopped = sm.handleEvent(s, 'STOP', s.phaseEndAt);
  assert.equal(stopped.status, 'IDLE');
  assert.equal(stopped.cycleCount, 0);

  const paused = sm.handleEvent(sm.handleEvent(sm.createSession(SETTINGS), 'START', T0), 'PAUSE', T0 + 100);
  assert.equal(sm.handleEvent(paused, 'STOP', T0 + 200).status, 'IDLE');
});

test('SETTINGS_CHANGED：替换设置引用，当前相位不中断，下一相位用新时长', () => {
  let s = sm.handleEvent(sm.createSession(SETTINGS), 'START', T0); // INHALE 2s
  const newSettings = Object.assign({}, SETTINGS, { holdSec: 5 });
  s = sm.handleEvent(s, 'SETTINGS_CHANGED', newSettings);
  assert.equal(s.settings.holdSec, 5);
  // 当前 INHALE 相位时长不变（phaseEndAt 未被改动）
  assert.equal(s.phaseEndAt, T0 + 2000);
  // 下一相位 HOLD 使用新时长 5s
  s = sm.handleEvent(s, 'PHASE_END', s.phaseEndAt);
  assert.equal(s.phase, 'HOLD');
  assert.equal(s.phaseEndAt, s.phaseStartedAt + 5 * 1000);
});

test('nextPhase / cycleCompleteOnExit 纯函数语义', () => {
  assert.equal(sm.nextPhase('INHALE', 1), 'HOLD');
  assert.equal(sm.nextPhase('HOLD', 1), 'EXHALE');
  assert.equal(sm.nextPhase('EXHALE', 1), 'REST');
  assert.equal(sm.nextPhase('EXHALE', 0), 'INHALE');
  assert.equal(sm.nextPhase('REST', 1), 'INHALE');

  assert.equal(sm.cycleCompleteOnExit('REST', 5), true);
  assert.equal(sm.cycleCompleteOnExit('EXHALE', 0), true);
  assert.equal(sm.cycleCompleteOnExit('EXHALE', 5), false);
  assert.equal(sm.cycleCompleteOnExit('INHALE', 5), false);
  assert.equal(sm.cycleCompleteOnExit('HOLD', 5), false);
});

test('phaseSec：时长取自当前 settings', () => {
  const s = sm.createSession(SETTINGS);
  assert.equal(sm.phaseSec(s.settings, 'INHALE'), 2);
  assert.equal(sm.phaseSec(s.settings, 'HOLD'), 20);
  assert.equal(sm.phaseSec(s.settings, 'EXHALE'), 10);
  assert.equal(sm.phaseSec(s.settings, 'REST'), 20);
});
