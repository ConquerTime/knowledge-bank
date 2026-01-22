# 微前端架构：Module Federation + React（Next.js + Vite）

> 微前端不是“把前端拆开部署”这么简单，它是组织结构、运行时隔离与治理体系的综合体。本文以 Module Federation 为主线，兼谈 iframe / single-spa，覆盖 Vite SPA 与 Next.js 的落地差异，并把共享依赖、样式隔离、路由/鉴权/埋点治理这些“真正难的部分”写清楚。

## 目录

1. [引言](#一引言)
2. [问题背景：为什么要微前端（以及为什么多数团队用不好）](#二问题背景为什么要微前端以及为什么多数团队用不好)
3. [设计目标（Design Goals）](#三设计目标design-goals)
4. [方案空间（Options）：iframe / single-spa / Module Federation](#四方案空间optionsiframe--single-spa--module-federation)
5. [对比表（Trade-off Matrix）](#五对比表trade-off-matrix)
6. [决策树：什么时候该上 MF，什么时候别上](#六决策树什么时候该上-mf什么时候别上)
7. [落地架构：Vite SPA（Federation 插件 + 部署策略）](#七落地架构vite-spafederation-插件--部署策略)
8. [落地架构：Next.js（SSR/RSC 限制与接入权衡）](#八落地架构nextjsssrrsc-限制与接入权衡)
9. [团队规范模板：共享依赖/路由/鉴权/埋点/错误治理](#九团队规范模板共享依赖路由鉴权埋点错误治理)
10. [迁移策略：从单体到微前端的分阶段路线](#十迁移策略从单体到微前端的分阶段路线)
11. [常见坑与反模式（Edge cases）](#十一常见坑与反模式edge-cases)
12. [参考资料](#十二参考资料)

---

## 一、引言

微前端在工程界流行的原因很直接：业务大了、团队多了、交付节奏不同步。拆分能降低冲突、提升并行度。但微前端失败也很常见——因为团队只做了“技术拆分”，没有同步建立：

- 共享依赖与版本策略（尤其 react/react-dom 单例）
- 样式隔离与全局副作用治理
- 路由/鉴权/埋点/错误边界的统一
- 发布与回滚机制

本文会把“技术实现”与“治理体系”放在同等优先级。

---

## 二、问题背景：为什么要微前端（以及为什么多数团队用不好）

### 2.1 适用的业务/组织信号（可量化）

- 3+ 团队并行交付，且互相 release 依赖造成阻塞
- 单体应用构建/发布耗时过长（例如 15–30min）
- 需求迭代需要“局部发布”，不希望整站回归
- 不同业务域生命周期不同（增长域 vs 存量域）

### 2.2 微前端常见失败原因

1. **共享依赖失控**：React 多实例、版本漂移、运行时冲突
2. **样式污染**：全局 CSS 覆盖、reset 冲突、CSS-in-JS hash 不一致
3. **路由割裂**：各子应用自管路由，壳层无法统一导航与鉴权
4. **体验不一致**：Loading/错误/埋点/权限逻辑重复且不一致
5. **治理缺失**：没有 ownership、没有发布协议、没有回滚策略

---

## 三、设计目标（Design Goals）

1. **独立交付**：子应用可独立构建/发布/回滚
2. **运行时可组合**：壳层可按需加载子应用能力（路由/组件/页面）
3. **共享依赖可控**：react/react-dom 等核心依赖单例，版本策略明确
4. **隔离与治理**：
   - 样式隔离（避免污染）
   - 全局副作用治理（事件、storage、globals）
5. **一致体验**：统一鉴权、埋点、错误边界、国际化、主题
6. **可观测与可运维**：灰度、降级、故障隔离、指标与告警

---

## 四、方案空间（Options）：iframe / single-spa / Module Federation

### 4.1 iframe

优点：
- 隔离强（CSS/JS 天然隔离）
- 失败隔离好

缺点：
- 体验割裂（路由、滚动、弹窗、登录态）
- 通信复杂（postMessage）
- 性能与 SEO 受限

适合：强隔离的后台/遗留系统接入。

### 4.2 single-spa（或类似框架）

优点：
- 应用级编排能力强（mount/unmount 生命周期）
- 框架无关（React/Vue/Angular 混用）

缺点：
- 需要较强的基座治理与约束
- 共享依赖与样式隔离仍需自建体系

适合：多框架共存、需要强编排的组织。

### 4.3 Module Federation（MF）

核心思想：在运行时从 remote 加载模块（组件/页面/工具），并通过 shared 配置共享依赖。

优点：
- 与构建工具结合紧密（webpack 生态成熟）
- 组件级/模块级复用自然
- 可做 runtime remote（动态切换 remote 地址）

缺点：
- shared 策略复杂（版本、单例、边界）
- SSR/RSC 场景限制多（Next.js 需要谨慎）

适合：React 生态、希望“模块级复用 + 独立部署”的组织。

---

## 五、对比表（Trade-off Matrix）

| 方案 | 隔离强度 | 体验一致性 | 共享依赖 | SSR/SEO | 组织/治理成本 | 适用 |
|------|----------|------------|----------|--------|--------------|------|
| iframe | 很强 | 低 | 几乎无 | 差 | 中 | 遗留系统/强隔离 |
| single-spa | 中 | 中 | 需要自建 | 中 | 高 | 多框架/强编排 |
| Module Federation | 中 | 高（可做到） | 强（需治理） | Next 场景复杂 | 中-高 | React 为主、模块复用 |

---

## 六、决策树：什么时候该上 MF，什么时候别上

### 6.1 什么时候上微前端（必要条件）

- 组织层面确实需要“独立发布”，且单体已经成为交付瓶颈
- 有能力投入“平台/基座”团队做治理
- 能建立 shared 依赖与版本策略（尤其 React 单例）

### 6.2 什么时候别上（或先用更轻方案）

- 仅仅因为“代码太大不好维护”：优先做模块化（FSD/分层）而不是微前端
- 没有统一治理：上了只会变成“多个单体的拼盘”
- 强 SSR/SEO 场景且无法接受 Next 的限制：先做“多应用 + 网关”或“边界拆分”

---

## 七、落地架构：Vite SPA（Federation 插件 + 部署策略）

### 7.1 基本形态：host + remotes

- **host（shell）**：路由、鉴权、布局、加载策略
- **remote（子应用）**：暴露页面/组件/工具模块

运行时通过 remoteEntry（或 manifest）加载模块。

### 7.2 共享依赖策略（关键）

必须明确：
- `react` / `react-dom` **单例**（singleton）
- 版本策略：
  - 强一致（strictVersion）
  - 或允许小版本兼容（semver）

经验结论：**React 相关依赖建议强一致**，否则 hook/runtime 问题很难排查。

### 7.3 部署与回滚

建议把 remote 的入口改成可版本化资源：

```
https://cdn.example.com/mf/user-center/1.2.3/remoteEntry.js
https://cdn.example.com/mf/user-center/manifest.json
```

host 通过 manifest 决定加载哪个版本，配合灰度与回滚。

### 7.4 Vite 的典型落地思路（概念级）

Vite 下常见做法是使用 federation 插件（例如 vite federation 生态），整体概念与 webpack MF 类似：
- remote 暴露模块（exposes）
- host 声明 remotes
- shared 声明共享依赖

无论具体插件如何，**治理点**不变：
- react 单例
- 共享依赖版本策略
- remote 地址可配置（支持灰度/回滚）

---

## 八、落地架构：Next.js（SSR/RSC 限制与接入权衡）

Next.js 的复杂点在于：
- SSR 需要在服务端就能 resolve module
- App Router 引入 RSC/Client Boundary：remote 多数情况下只能在 Client 侧加载

### 8.1 常见接入形态（推荐优先级）

1. **Next 作为壳层（host），remote 作为 client-only 模块**
   - 在 Client Component 中动态加载 remote
   - 牺牲部分 SSR，但换取接入稳定
2. **Next（webpack）+ nextjs-mf 等方案（更深集成）**
   - 适合 Pages Router 或对 webpack 生态依赖更强的场景
   - App Router/RSC 下限制更多，需要谨慎评估

### 8.2 RSC/Client Boundary 的现实建议

如果 remote 需要交互（几乎都需要），那它必须运行在 Client Component 中。典型模式是：

```
app/(dashboard)/users/page.tsx         # Server：数据/权限/壳层
app/(dashboard)/users/RemoteUsers.tsx  # Client：加载 remote
```

`RemoteUsers.tsx`（Client，概念示意）：

```tsx
'use client';

import React, { Suspense, useMemo } from 'react';

export function RemoteUsers() {
  const RemoteComponent = useMemo(() => {
    // 伪代码：通过 runtime loader 加载 remote 暴露模块
    return React.lazy(() => import('userCenter/UsersPage'));
  }, []);

  return (
    <Suspense fallback={<div>Loading remote...</div>}>
      <RemoteComponent />
    </Suspense>
  );
}
```

注意：
- `React.lazy` 是 client-only 的典型方案
- SSR 时不会执行 remote 加载（因此 SEO/首屏要评估）

### 8.3 路由集成：host 统一路由，remote 提供页面模块

推荐：
- host 决定 URL 与权限
- remote 暴露“Page Component”（纯 UI + 本域路由内部可选）

如果 remote 还需要子路由：
- 让 remote 在自己的路由前缀下用内部 router（嵌套路由），但 host 仍掌控顶层入口与鉴权。

---

## 九、团队规范模板：共享依赖/路由/鉴权/埋点/错误治理

### 9.1 shared 依赖治理（必须写成文档 + CI）

建议制定“共享白名单”：
- 必须 singleton：`react`, `react-dom`
- 建议共享：`react-router`, `@tanstack/query`, `zustand`（视情况）
- 禁止共享：业务包（避免隐式耦合）

并明确版本策略：
- React 强一致（同 major/minor）
- 其他依赖可 semver 范围

### 9.2 样式隔离策略

常见方案：
- CSS Modules（天然局部）
- 约定前缀（BEM + app prefix）
- Shadow DOM（隔离强，但复杂）
- CSS-in-JS（注意 hash 冲突与运行时注入顺序）

经验：多数组织用 **CSS Modules + 约定前缀** 就足够，必要时对特定子应用上 Shadow DOM。

### 9.3 鉴权与会话

不要让每个 remote 自己做登录态：
- host 负责 token/会话刷新
- remote 通过统一 SDK 读取身份（或通过 props 注入）

### 9.4 埋点与错误边界

建议：
- host 提供埋点 SDK 与错误上报 SDK
- remote 只调用统一接口
- host 在 remote 外层包 ErrorBoundary，做到故障隔离与降级

PR Checklist（可直接用）：

```markdown
## Micro-frontend Checklist

- [ ] remote 是否声明了 shared 策略（react 单例）？
- [ ] 是否引入了全局样式？是否隔离/前缀化？
- [ ] 路由入口是否由 host 控制？鉴权是否统一？
- [ ] 是否有错误边界与降级策略？
- [ ] 是否支持灰度/回滚（manifest 或版本化 remoteEntry）？
```

---

## 十、迁移策略：从单体到微前端的分阶段路线

### 10.1 推荐路线（避免大爆炸）

1. **先做模块化（FSD/边界规则）**：在单体内把边界治理好
2. **挑一个低耦合域试点**：例如用户中心/运营后台
3. **以“页面级 remote”开始**：不要一上来做细粒度组件级共享
4. **建立 shared/manifest/灰度体系**：技术接入稳定后再扩大范围
5. **逐步拆分构建与发布**：把试点域独立 pipeline

### 10.2 何时引入“跨应用组件共享”

只有当以下条件满足时才建议做组件级共享：
- 设计系统已稳定（tokens/theme/component）
- 版本策略与发布流程成熟
- 有平台团队负责兼容与回滚

否则组件共享只会变成“跨团队耦合”。

---

## 十一、常见坑与反模式（Edge cases）

### 11.1 React 多实例导致 hooks 崩溃

现象：`Invalid hook call`、context 不生效、ref 行为异常。  
原因：react 不是单例或版本不一致。

治理：shared singleton + peerDependencies + 版本锁定策略。

### 11.2 共享依赖版本漂移（隐性）

某 remote 升级了 `react-router`，host 未升级，路由上下文不兼容。

治理：
- 对关键共享库建立版本矩阵
- CI 检查 shared 版本范围

### 11.3 样式注入顺序不一致

CSS-in-JS 运行时注入顺序不同会导致覆盖关系随机。

治理：
- 尽量用 CSS Modules / 约定前缀
- 或统一 style insertion point

### 11.4 路由与鉴权重复实现

remote 自己做鉴权，会出现：
- 登录态不一致
- 重定向逻辑冲突

治理：host 统一入口与鉴权，remote 只做能力。

---

## 十二、参考资料

1. [Webpack - Module Federation](https://webpack.js.org/concepts/module-federation/)
2. [single-spa](https://single-spa.js.org/)
3. [micro-frontends.org](https://micro-frontends.org/)
4. [Next.js - Server and Client Components](https://nextjs.org/docs/app/building-your-application/rendering/server-and-client-components)

