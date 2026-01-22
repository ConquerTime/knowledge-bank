# Monorepo 下的 React 组件库架构（pnpm workspace）

> 当团队开始做“组件库/设计系统”资产化时，真正的难点不在写组件，而在：包划分、构建产物、版本发布、消费兼容（Next/Vite）、以及如何防止“共享抽象”反噬业务演进。本文以 pnpm workspace 为主线，给出可落地的目录结构、构建与治理策略。

## 目录

1. [引言](#一引言)
2. [问题背景：为什么组件库会拖慢交付](#二问题背景为什么组件库会拖慢交付)
3. [设计目标（Design Goals）](#三设计目标design-goals)
4. [方案空间（Options）](#四方案空间options)
5. [对比表（Trade-off Matrix）](#五对比表trade-off-matrix)
6. [决策树：如何划包、如何构建、如何发版](#六决策树如何划包如何构建如何发版)
7. [落地架构：pnpm workspace 参考结构](#七落地架构pnpm-workspace-参考结构)
8. [消费方式：Next.js 与 Vite 的关键差异](#八消费方式nextjs-与-vite-的关键差异)
9. [团队规范模板：边界规则/发布流程/PR Checklist/ADR](#九团队规范模板边界规则发布流程pr-checklistadr)
10. [迁移策略：从单仓应用到组件库 Monorepo](#十迁移策略从单仓应用到组件库-monorepo)
11. [常见坑与反模式（Edge cases）](#十一常见坑与反模式edge-cases)
12. [参考资料](#十二参考资料)

---

## 一、引言

“Monorepo + 组件库”很容易被误解成“把组件挪到 packages/ 里”。真正的价值是：

- **把跨项目共享资产（UI/Hook/Tokens）变成可治理的产品**
- **用一致的构建、版本与质量门禁** 降低集成成本
- **让消费方（Next/Vite/Node）以可预测方式使用**，避免“本地能跑、线上爆炸”

---

## 二、问题背景：为什么组件库会拖慢交付

### 2.1 典型症状（可量化）

- **升级成本高**：组件库发一个小版本，业务项目需要修 10+ 处兼容问题。
- **重复封装**：业务团队嫌组件库不够用，自己在业务里再封一层，形成“双重抽象”。
- **构建产物不一致**：有的包 ESM，有的包 CJS；有的有 types，有的没有；样式导入路径混乱。
- **Next/Vite 兼容问题频发**：ESM/CJS、transpile、CSS side effects、tree-shaking 不一致。
- **版本策略混乱**：统一版本导致无关包也跟着发；独立版本导致依赖关系难追踪。

### 2.2 根因：缺少“产品化”的工程链路

组件库不是代码仓库，是产品：
- 有“用户”（业务团队）
- 有“发布节奏”
- 有“兼容契约”
- 有“质量门禁”

Monorepo 的关键目标是把这些契约落到工具链与流程里。

---

## 三、设计目标（Design Goals）

1. **清晰的包边界**：UI、Hooks、Tokens、Utils 等职责分离，避免循环依赖。
2. **稳定的发布契约**：语义化版本（SemVer）、变更说明、可回滚。
3. **一致的构建产物**：至少保证 `types` + `esm`（可选 `cjs`），并具备 tree-shaking 友好性。
4. **消费兼容**：Next.js（SSR/RSC/webpack 生态）与 Vite（esbuild/rollup）都能稳定消费。
5. **设计系统贯通**：tokens → theme → component 的链路在仓库内闭环（而不是散落在业务）。
6. **治理可自动化**：lint/边界规则/CI 校验/changeset 门禁。

---

## 四、方案空间（Options）

### 4.1 包划分策略：单包 vs 多包

- **单包（ui 一把梭）**
  - 优点：简单、少配置
  - 缺点：发布粒度大、tree-shaking 与依赖爆炸、难治理
- **多包（ui/hooks/tokens/utils）**
  - 优点：边界清晰、发布粒度合理、可按能力 ownership
  - 缺点：工程配置更复杂，需要边界工具

### 4.2 构建工具：tsup vs rollup（以及何时不构建）

常见选择：
- **tsup**：基于 esbuild，快、配置少，适合大多数工具包/组件包
- **rollup**：生态成熟、插件丰富，适合复杂的样式/多入口/高级 tree-shaking 需求
- **不构建（source-first）**：内部 monorepo 直接消费 TS 源码（需要消费方 transpile），对 Next 特别敏感

### 4.3 版本策略：统一版本 vs 独立版本（changesets）

- **统一版本（fixed）**：所有包同版本号
  - 优点：对齐简单、依赖关系清晰
  - 缺点：发布噪音大、无关改动也发版
- **独立版本（independent）**：每个包独立版本
  - 优点：发布粒度细、成本更贴近变更
  - 缺点：依赖关系需要工具维护（changesets 适合）

---

## 五、对比表（Trade-off Matrix）

| 维度 | 单包 | 多包（推荐） |
|------|------|--------------|
| 边界治理 | 弱 | 强 |
| 发布粒度 | 粗 | 细 |
| 依赖管理 | 简单但膨胀 | 复杂但可控 |
| 消费体验 | 一次装全套 | 按需引入 |
| 适合 | 小团队/短期 | 中大型/长期资产 |

| 构建工具 | 复杂度 | 构建速度 | 生态/插件 | 适合 |
|----------|--------|----------|----------|------|
| tsup | 低 | 很快 | 中 | 大多数 TS 包、组件包 |
| rollup | 中-高 | 中 | 很强 | 复杂打包/样式/多入口 |

---

## 六、决策树：如何划包、如何构建、如何发版

### 6.1 划包（packages）决策

1. 你的“设计系统”是否需要 tokens/theme？
   - 是 → 必须拆出 `tokens`（与 `ui` 解耦）
2. 你的 hooks 是否会被业务直接依赖？
   - 是 → 单独 `hooks` 包（避免 ui 强依赖）
3. 你的工具函数是否跨端/跨框架复用？
   - 是 → `utils` / `lib` 包（保持无 React 依赖）

推荐最小包集合：
- `@acme/tokens`
- `@acme/ui`
- `@acme/hooks`
- `@acme/utils`

### 6.2 构建产物决策（默认 ESM + types）

建议统一契约：
- `exports` 字段明确入口（避免深路径 import）
- 产物至少 `dist/index.js`（ESM）+ `dist/index.d.ts`
- 样式如果有，明确 `sideEffects` 与导入方式

### 6.3 发版决策（changesets）

如果你需要：
- 自动生成 changelog
- 选择性 bump 版本
- CI 自动发布

changesets 是当前主流解法。

---

## 七、落地架构：pnpm workspace 参考结构

### 7.1 目录结构（参考）

```
.
├── apps/
│   ├── web-next/                 # Next.js 应用（可选）
│   └── web-vite/                 # Vite SPA（可选）
├── packages/
│   ├── ui/
│   │   ├── src/
│   │   ├── package.json
│   │   └── tsup.config.ts
│   ├── hooks/
│   ├── tokens/
│   ├── utils/
│   ├── eslint-config/
│   └── tsconfig/
├── .changeset/
├── pnpm-workspace.yaml
└── package.json
```

### 7.2 包边界建议

- `tokens`：只包含“设计 token”（JSON/TS/CSS vars），不依赖 React
- `ui`：依赖 tokens（主题变量/类名），可选依赖 hooks（但尽量避免反向依赖）
- `hooks`：可依赖 utils，不依赖 ui（避免循环）
- `utils`：纯函数/无框架依赖

### 7.3 package.json（关键字段）

以 `@acme/ui` 为例（示意）：

```json
{
  "name": "@acme/ui",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "sideEffects": [
    "**/*.css"
  ],
  "peerDependencies": {
    "react": ">=18",
    "react-dom": ">=18"
  }
}
```

要点：
- `peerDependencies`：避免把 react 打进包里（减少重复 React/版本漂移）
- `exports`：锁定公共 API，减少深路径 import
- `sideEffects`：避免样式被 tree-shaking 掉

### 7.4 构建：tsup 的典型配置（示意）

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  external: ['react', 'react-dom'],
});
```

说明：
- 对组件库，**把 react/react-dom external** 是基本要求（否则会打包进产物）。
- 是否需要 `cjs`：现代前端多为 ESM；如果有 legacy Node/工具需求再补。

---

## 八、消费方式：Next.js 与 Vite 的关键差异

### 8.1 Next.js：transpilePackages / RSC 约束 / CSS 导入

Next.js 常见坑：
- workspace 包默认是 TS 源码时，Next 需要 transpile
- App Router 下 Server/Client 边界更严格：ui 包若默认 client-only，需要明确入口
- CSS 导入策略要与 Next 的 CSS 规则匹配

建议：
- 对 workspace 包，Next 项目配置 `transpilePackages: ['@acme/ui', '@acme/tokens']`
- ui 包内部尽量拆分：
  - server-safe（纯展示）入口
  - client-only（交互）入口（可选）

### 8.2 Vite：依赖预构建 / ESM 优先 / CSS 处理

Vite 通常更喜欢 ESM：
- `type: module` + ESM 输出最顺滑
- workspace 包如果是 TS 源码，Vite 也能处理，但需注意 optimizeDeps 与 symlink 行为

建议：
- 对外发布（或多项目消费）仍以“构建产物”为主，减少环境差异
- 统一 `exports`，避免业务深路径 import 导致后续重构困难

---

## 九、团队规范模板：边界规则/发布流程/PR Checklist/ADR

### 9.1 包边界规则（建议写进 lint）

规则示例：
- `packages/tokens` 禁止依赖 `packages/ui`
- `packages/utils` 禁止依赖 React
- `packages/ui` 禁止 import `apps/*`

### 9.2 发布流程（changesets）

建议流程：

1. 每个 PR 如果影响 public API 或包行为，必须添加 changeset
2. main 合并后由 CI 执行：
   - `changeset version`（更新版本与 changelog）
   - `pnpm -r build`
   - `changeset publish`

### 9.3 PR Checklist（组件库）

```markdown
## Monorepo Component Library Checklist

- [ ] 是否改变了 public API（exports）？是否有 changeset？
- [ ] 是否引入了新的 peerDependencies？
- [ ] 是否破坏 Next/Vite 兼容（ESM/CSS/RSC）？
- [ ] 是否新增了跨包依赖？是否可能造成循环依赖？
- [ ] 是否更新了文档/用例（Storybook 或 demo）？
```

---

## 十、迁移策略：从单仓应用到组件库 Monorepo

### 10.1 分阶段路线

1. **先抽 tokens**：把颜色/间距/字体等从业务样式中抽出，形成可复用的 design tokens
2. **再抽 ui primitives**：Button/Input/Modal 这类基础组件，避免带业务
3. **最后抽 hooks/utils**：当复用点稳定后再抽（避免过早抽象）
4. **引入 changesets**：先建立发布契约，再开始“跨项目复用”

### 10.2 迁移时的“边界策略”

- 允许在过渡期保留“业务层封装”，但要明确：
  - 业务封装不进入 `ui` 包
  - 最终目标是业务封装回归 feature 层

---

## 十一、常见坑与反模式（Edge cases）

### 11.1 重复 React（最致命）

现象：hooks 报错 “Invalid hook call”，或 `react` 有多个实例。

治理：
- `react/react-dom` 必须是 peerDependencies
- pnpm 下注意 workspace 的依赖提升与锁定

### 11.2 exports 漏洞导致深路径 import

如果不设置 `exports`，业务会开始写：
`@acme/ui/src/components/Button`

后果：你再也无法重构目录。  
解决：统一 public API，从 `index.ts` 导出。

### 11.3 样式被 tree-shaking 掉

如果包里有 CSS，但没声明 `sideEffects`，构建工具可能移除导入。

解决：为 CSS 声明 sideEffects，或改用 CSS-in-JS/vanilla-extract（取舍见设计系统文章）。

### 11.4 Next.js 下 RSC/Client 误用

如果 ui 包默认 `use client`，会导致整个引用链变成 client bundle。

策略：
- 把交互组件标记为 client-only
- 保留 server-safe 的纯展示组件（或把交互组件作为独立入口）

---

## 十二、参考资料

1. [pnpm Workspaces](https://pnpm.io/workspaces)
2. [Changesets](https://github.com/changesets/changesets)
3. [Next.js - transpilePackages](https://nextjs.org/docs/app/api-reference/next-config-js/transpilePackages)
4. [Node.js - package exports](https://nodejs.org/api/packages.html#exports)

