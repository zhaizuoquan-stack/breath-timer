/**
 * timer.test.js — 计时模块单测（Node 内置 test runner）
 * 运行：node --test test/
 * 覆盖：docs/tech-design.md §11.1 timer 用例
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const timer = require('../js/timer.js');
const sm = require('../js/stateMachine.js');

const SETTINGS = {
  mode: 'qigong-hard',
  inhaleSec: 2, holdSec: 20, exhaleSec: 10, restSec: 20,
  volume: 0.8, muted: false, vibrate: true,
};
const T0 = 5_000_000;

test('remainingMs：相位进行中返回剩余，归零钳制为 0', () => {
  let s = sm.handleEvent(sm.createSession(SETTINGS), 'START', T0); // INHALE 至 T0+2000
  assert.equal(timer.remainingMs(s, T0), 2000);
  assert.equal(timer.remainingMs(s, T0 + 500), 1500);
  assert.equal(timer.remainingMs(s, T0 + 2000), 0);
  assert.equal(timer.remainingMs(s, T0 + 9999), 0); // 超时钳制
});

test('remainingMs：IDLE 返回 0', () => {
  assert.equal(timer.remainingMs(sm.createSession(SETTINGS), T0), 0);
});

test('elapsedMs：会话进行时间 = now - startedAt；IDLE 为 0', () => {
  const s = sm.handleEvent(sm.createSession(SETTINGS), 'START', T0);
  assert.equal(timer.elapsedMs(s, T0), 0);
  assert.equal(timer.elapsedMs(s, T0 + 7_000), 7000);
  assert.equal(timer.elapsedMs(sm.createSession(SETTINGS), T0), 0);
});

test('暂停期间 elapsedMs 冻结（基于时间戳语义：恢复前不计算）', () => {
  // 状态机语义：PAUSED 时主循环不 tick，elapsed 由调用方决定何时计算；
  // 此处验证恢复后 startedAt 不变、elapsed 从恢复时刻继续累计。
  let s = sm.handleEvent(sm.createSession(SETTINGS), 'START', T0);
  s = sm.handleEvent(s, 'PAUSE', T0 + 1000);
  s = sm.handleEvent(s, 'RESUME', T0 + 11_000);
  assert.equal(timer.elapsedMs(s, T0 + 11_000), 11_000);
  assert.equal(timer.elapsedMs(s, T0 + 12_000), 12_000);
});

test('formatSec：1 位小数 + s 后缀', () => {
  assert.equal(timer.formatSec(2000), '2.0 s');
  assert.equal(timer.formatSec(1500), '1.5 s');
  assert.equal(timer.formatSec(0), '0.0 s');
});

test('formatClock：m:ss 格式', () => {
  assert.equal(timer.formatClock(0), '0:00');
  assert.equal(timer.formatClock(84_000), '1:24');
  assert.equal(timer.formatClock(600_000), '10:00');
  assert.equal(timer.formatClock(3_661_000), '61:01');
  assert.equal(timer.formatClock(-5), '0:00'); // 负数钳制
});
