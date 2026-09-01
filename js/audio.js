/**
 * audio.js — Web Audio 合成音效引擎（浏览器）
 *
 * 对应文档：docs/tech-design.md §5.4、§8
 *
 * 设计要点：
 *  - AudioContext 必须在用户手势中创建/恢复（浏览器自动播放策略）；
 *  - 每相位独立 Source+Filter+Gain 链，基于 ctx.currentTime 前瞻调度；
 *  - 相位结束 100ms 淡出防爆音；节点用后 disconnect 防泄漏；
 *  - HOLD 相位静音。
 */
(function (root) {
  'use strict';

  var ctx = null;          // AudioContext（单例）
  var master = null;       // 主 Gain（音量/静音）
  var noiseBuffer = null;  // 2s 白噪声（共享复用）
  var currentVol = 0.8;    // 当前音量（静音开关恢复用）
  var active = [];         // 活跃节点链 {src, gain}

  /** 音效参数（集中可调，对应 tech-design.md §8） */
  var config = {
    inhaleFreq: 600,
    inhaleQ: 1.2,
    exhaleFreq: 350,
    exhaleQ: 1.0,
    restFreq: 880,
    restDurSec: 0.12,
    fadeSec: 0.1,          // 停止淡出
    masterGain: 0.8,
  };

  /** 初始化/恢复 AudioContext。返回是否可用。必须在用户手势中调用。 */
  function init() {
    if (ctx) {
      if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) { /* 忽略 */ } }
      return true;
    }
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return false;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = currentVol;
      master.connect(ctx.destination);
      noiseBuffer = buildNoise(ctx);
      return true;
    } catch (e) {
      ctx = null; master = null; noiseBuffer = null;
      return false;
    }
  }

  function buildNoise(c) {
    var len = Math.floor(c.sampleRate * 2);
    var buf = c.createBuffer(1, len, c.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** 停止全部音源（淡出防爆音）并清理节点 */
  function stopAll() {
    if (!ctx) return;
    var now = ctx.currentTime;
    for (var i = 0; i < active.length; i++) {
      var chain = active[i];
      try {
        chain.gain.gain.cancelScheduledValues(now);
        chain.gain.gain.setValueAtTime(chain.gain.gain.value, now);
        chain.gain.gain.linearRampToValueAtTime(0, now + config.fadeSec);
        chain.src.stop(now + config.fadeSec + 0.02);
      } catch (e) { /* 已停止的节点 */ }
    }
    active = [];
  }

  /** 静音：主 Gain 平滑归零（不停止调度，恢复时还原音量） */
  function setMuted(b) {
    if (!ctx || !master) return;
    var target = b ? 0 : currentVol;
    master.gain.setTargetAtTime(target, ctx.currentTime, 0.05);
  }

  /** 音量 0~1：写入当前音量并平滑应用 */
  function setVolume(v) {
    currentVol = Math.min(1, Math.max(0, Number(v) || 0));
    if (ctx && master) {
      master.gain.setTargetAtTime(currentVol, ctx.currentTime, 0.05);
    }
  }

  function track(chain) {
    active.push(chain);
    chain.src.onended = function () {
      try { chain.gain.disconnect(); chain.filter && chain.filter.disconnect(); } catch (e) { /* 忽略 */ }
      var idx = active.indexOf(chain);
      if (idx >= 0) active.splice(idx, 1);
    };
  }

  /** 播放当前相位音效。INHALE/EXHALE=呼吸声，REST=叮，HOLD=静音。 */
  function playPhase(phase, durationSec) {
    if (!ctx || !master) return;
    stopAll();
    var t0 = ctx.currentTime + 0.03;
    if (phase === 'INHALE') playBreath(t0, durationSec, config.inhaleFreq, config.inhaleQ, 'in');
    else if (phase === 'EXHALE') playBreath(t0, durationSec, config.exhaleFreq, config.exhaleQ, 'out');
    else if (phase === 'REST') playRest(t0);
    /* HOLD：静音 */
  }

  /** 呼吸声：白噪声 → 带通滤波 → 包络 Gain */
  function playBreath(t0, durationSec, freq, q, dir) {
    var durMs = Math.max(50, durationSec * 1000);
    var src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;

    var filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = q;

    var g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);

    if (dir === 'in') {
      var attackMs = Math.min(400, durMs * 0.2);
      var holdEnd = Math.max(attackMs, durMs - 200);
      g.gain.linearRampToValueAtTime(1, t0 + attackMs / 1000);
      g.gain.setValueAtTime(1, t0 + holdEnd / 1000);
      g.gain.linearRampToValueAtTime(0, t0 + durMs / 1000);
    } else {
      var releaseStart = Math.max(50, durMs * 0.7);
      g.gain.linearRampToValueAtTime(0.8, t0 + 0.05);
      g.gain.setValueAtTime(0.8, t0 + releaseStart / 1000);
      g.gain.linearRampToValueAtTime(0, t0 + durMs / 1000);
    }

    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t0);
    src.stop(t0 + durMs / 1000 + 0.1);
    track({ src: src, gain: g, filter: filter });
  }

  /** 休息提示音：880Hz 正弦，120ms 短促"叮" */
  function playRest(t0) {
    var osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = config.restFreq;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.5, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + config.restDurSec);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + config.restDurSec + 0.05);
    track({ src: osc, gain: g, filter: null });
  }

  var api = {
    init: init,
    playPhase: playPhase,
    stopAll: stopAll,
    setVolume: setVolume,
    setMuted: setMuted,
    config: config,
  };

  root.BT = root.BT || {};
  root.BT.audio = api;
})(typeof window !== 'undefined' ? window : globalThis);
