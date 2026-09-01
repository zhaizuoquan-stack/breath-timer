# 呼吸训练管理器（Breath Timer）技术方案设计文档

| 项 | 内容 |
|---|---|
| 版本 | v0.1 |
| 日期 | 2026-09-01 |
| 关联文档 | `docs/PRD.md`（产品基准，本文档为实现基准） |
| 状态 | 初版（技术栈与架构已确定） |
| 文档作用 | 后续开发的**技术基准**：模块接口、算法、约定；实现偏离需先改本文档 |

---

## 1. 设计目标与约束

| 目标/约束 | 说明 |
|---|---|
| 零安装 | 浏览器打开即用，无需安装任何软件/依赖 |
| 零构建 | 开发与交付均无编译/打包步骤，源码即产物 |
| 离线可用 | 无任何外部请求（无 CDN、无字体、无图片资源） |
| 可测试 | 核心逻辑（状态机/计时/设置）可在 Node 中直接单元测试 |
| 简单可靠 | 计时精准（时间戳驱动）、长时运行无泄漏 |
| 遵循 AGENTS.md | 每次代码改动提交对应 commit；改动必更测试，交付前全绿 |

## 2. 技术栈选型

### 2.1 选型总表

| 层 | 选型 | 备选（已排除） | 决策理由 |
|---|---|---|---|
| 语言 | 原生 JavaScript（ES2022，Node ≥ 18 / 浏览器现代版） | TypeScript | 无构建步骤下 TS 需编译，违背"零构建"；本项目规模小，JSDoc 可补类型 |
| 框架 | 无（原生 DOM + CSS） | React/Vue/Svelte | 单页交互规模小（1 屏 + 状态机），框架引入构建链与心智负担 |
| HTML/CSS | 语义化 HTML5 + 原生 CSS（CSS 变量、Grid/Flex） | Tailwind/Sass | 零依赖；CSS 变量实现主题与相位配色 |
| 模块加载 | 普通 `<script>` 标签按序加载 + 全局命名空间 `BT` | ES Modules | **file:// 直开**时浏览器 CORS 拦截 ES Modules；script 标签双击即用 |
| 模块导出 | UMD 双导出（`window.BT.x` + `module.exports`） | 仅 ESM | 同一份纯逻辑文件既服务浏览器又可在 Node `require` 单测 |
| 音频 | Web Audio API（原生合成） | 音频文件/第三方库 Howler | PRD 决策：合成呼吸音效；零资源依赖 |
| 持久化 | localStorage（键 `bt_settings_v1`） | IndexedDB | 仅存设置对象，量级 KB；IndexedDB 过重 |
| 测试 | Node 内置 `node:test` + `node:assert` | Jest/Vitest | Node ≥ 18 自带，零依赖零安装 |
| 计时 | `Date.now()` 绝对时间戳驱动 | setInterval 累加 | 杜绝漂移；暂停/恢复精确 |

### 2.2 关键权衡说明

1. **为什么不用 ES Modules**：Chrome/Firefox 对 `file://` 协议下的 `<script type="module">` 强制同源 CORS，双击 `index.html` 会白屏。目标用户是普通使用者（双击打开），故采用普通 script 标签 + 命名空间。代价是模块间依赖需手动保证加载顺序（见 §4 加载顺序），由 `index.html` 单点维护。
2. **UMD 的形态**：每个纯逻辑文件尾部：
   ```js
   // stateMachine.js 末尾
   if (typeof module !== 'undefined' && module.exports) module.exports = BT.stateMachine;
   ```
   浏览器忽略该分支，Node 测试 `require('../js/stateMachine.js')`。
3. **测试零依赖**：`node --test test/` 即可运行全部单测，无需 `npm install`。

## 3. 总体架构

### 3.1 模块关系图

```
┌─────────────────────────── 浏览器层 ───────────────────────────┐
│  index.html                                                     │
│    ├── css/style.css          （样式 / 相位配色 / 响应式）        │
│    └── js/ 加载顺序：                                           │
│        1. settings.js        （纯逻辑）                          │
│        2. stateMachine.js    （纯逻辑）                          │
│        3. timer.js           （纯逻辑）                          │
│        4. audio.js           （浏览器：Web Audio 引擎）           │
│        5. ui.js              （浏览器：DOM 渲染）                 │
│        6. app.js             （装配：事件绑定 + 主循环）          │
└──────────────────────────────┬─────────────────────────────────┘
                               │ 仅 app.js 读写 DOM/音频；
                               │ 纯逻辑模块不触碰 document/window
┌──────────────────────────────▼─────────────────────────────────┐
│  test/  （node --test，require 上面的 1~3 号纯逻辑文件）          │
│    stateMachine.test.js / timer.test.js / settings.test.js      │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 单向数据流

```
用户操作（点击/改设置）
   │  事件（START/PAUSE/RESUME/STOP/SETTINGS_CHANGED）
   ▼
app.js ──► stateMachine.handleEvent(session, event, now)
   │           │
   │           ▼
   │       新 SessionState（status/phase/phaseEndAt/cycleCount）
   │           │
   ├──► ui.render(session, settings)          （更新 DOM）
   └──► audio.playPhase(phase, duration)      （相位切换时播音效）

主循环（requestAnimationFrame，仅 RUNNING 时活跃）
   │  每帧：now = Date.now()
   │  remaining = phaseEndAt - now
   │  remaining <= 0 且 status==RUNNING  ──► handleEvent(session, 'PHASE_END', now)
   │  否则 ──► ui.render(...)  更新剩余秒数/环形进度
```

## 4. 目录结构

```
breath_timer/
├── index.html                 # 唯一入口，含全部 DOM 与 script 加载顺序
├── css/
│   └── style.css              # 全部样式（CSS 变量主题、相位配色、响应式）
├── js/
│   ├── settings.js            # 纯逻辑：模式定义/默认值/校验/持久化
│   ├── stateMachine.js        # 纯逻辑：会话状态机 + 四相位机
│   ├── timer.js               # 纯逻辑：时间戳计时计算
│   ├── audio.js               # 浏览器：Web Audio 合成引擎
│   ├── ui.js                  # 浏览器：DOM 渲染（引导区/统计/按钮）
│   └── app.js                 # 装配：事件绑定、rAF 主循环、启动
├── test/
│   ├── settings.test.js
│   ├── stateMachine.test.js
│   └── timer.test.js
├── docs/
│   ├── PRD.md                 # 产品基准
│   └── tech-design.md         # 本文件（技术基准）
├── AGENTS.md
├── README.md
├── .gitignore
└── .gitattributes
```

## 5. 模块设计（接口基准）

> 以下为各模块的公开接口（JSDoc 风格），实现必须与之兼容；新增字段需同步更新本文档。

### 5.1 `js/settings.js`（纯逻辑，UMD）

```js
BT.settings = {
  MODES: [ { id, name, defaults:{inhaleSec,holdSec,exhaleSec,restSec}, hint } ],
  DEFAULTS: { mode:'qigong-hard', inhaleSec:2, holdSec:20, exhaleSec:10,
              restSec:20, volume:0.8, muted:false, vibrate:true },

  load(): Settings,                    // 读 localStorage，损坏/缺失回退默认
  save(s: Settings): void,             // 写 localStorage（try/catch 容错）
  applyMode(s: Settings, modeId): Settings,  // 填入该模式 defaults，其余字段保留
  clamp(s: Partial<Settings>): Settings,     // 数值越界/非数字回退（含边界：restSec 允许 0）
  phaseSec(s: Settings, phase): number,      // 取某相位时长（INHALE/HOLD/EXHALE/REST）
}
```

校验规则：`inhale/hold/exhale ∈ [1,60]` 整数；`rest ∈ [0,60]` 整数；`volume ∈ [0,1]`；非法输入回退该字段默认值。

### 5.2 `js/stateMachine.js`（纯逻辑，UMD）

```js
BT.stateMachine = {
  PHASES: ['INHALE','HOLD','EXHALE','REST'],
  STATUS: { IDLE:'IDLE', RUNNING:'RUNNING', PAUSED:'PAUSED' },

  createSession(settings): SessionState,        // 初始 IDLE 状态
  handleEvent(s, event, now): SessionState,     // 返回**新**状态对象（不可变风格）
                                               // payload 语义：START/PAUSE/RESUME/STOP/PHASE_END 为时间戳 now(ms)；
                                               // SETTINGS_CHANGED 为新 Settings 对象
  nextPhase(phase, restSec): phase,             // 相位转移（含 rest=0 跳过）
  cycleCompleteOnExit(phase, restSec): boolean, // EXHALE(rest=0) 或 REST 退出时 +1
  phaseDurationSec(s, phase): number,           // 当前设置下的相位时长
}
```

事件表（`handleEvent` 对非法事件返回原状态不变）：

| 事件 | 触发 | IDLE | RUNNING | PAUSED |
|---|---|---|---|---|
| START | 点击开始 | → RUNNING/INHALE，`phaseEndAt=now+inhale*1000`，`cycleCount=0`，`startedAt=now` | 忽略 | 忽略 |
| PAUSE | 点击暂停 | 忽略 | → PAUSED，保存 `pausedRemainMs=phaseEndAt-now` | 忽略 |
| RESUME | 点击继续 | 忽略 | 忽略 | → RUNNING，`phaseEndAt=now+pausedRemainMs` |
| STOP | 点击停止 | 忽略 | → IDLE（清零） | → IDLE（清零） |
| PHASE_END | 主循环检测到倒计时归零 | 忽略 | 按 §6 转移相位 | 忽略 |
| SETTINGS_CHANGED | 运行中改设置 | 更新引用 | 更新引用（当前相位不中断） | 更新引用 |

### 5.3 `js/timer.js`（纯逻辑，UMD）

```js
BT.timer = {
  remainingMs(s, now): number,          // max(0, phaseEndAt - now)
  elapsedMs(s, now): number,            // 会话总用时（含暂停前累计）
  formatSec(ms): string,                // "2.0 s"
  formatClock(ms): string,              // "1:24"
}
```

### 5.4 `js/audio.js`（浏览器）

```js
BT.audio = {
  init(): void,                 // 首次用户手势中调用：创建 AudioContext + 主 Gain
  playPhase(phase, durationSec): void,  // 调度相位音效（INHALE/HOLD/EXHALE/REST）
  stopAll(): void,              // 停止全部音源（100ms 淡出防爆音）
  setVolume(v: number): void,   // 0~1，作用于主 Gain
  setMuted(b: boolean): void,
}
```

### 5.5 `js/ui.js`（浏览器）

```js
BT.ui = {
  renderSession(s, settings): void,  // 相位文字/剩余秒/环形进度/周期数/总用时
  renderControls(status): void,      // 按钮显隐与文案（开始/暂停/继续/停止）
  renderSettings(settings): void,    // 设置表单回显（不触发事件循环）
}
```

### 5.6 `js/app.js`（浏览器）

```js
BT.app = {
  start(): void,   // 绑定全部事件、加载设置、启动 rAF 主循环、首次渲染
}
```

职责：事件监听（按钮/输入/模式/音量）、主循环、编排 handleEvent → audio/ui、`SETTINGS_CHANGED` 派发。

## 6. 状态机与相位机详细设计

### 6.1 会话状态（SessionState）

```js
SessionState = {
  status: 'IDLE'|'RUNNING'|'PAUSED',
  phase: 'INHALE'|'HOLD'|'EXHALE'|'REST',
  phaseEndAt: number,        // 相位结束绝对时间戳 ms
  phaseStartedAt: number,    // 相位开始绝对时间戳 ms（进度渲染用；RESUME 时按剩余反推）
  pausedRemainMs: number,    // 暂停时保存的剩余 ms
  cycleCount: number,        // 已完成周期数
  startedAt: number,         // 本次会话开始时间戳 ms
  settings: Settings,        // 当前生效设置引用（SETTINGS_CHANGED 时替换）
}
```

### 6.2 相位转移（PHASE_END 处理）

```
输入：当前 phase，当前 settings
nextPhase:
  INHALE → HOLD
  HOLD   → EXHALE
  EXHALE → restSec > 0 ? REST : INHALE   （rest=0 时跳过休息）
  REST   → INHALE

周期 +1（cycleCompleteOnExit）时机：
  EXHALE 结束且 restSec == 0  → +1（该周期无休息相位）
  REST 结束（restSec > 0）    → +1

新相位时长：phaseDurationSec = 从**最新 settings**读取（实现"运行中修改即时生效"）
新 phaseEndAt = now + 新相位时长 × 1000
```

### 6.3 运行中修改设置（SETTINGS_CHANGED）

- 仅替换 `session.settings` 引用；**当前相位剩余时间不变**；
- 下一次 PHASE_END 转移时自动使用新时长；
- 空闲/暂停态同样替换引用，开始后即用新值。

## 7. 计时机制

1. 主循环用 `requestAnimationFrame`，仅在 RUNNING 时活跃（IDLE/PAUSED 时挂起，省电）；
2. 每帧 `now = Date.now()`，`remaining = session.phaseEndAt - now`；
3. `remaining <= 0` → `handleEvent(session,'PHASE_END',now)`；
4. UI 秒数显示取 `Math.ceil(remaining/100)/10`（保留 1 位小数）；
5. 暂停：保存 `pausedRemainMs`；恢复：`phaseEndAt = now + pausedRemainMs`——绝对时间戳差值，无累积误差；
6. 系统休眠/标签页后台导致帧暂停：恢复后 `remaining` 按真实时间戳重新计算，相位自动"补扣"，不依赖帧计数。

## 8. 音效引擎设计

### 8.1 音频路由图

```
白噪声 Buffer(2s 随机) ──► 带通 BiquadFilter ──► 相位 Gain ──► 主 Gain(音量/静音) ──► destination
    ▲                          ▲                     ▲
    │ 循环播放(loop)            │ INHALE:600Hz Q1.2    │ 包络调度(见 8.2)
    │                          │ EXHALE:350Hz Q1.0    │
    └── 每相位新建 BufferSource ─┘                     └── 每相位新建 GainNode
```

- 每相位创建**独立的** Source + Filter + Gain 链，相位结束 `stop()` 并断开（`onended` 中清理，防泄漏）；
- 休息相位：`OscillatorNode(sine 880Hz)` + Gain 短促包络（attack 5ms / 120ms 衰减）。

### 8.2 包络调度（基于 `ctx.currentTime` 前瞻调度）

| 相位 | 包络 |
|---|---|
| INHALE | gain 0 → 渐强至 1（attack = 20% 相位时长）→ 保持 → 结束前 200ms 线性淡出 |
| HOLD | 不播放（静音） |
| EXHALE | gain 0 → 快速到 0.8（50ms）→ 渐弱至 0（release = 30% 相位时长） |
| REST | 短促"叮"（880Hz，120ms） |

- 全部用 `GainNode.gain.setValueAtTime / linearRampToValueAtTime` 在 `ctx.currentTime` 时间轴预排，无需 setInterval 驱动音频；
- 音量滑块 → 主 Gain `setTargetAtTime`（100ms 平滑，防爆音）；静音 → 主 Gain 置 0 + `stopAll()`。

### 8.3 浏览器自动播放策略

- `AudioContext` 在用户首次点击"开始"的同一手势内创建并 `resume()`（`init()` 由 app.js 在 START 处理前调用）；
- 若创建失败（极少数环境）→ 降级为纯视觉模式，UI 提示"音效不可用"，功能不受影响。

## 9. 设置持久化与校验

- 键：`bt_settings_v1`，值为 `JSON.stringify(Settings)`；
- 读取：`try { JSON.parse } catch → DEFAULTS`；字段缺失/类型错误 → 该字段默认值；
- 写入：`try/catch` 静默失败（隐私模式 localStorage 不可用时仅本次会话生效）；
- 校验集中于 `settings.clamp()`，UI 输入与测试共用同一校验逻辑，杜绝"浏览器能过、Node 不过"的分叉。

## 10. UI 渲染策略

- 结构：单页固定布局（标题 / 模式 / 引导区 / 设置 / 控制 / 统计），按 PRD §4.1 线框；
- 环形进度：SVG `<circle>` + `stroke-dasharray`（`offset = (1 - remain/duration) × 周长`），相位色随相位变化：
  INHALE=青蓝 / HOLD=紫 / EXHALE=橙 / REST=灰绿（CSS 变量 `--phase-inhale` 等）；
- 相位文字 + `aria-live="polite"` 区域播报相位切换（可访问性）；
- 按钮态：IDLE 显示 [开始]；RUNNING 显示 [暂停][停止]；PAUSED 显示 [继续][停止]；
- 运行中设置输入保持可用（PRD：即时生效），输入失焦时 clamp 并保存；
- 移动端：`<meta viewport>` + 触控目标 ≥ 44px + 可选 `navigator.vibrate`（设置开关）。

## 11. 测试设计

> 命令：`node --test test/`　（Node ≥ 18，本机 node v24 可用，零依赖）

### 11.1 单元测试用例清单（实现时必须覆盖）

**stateMachine.test.js**
1. IDLE + START → RUNNING/INHALE，phaseEndAt = now + inhale×1000；
2. RUNNING + START / IDLE + PAUSE / IDLE + STOP 等非法事件 → 状态不变；
3. PHASE_END 依次流转 INHALE→HOLD→EXHALE→REST→INHALE，各相位时长取自 settings；
4. restSec=0：EXHALE 结束直接 → INHALE 且 cycleCount+1；
5. restSec>0：REST 结束 cycleCount+1；
6. PAUSE 保存剩余 → RESUME 后 phaseEndAt = now + 剩余（模拟 now 前进）；
7. STOP（RUNNING/PAUSED）→ IDLE 且 cycleCount=0；
8. SETTINGS_CHANGED 后 PHASE_END 使用新时长，当前相位不中断。

**timer.test.js**
1. remainingMs = phaseEndAt - now；归零钳制为 0；
2. elapsedMs 跨暂停累计正确；
3. formatSec / formatClock 输出格式。

**settings.test.js**
1. DEFAULTS 与 PRD 一致（2/20/10/20）；
2. clamp：越界（0、61、-1、'abc'、NaN）→ 回退默认/边界（rest 允许 0）；
3. load：损坏 JSON → DEFAULTS；缺字段 → 默认补全；
4. applyMode 填默认值且保留其余字段。

### 11.2 不可自动化的部分（手动清单，交付前执行）

音频听感、爆音、移动端振动、真实浏览器兼容、长时间运行——沿用 PRD §9.2 手动清单。

## 12. 开发与运行方式

| 场景 | 方式 |
|---|---|
| 使用（交付物） | 双击 `index.html`（file:// 直开，无任何服务器依赖） |
| 开发调试（可选） | `python -m http.server 8080` 后访问 `http://localhost:8080`（便于控制台调试） |
| 单元测试 | `node --test test/` |
| Git 工作流 | 每功能点 commit；每个里程碑一次快照（AGENTS.md） |

## 13. 兼容性与降级策略

| 能力 | 最低要求 | 降级 |
|---|---|---|
| 计时/设置 | 任意现代浏览器 | — |
| Web Audio | AudioContext（Chrome/Edge≥90、Firefox≥95、Safari≥15） | 创建失败 → 纯视觉模式 |
| 振动 | navigator.vibrate | 无则忽略（默认开，可关） |
| localStorage | 标准实现 | 不可用 → 会话内生效 |
| 布局 | 现代 CSS（变量/Grid/flex） | 不支持 → 仍可读（渐进增强） |

不做：IE、老旧内核。

## 14. 性能与内存

- 音频节点链用后 `disconnect()` + `onended` 置空引用，长时训练（≥1h）无泄漏；
- 白噪声 Buffer 单次生成（2s），所有相位共享复用；
- rAF 主循环仅在 RUNNING 时运行；
- 全应用无外部资源请求，加载即完成。

## 15. 风险与权衡

| 风险 | 缓解 |
|---|---|
| file:// 下无法用 ES Modules → 用 script 标签 | 加载顺序由 index.html 集中维护；UMD 保证可测性 |
| 无构建 → 无 tree-shaking/压缩 | 源码即产物，体积 < 50KB，无意义 |
| 合成音效听感风险 | 参数集中 `audioConfig`，M3 试听后微调（PRD §11 #2） |
| 后台标签页计时 | 时间戳驱动天然免疫（§7.6） |

## 16. 后续演进（V2 候选，不在 MVP 实现）

- PWA（manifest + service worker）离线安装；
- 跨会话统计持久化（localStorage 累计）；
- 更多模式（4-7-8 等）——`MODES` 数组扩展即可；
- 若复杂度上升（如统计图表）：再评估引入构建链/框架，届时先更新本文档。

---

*本文档为技术实现基准，与 docs/PRD.md 配套。任何实现偏离：先更新本文档 → 再改代码 → 提交对应 commit。*
