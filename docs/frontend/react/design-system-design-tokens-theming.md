# 设计系统：Design Tokens 与主题系统落地（Next.js + Vite）

> 设计系统不是“做一套组件库皮肤”，而是一条可演进的工程链路：**tokens → theme → component**。本文从 tokens 建模、主题注入、暗色模式、跨端一致性讲起，对比主流 CSS 方案（styled-components/Emotion/Vanilla Extract/Tailwind），并分别给出 Next.js（SSR/Streaming）与 Vite（CSR）下的落地清单与避坑指南。

## 目录

1. [引言](#一引言)
2. [问题背景：为什么主题/样式会成为系统性风险](#二问题背景为什么主题样式会成为系统性风险)
3. [设计目标（Design Goals）](#三设计目标design-goals)
4. [方案空间（Options）](#四方案空间options)
5. [对比表（Trade-off Matrix）](#五对比表trade-off-matrix)
6. [决策树：如何选 tokens 形态与 CSS 方案](#六决策树如何选-tokens-形态与-css-方案)
7. [落地架构：tokens → theme → component（贯通示例）](#七落地架构tokens--theme--component贯通示例)
8. [Next.js：SSR/Streaming 下的主题注入与 FOUC 治理](#八nextjsssrstreaming-下的主题注入与-fouc-治理)
9. [Vite SPA：CSR 下的主题初始化与切换体验](#九vite-spacsr-下的主题初始化与切换体验)
10. [团队规范模板：Design Review / PR Checklist / ADR](#十团队规范模板design-review--pr-checklist--adr)
11. [迁移策略：从“散落 CSS”到“设计系统链路”](#十一迁移策略从散落-css-到设计系统链路)
12. [常见坑与反模式（Edge cases）](#十二常见坑与反模式edge-cases)
13. [参考资料](#十三参考资料)

---

## 一、引言

很多团队把“设计系统”理解为：
- 做一套 Button/Input/Modal
- 再做个暗色模式

但真正难的是长期演进：品牌升级、跨端一致性、主题扩展、性能与 SSR/CSR 体验、以及“谁能改、怎么改、怎么发布”。这要求你把系统拆成三层：

1. **Design Tokens**：设计语义的“数据层”（颜色、字体、间距、圆角、阴影…）
2. **Theme**：将 token 映射到运行时可用的变量（CSS variables / JS theme object）
3. **Component**：组件消费 theme（样式与交互），并维持 API 稳定

这条链路越清晰，设计系统越可治理。

---

## 二、问题背景：为什么主题/样式会成为系统性风险

### 2.1 典型症状（可量化）

- **视觉不一致**：同名颜色在不同页面是不同值；组件库与业务样式互相覆盖。
- **暗色模式“补丁化”**：某些页面支持，某些页面不支持；切换闪烁明显（FOUC）。
- **跨端割裂**：Web、H5、RN 或多站点（多品牌）无法共享基础语义。
- **性能问题**：运行时 CSS-in-JS 导致首屏抖动/额外开销；SSR 下 hydration 频繁 mismatch。
- **治理难**：改一个 token 影响范围不可知；回滚困难；设计/研发对齐成本高。

### 2.2 根因：缺少“语义层”与“注入策略”

如果你的样式直接写成：
- `#1677ff`
- `margin: 12px`
- `font-size: 14px`

那它就不可演进。设计系统要把它们变成语义：
- `color.primary`
- `space.3`
- `font.body.md`

并且把“主题注入”做成一个稳定机制，避免“渲染后再修正”的闪烁与 mismatch。

---

## 三、设计目标（Design Goals）

1. **语义化 tokens**：设计语义（role）优先于原子值（value）
2. **可主题化**：同一语义可映射到 light/dark/brandA/brandB
3. **跨端可复用**：tokens 可用于 CSS vars、JS、甚至其他端（RN/Flutter）导出
4. **稳定注入**：
   - Next.js：SSR/Streaming 下首屏不闪烁、不中断 hydration
   - Vite：CSR 下首次渲染稳定、切换顺滑
5. **组件消费方式统一**：组件不直接写 hard-coded 值，只消费 theme/tokens
6. **可治理**：变更可追踪（changelog）、可回滚（版本）、可限制（lint/审查）

---

## 四、方案空间（Options）

### 4.1 Tokens 形态选择

常见三种形态：

1. **JSON Tokens**（推荐作为“源”）
   - 便于跨端导出与设计工具对接
2. **TS Tokens**（开发体验好）
   - 适合做类型约束与计算（如 derived tokens）
3. **CSS Variables**（运行时消费）
   - 最适合主题切换（低成本、浏览器原生）

工程上常见最佳实践：**JSON/TS 作为源 → 编译生成 CSS Variables + TS types**。

### 4.2 主题注入策略

常见策略：
- `data-theme` / `class` 放在 `<html>` 上
- 通过 `<style>` 或 CSS 文件提前注入变量
- 在启动阶段用 inline script 读取用户偏好并尽早设置（避免 FOUC）

### 4.3 CSS 方案选型

本文聚焦四类：

- styled-components（runtime CSS-in-JS）
- Emotion（runtime / 可选编译优化）
- Vanilla Extract（build-time CSS-in-TS）
- Tailwind（utility-first）

（CSS Modules/原生 CSS 也可作为 baseline；大多数 Docusaurus/文档站本身就用 CSS Modules。）

---

## 五、对比表（Trade-off Matrix）

| 方案 | 运行时成本 | SSR 体验 | 主题切换 | 类型/约束 | 团队规模适配 | 备注 |
|------|------------|----------|----------|----------|--------------|------|
| styled-components | 中-高（运行时生成） | 需要 SSR 配置 | 好（theme provider） | 中 | 中大型 | 生态成熟，但性能与 RSC 约束需评估 |
| Emotion | 中（可优化） | 需要 SSR 配置 | 好 | 中-高 | 中大型 | 适合需要灵活动态样式的团队 |
| Vanilla Extract | 低（编译期） | 友好 | 好（CSS vars） | 高 | 中大型 | 推荐用于“设计系统 + 主题”长期资产 |
| Tailwind | 低（预编译） | 友好 | 中（dark class/vars） | 中 | 各规模 | 适合快速交付，但 tokens 语义化要额外治理 |

补充判断：
- 你如果把“主题切换”做成 **CSS variables**，大多数方案都能很好支持。
- 真正差异在 **运行时开销、SSR/Streaming 的复杂度、类型约束与治理**。

---

## 六、决策树：如何选 tokens 形态与 CSS 方案

### 6.1 tokens 形态（建议）

- 需要跨端/多品牌/长期资产 → **JSON/TS 作为源 + 生成 CSS variables**
- 仅单站点、主题少且不变 → 直接 CSS variables 或 Tailwind config 也可

### 6.2 CSS 方案选择（简化指南）

1. 你是否非常在意 SSR/Streaming 与性能（Next.js）？
   - 是 → 优先 Vanilla Extract / CSS Modules / Tailwind + CSS vars
2. 你是否需要大量运行时动态样式（依赖复杂状态计算）？
   - 是 → Emotion/styled-components（但要接受 SSR 配置与运行时成本）
3. 你是否需要强类型约束与可重构性（tokens/theme typed）？
   - 是 → Vanilla Extract 或 TS theme object

---

## 七、落地架构：tokens → theme → component（贯通示例）

下面给出一个“可运行时切换主题 + 组件只消费语义”的最小闭环。

### 7.1 tokens（源）

以 JSON 为源（示意）：

```json
{
  "color": {
    "bg": { "value": "#ffffff" },
    "fg": { "value": "#111111" },
    "primary": { "value": "#1677ff" }
  },
  "space": {
    "1": { "value": "4px" },
    "2": { "value": "8px" },
    "3": { "value": "12px" }
  },
  "radius": {
    "md": { "value": "10px" }
  }
}
```

暗色/多品牌通常有两种做法：
- 维护多份 token（light/dark）
- 维护一份语义 token + 不同 theme 映射（推荐：更像“语义 → 主题”）

### 7.2 theme（CSS variables）

用 CSS variables 做运行时主题：

```css
/* theme.css（示意） */
:root[data-theme='light'] {
  --color-bg: #ffffff;
  --color-fg: #111111;
  --color-primary: #1677ff;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --radius-md: 10px;
}

:root[data-theme='dark'] {
  --color-bg: #0b0f17;
  --color-fg: #e6e8ee;
  --color-primary: #6aa9ff;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --radius-md: 10px;
}
```

### 7.3 component（只消费语义）

组件样式只引用变量：

```css
.button {
  background: var(--color-primary);
  color: var(--color-bg);
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-3);
}
```

切换主题只需要修改 `<html data-theme>`，不需要重建 CSS，不需要重渲染整棵树。

### 7.4 tokens → theme 的“工程化生成”（建议）

真实项目不建议手写映射，而是：
- tokens（JSON/TS）作为源
- 脚本生成 `theme.css`（或多个 theme css）
- 同时生成 `tokens.d.ts`/`theme.ts` 便于类型与消费

这部分与 Monorepo 文章中的 `@acme/tokens` 包是同一条链路：tokens 包对外提供：
- `dist/theme.css`
- `dist/tokens.d.ts`（可选）

---

## 八、Next.js：SSR/Streaming 下的主题注入与 FOUC 治理

Next.js 的核心挑战是：**SSR 输出时就要决定主题属性**，否则客户端 hydration 前会出现闪烁或 mismatch。

### 8.1 推荐策略：尽早设置 `<html data-theme>`

优先级建议：
1. 用户显式选择（localStorage/cookie）
2. 系统偏好（`prefers-color-scheme`）
3. 默认主题（light）

最关键点：**在 React hydration 之前执行**。

典型做法（伪代码，说明思路）：

```tsx
// layout.tsx（示意）
export default function RootLayout({ children }) {
  return (
    <html data-theme="light">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var stored = localStorage.getItem('theme');
                  var theme = stored || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
                  document.documentElement.setAttribute('data-theme', theme);
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

说明：
- 这是“体验优先”的策略：首屏不闪烁
- 同时要避免 hydration mismatch：SSR 默认 `data-theme="light"`，脚本会在 hydration 前纠正

更严谨的做法是：把主题保存在 **cookie**，在服务端就读取并输出正确的 `data-theme`（减少不确定性）。

### 8.2 Streaming 的额外注意点

Streaming SSR 下，如果主题相关 CSS/字体加载顺序不稳定，FOUC 更明显。

建议：
- theme.css 尽量作为全局样式提前加载
- 字体使用 Next 推荐方案（例如 `next/font`）保证一致性（避免字体切换导致布局抖动）

### 8.3 RSC/Client Boundary 与主题切换

主题切换 UI（按钮/开关）必然是 Client Component，但主题状态应尽量只体现在 `<html>` 属性与 CSS vars 上，避免让“主题状态”变成全局 React state 导致大面积 re-render。

---

## 九、Vite SPA：CSR 下的主题初始化与切换体验

Vite SPA 没有 SSR，FOUC 的本质是“首屏渲染前主题未知”。

### 9.1 推荐策略：入口 HTML 里提前执行初始化脚本

在 `index.html` 里放一段极小脚本：
- 读取 localStorage
- 回退 prefers-color-scheme
- 设置 `data-theme`

这样 React 启动时就已经是正确主题。

### 9.2 切换策略：只改属性，不做全局重渲染

切换时：
- `document.documentElement.dataset.theme = nextTheme`
- 同步写入 localStorage

组件消费 CSS vars，天然就切换了，不需要把 theme 放进 Redux/Zustand（除非你还有其他依赖）。

---

## 十、团队规范模板：Design Review / PR Checklist / ADR

### 10.1 Design Review Checklist（设计系统）

```markdown
## Design System Checklist

- [ ] 新增的是“语义 token”还是“具体值”？是否可以语义化？
- [ ] token 命名是否稳定、可扩展（brand/theme/scale）？
- [ ] 是否明确了 token 的影响范围（哪些组件/页面）？
- [ ] 主题注入策略是否符合 Next/Vite 的运行时约束？
- [ ] 是否提供迁移方案（旧变量 -> 新变量）？
```

### 10.2 PR Checklist（工程落地）

```markdown
## Theming PR Checklist

- [ ] 是否新增/修改 tokens？是否更新生成产物（theme.css/types）？
- [ ] 是否影响 SSR/首屏（Next.js）？是否会造成 FOUC/hydration mismatch？
- [ ] 是否引入新的 CSS 方案依赖（styled-components/Emotion/vanilla-extract）？
- [ ] 是否更新文档与示例（用法、反例、迁移说明）？
```

### 10.3 ADR 模板（主题策略）

```markdown
# ADR: Theming Strategy

## Context
- 站点类型：Next.js SSR/Streaming 或 Vite CSR
- 主题类型：light/dark/brand
- 性能目标：FOUC < 1 frame / 首屏 JS 开销

## Decision
- tokens 形态：JSON/TS/CSS vars
- 注入策略：cookie/inline script/html attribute
- 组件消费方式：CSS vars / theme provider

## Consequences
- 迁移成本：
- 运行时风险：
- 未来扩展（多品牌/跨端）：
```

---

## 十一、迁移策略：从“散落 CSS”到“设计系统链路” {#十一迁移策略从散落-css-到设计系统链路}

### 11.1 分阶段路线（推荐）

1. **先建立 tokens**：把现有颜色/间距收敛成语义 token（不追求完美，先可治理）
2. **引入 theme.css**：用 CSS vars 表达主题（light/dark），并在入口注入
3. **组件逐步替换 hard-coded 值**：每次改动触达一个组件就迁移一部分
4. **建立门禁**：禁止新增 hard-coded 色值（lint/评审）
5. **多品牌/多主题扩展**：稳定后再做 brandA/brandB

---

## 十二、常见坑与反模式（Edge cases）

### 12.1 token 命名“绑定具体颜色”

反模式：`blue500` 直接在组件里使用。  
问题：品牌换色时无法维护。

建议：组件用 `color.primary` / `color.surface` 等语义，而不是色阶。

### 12.2 主题状态放进全局 React state

反模式：`theme` 放 Redux，然后整个应用大量组件 re-render。  
更优：用 `<html data-theme>` + CSS vars，切换几乎零成本。

### 12.3 SSR 下先渲染 light，hydrate 后再切 dark（FOUC）

这是 Next.js 最常见问题之一。治理要点：
- 主题尽早确定（cookie 或 hydration 前脚本）
- 主题相关 CSS 尽量提前加载

### 12.4 Tailwind 下的“语义漂移”

Tailwind 很快，但容易让团队回到“写具体值”：
- `bg-blue-500`
- `px-3`

如果你要做设计系统资产化，建议：
- 用 CSS vars 驱动 Tailwind（例如 `bg-[var(--color-primary)]`）
- 或建立语义化的 class（`bg-primary`）并由 tokens 生成

---

## 十三、参考资料

1. [W3C Design Tokens Community Group](https://www.w3.org/groups/cg/design-tokens/)
2. [MDN - Using CSS custom properties (variables)](https://developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_custom_properties)
3. [Next.js - Rendering](https://nextjs.org/docs/app/building-your-application/rendering)
4. [Vanilla Extract](https://vanilla-extract.style/)
5. [Emotion](https://emotion.sh/docs/introduction)
6. [styled-components](https://styled-components.com/)
7. [Tailwind CSS - Dark mode](https://tailwindcss.com/docs/dark-mode)

