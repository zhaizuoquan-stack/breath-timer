/**
 * settings.js — 模式定义 / 默认值 / 校验 / 持久化（纯逻辑，UMD）
 *
 * 浏览器：挂载到 window.BT.settings
 * Node  ：require('./js/settings.js')
 *
 * 对应文档：docs/tech-design.md §5.1、§9
 */
(function (root) {
  'use strict';

  var STORAGE_KEY = 'bt_settings_v1';

  /** 模式定义（可扩展数组，MVP 仅硬气功） */
  var MODES = [
    {
      id: 'qigong-hard',
      name: '硬气功',
      defaults: { inhaleSec: 2, holdSec: 20, exhaleSec: 10, restSec: 20 },
      hint: '吸气短促，屏息蓄劲，呼气缓慢',
    },
  ];

  /** 全局默认设置（与 PRD FR-02 一致） */
  var DEFAULTS = {
    mode: 'qigong-hard',
    inhaleSec: 2,
    holdSec: 20,
    exhaleSec: 10,
    restSec: 20,
    volume: 0.8, // 0~1
    muted: false,
    vibrate: true,
  };

  /** 整数钳制：非法值回退 def，越界钳到 [min,max] */
  function clampInt(v, min, max, def) {
    if (v === null || v === undefined || v === '') return def;
    var n = Number(v);
    if (!Number.isFinite(n)) return def;
    n = Math.round(n);
    if (n < min) return min;
    if (n > max) return max;
    return n;
  }

  /**
   * 校验/规范化一份设置对象（含默认值补全）。
   * 规则：inhale/hold/exhale ∈ [1,60]；rest ∈ [0,60]；volume ∈ [0,1]；
   *       muted/vibrate 布尔化；mode 必须存在于 MODES。
   */
  function clamp(s) {
    var src = s && typeof s === 'object' ? s : {};
    var out = {};
    out.inhaleSec = clampInt(src.inhaleSec, 1, 60, DEFAULTS.inhaleSec);
    out.holdSec = clampInt(src.holdSec, 1, 60, DEFAULTS.holdSec);
    out.exhaleSec = clampInt(src.exhaleSec, 1, 60, DEFAULTS.exhaleSec);
    out.restSec = clampInt(src.restSec, 0, 60, DEFAULTS.restSec);
    var vol = src.volume === null || src.volume === undefined || src.volume === '' ? NaN : Number(src.volume);
    out.volume = Number.isFinite(vol) ? Math.min(1, Math.max(0, vol)) : DEFAULTS.volume;
    out.muted = Boolean(src.muted);
    out.vibrate = typeof src.vibrate === 'boolean' ? src.vibrate : DEFAULTS.vibrate;
    out.mode = MODES.some(function (m) { return m.id === src.mode; }) ? src.mode : DEFAULTS.mode;
    return out;
  }

  /** 从 localStorage 读取，损坏/缺失/隐私模式回退默认 */
  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return clamp({});
      return clamp(JSON.parse(raw));
    } catch (e) {
      return clamp({});
    }
  }

  /** 写 localStorage（失败静默，仅本次会话生效） */
  function save(s) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(clamp(s)));
    } catch (e) {
      /* 忽略：隐私模式等场景 */
    }
  }

  /** 应用某模式默认值（保留 volume/muted/vibrate 等非时长字段） */
  function applyMode(s, modeId) {
    var m = null;
    for (var i = 0; i < MODES.length; i++) {
      if (MODES[i].id === modeId) { m = MODES[i]; break; }
    }
    if (!m) return clamp(s);
    var merged = {};
    var keys = ['inhaleSec', 'holdSec', 'exhaleSec', 'restSec'];
    for (var k = 0; k < keys.length; k++) merged[keys[k]] = m.defaults[keys[k]];
    merged.mode = modeId;
    return clamp(Object.assign({}, s, merged));
  }

  /** 取某相位时长（秒）；未知相位返回 0 */
  function phaseSec(s, phase) {
    switch (phase) {
      case 'INHALE': return s.inhaleSec;
      case 'HOLD': return s.holdSec;
      case 'EXHALE': return s.exhaleSec;
      case 'REST': return s.restSec;
      default: return 0;
    }
  }

  var api = {
    STORAGE_KEY: STORAGE_KEY,
    MODES: MODES,
    DEFAULTS: DEFAULTS,
    clamp: clamp,
    load: load,
    save: save,
    applyMode: applyMode,
    phaseSec: phaseSec,
  };

  root.BT = root.BT || {};
  root.BT.settings = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
