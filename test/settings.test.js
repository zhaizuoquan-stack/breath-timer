/**
 * settings.test.js — 设置模块单测（Node 内置 test runner）
 * 运行：node --test test/
 * 覆盖：docs/tech-design.md §11.1 settings 用例
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const settings = require('../js/settings.js');

test('DEFAULTS 与 PRD FR-02 一致（吸2/屏20/呼10/休20）', () => {
  assert.equal(settings.DEFAULTS.inhaleSec, 2);
  assert.equal(settings.DEFAULTS.holdSec, 20);
  assert.equal(settings.DEFAULTS.exhaleSec, 10);
  assert.equal(settings.DEFAULTS.restSec, 20);
  assert.equal(settings.DEFAULTS.volume, 0.8);
  assert.equal(settings.DEFAULTS.muted, false);
  assert.equal(settings.DEFAULTS.vibrate, true);
});

test('MODES 至少包含硬气功且默认值与 PRD 一致', () => {
  const m = settings.MODES.find((x) => x.id === 'qigong-hard');
  assert.ok(m, '缺少 qigong-hard 模式');
  assert.equal(m.name, '硬气功');
  assert.deepEqual(m.defaults, { inhaleSec: 2, holdSec: 20, exhaleSec: 10, restSec: 20 });
});

test('clamp：合法值原样保留', () => {
  const s = settings.clamp({ inhaleSec: 3, holdSec: 5, exhaleSec: 7, restSec: 0, volume: 0.5, muted: true, vibrate: false });
  assert.equal(s.inhaleSec, 3);
  assert.equal(s.holdSec, 5);
  assert.equal(s.exhaleSec, 7);
  assert.equal(s.restSec, 0);
  assert.equal(s.volume, 0.5);
  assert.equal(s.muted, true);
  assert.equal(s.vibrate, false);
});

test('clamp：restSec 允许 0（跳过休息）', () => {
  assert.equal(settings.clamp({ restSec: 0 }).restSec, 0);
});

test('clamp：越界值被钳制到边界', () => {
  assert.equal(settings.clamp({ inhaleSec: 0 }).inhaleSec, 1);
  assert.equal(settings.clamp({ inhaleSec: 61 }).inhaleSec, 60);
  assert.equal(settings.clamp({ restSec: 61 }).restSec, 60);
  assert.equal(settings.clamp({ volume: 1.5 }).volume, 1);
  assert.equal(settings.clamp({ volume: -1 }).volume, 0);
});

test('clamp：非法输入（非数字/NaN）回退默认值', () => {
  assert.equal(settings.clamp({ inhaleSec: 'abc' }).inhaleSec, 2);
  assert.equal(settings.clamp({ holdSec: NaN }).holdSec, 20);
  assert.equal(settings.clamp({ exhaleSec: null }).exhaleSec, 10);
  assert.equal(settings.clamp({ restSec: undefined }).restSec, 20);
  assert.equal(settings.clamp({ volume: 'x' }).volume, 0.8);
});

test('clamp：未知模式回退默认模式', () => {
  assert.equal(settings.clamp({ mode: 'not-exist' }).mode, 'qigong-hard');
});

test('clamp：空对象补全默认值', () => {
  const s = settings.clamp({});
  assert.deepEqual(s, settings.DEFAULTS);
});

test('load：无 localStorage（Node 环境）时返回默认值且不抛错', () => {
  const s = settings.load();
  assert.deepEqual(s, settings.DEFAULTS);
});

test('save：无 localStorage 时静默失败不抛错', () => {
  assert.doesNotThrow(() => settings.save({ inhaleSec: 5 }));
});

test('applyMode：填入模式默认值且保留非时长字段', () => {
  const before = { mode: 'qigong-hard', inhaleSec: 9, holdSec: 9, exhaleSec: 9, restSec: 9, volume: 0.3, muted: true, vibrate: false };
  const after = settings.applyMode(before, 'qigong-hard');
  assert.equal(after.inhaleSec, 2);
  assert.equal(after.holdSec, 20);
  assert.equal(after.exhaleSec, 10);
  assert.equal(after.restSec, 20);
  assert.equal(after.volume, 0.3);
  assert.equal(after.muted, true);
  assert.equal(after.vibrate, false);
  assert.equal(after.mode, 'qigong-hard');
});

test('applyMode：未知模式返回原设置（规范化后）', () => {
  const s = settings.applyMode({ inhaleSec: 7 }, 'nope');
  assert.equal(s.mode, 'qigong-hard');
  assert.equal(s.inhaleSec, 7);
});

test('phaseSec：取各相位时长', () => {
  const s = settings.clamp({});
  assert.equal(settings.phaseSec(s, 'INHALE'), 2);
  assert.equal(settings.phaseSec(s, 'HOLD'), 20);
  assert.equal(settings.phaseSec(s, 'EXHALE'), 10);
  assert.equal(settings.phaseSec(s, 'REST'), 20);
  assert.equal(settings.phaseSec(s, 'UNKNOWN'), 0);
});
