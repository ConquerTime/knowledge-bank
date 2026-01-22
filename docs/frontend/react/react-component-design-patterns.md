# React 组件设计模式：Compound / Headless / Controlled / Slot API（Next.js + Vite）

> 面向高级工程师的组件架构选型指南：从“复用 UI”走向“复用能力”，用可演进的 API 设计把复杂度留在组件内部，并在 Next.js（RSC/Client Boundary）与 Vite SPA（纯 CSR）两种场景下给出可落地的实现与治理模板。

## 目录

1. [引言](#一引言)
2. [问题背景：为什么组件层会变成架构瓶颈](#二问题背景为什么组件层会变成架构瓶颈)
3. [设计目标（Design Goals）](#三设计目标design-goals)
4. [方案空间（Options）](#四方案空间options)
5. [对比表（Trade-off Matrix）](#五对比表trade-off-matrix)
6. [决策树：什么时候选什么（以及什么时候别选）](#六决策树什么时候选什么以及什么时候别选)
7. [落地架构：Next.js（App Router / RSC）](#七落地架构nextjsapp-router--rsc)
8. [落地架构：Vite SPA（CSR）](#八落地架构vite-spa-csr)
9. [团队规范模板：Lint/PR Checklist/ADR](#九团队规范模板lintpr-checklistadr)
10. [迁移策略：从现状到目标（避免大爆炸重构）](#十迁移策略从现状到目标避免大爆炸重构)
11. [常见坑与反模式（Edge cases）](#十一常见坑与反模式edge-cases)
12. [参考资料](#十二参考资料)

---

## 一、引言

组件设计模式讨论经常陷入“写法偏好”（Compound 更优雅 / Hooks 更现代 / Headless 更灵活），但在大多数真实业务里，决定你是否需要某种模式的不是“代码好看”，而是：

- **组织复杂度**：多团队协作、跨业务复用、版本治理
- **运行时约束**：SSR/RSC、Hydration、并发渲染、样式隔离
- **交付节奏**：不断演进的需求与 API 稳定性之间的张力

本文把常见组件模式统一到一套“架构视角”的选择框架，并在 **Next.js App Router（RSC/Client 边界）** 与 **Vite SPA（CSR）** 两类环境分别给出落地样例与规范模板。

---

## 二、问题背景：为什么组件层会变成架构瓶颈

### 2.1 典型症状（可量化）

当团队规模和代码规模进入一定量级，组件层常见痛点会同时出现：

- **复用率低但耦合高**：复用一个 Button，却要带上一整套业务状态/接口调用。
- **Props 爆炸**：一个组件 30+ props，既有样式又有业务，又有可访问性，又有埋点开关。
- **重写多于复用**：同类组件出现 3–5 个实现（“这个业务要个特殊交互”）。
- **性能与一致性冲突**：为了性能把组件拆到不可维护；为了统一把组件做成全能怪物。
- **跨框架/运行时问题**：Next.js 中把交互组件放到 Server Component 里导致边界混乱；Vite SPA 中则是状态组织随意增长、难以收敛。

### 2.2 根因：组件 API 的“能力边界”不清晰

组件本质是 “**能力封装 + 协作契约（API）**”。一旦 API 设计把边界做错，复杂度会沿着三条路径扩散：

1. **向上扩散**：调用方需要知道组件内部细节（例如必须按某顺序传入 props 才能工作）。
2. **向下扩散**：组件为了适配所有场景，不断引入分支和开关。
3. **横向扩散**：相似能力在多个组件中重复实现，形成“分叉生态”。

---

## 三、设计目标（Design Goals）

以组件库/业务组件的“可演进性”为核心，建议把目标显式化（可写入 ADR）：

1. **可组合（Composability）**：调用方可以用组合而不是开关来扩展能力。
2. **边界明确（Boundary）**：UI、状态、数据、side effects、样式职责可拆可合。
3. **可测试（Testability）**：核心逻辑能在无 DOM / 低成本环境下测试；UI 可做快照或交互测试。
4. **可控的 API 演进（API Evolution）**：新增能力尽量不破坏既有调用；支持渐进迁移。
5. **运行时友好（Runtime Fit）**：
   - Next.js：RSC/Client 边界清晰，避免 Hydration mismatch。
   - Vite SPA：路由级拆分、状态共享与性能可控。
6. **治理成本可控（Governance）**：能用 lint/规则约束“正确用法”，而不是靠口头约定。

---

## 四、方案空间（Options）

下面这些模式并不是互斥的；大部分成熟组件库会把它们组合使用。

### 4.1 Compound Components（复合组件）

**关键词**：Context + 语义化子组件 + 组合表达结构。

典型形态：

```tsx
<Tabs defaultValue="profile">
  <Tabs.List>
    <Tabs.Trigger value="profile">Profile</Tabs.Trigger>
    <Tabs.Trigger value="billing">Billing</Tabs.Trigger>
  </Tabs.List>
  <Tabs.Content value="profile">...</Tabs.Content>
  <Tabs.Content value="billing">...</Tabs.Content>
</Tabs>
```

适合：结构复杂、有强语义的组件（Tabs/Accordion/Menu/Dropdown/Modal）。

### 4.2 Render Props（渲染属性）vs Hooks（逻辑 Hook）

**Render Props** 把状态/行为以函数参数形式暴露：

```tsx
<Toggle>
  {({ on, setOn }) => (
    <button onClick={() => setOn(!on)}>{on ? 'ON' : 'OFF'}</button>
  )}
</Toggle>
```

**Hooks** 把状态/行为以 Hook 返回值暴露：

```tsx
const toggle = useToggle();
return <button onClick={toggle.toggle}>{toggle.on ? 'ON' : 'OFF'}</button>;
```

主差异不是“新旧”，而是：
- Render Props 更适合 **把能力注入到任意渲染树**（无 hooks 约束、可跨组件层级注入）。
- Hooks 更适合 **逻辑复用与组合**（hooks 之间可互相调用、更利于分层）。

### 4.3 Headless Components（无样式组件）/ Controller Pattern

把“交互状态机/可访问性/键盘行为”与“UI 外观”分离：

- **Headless**：提供状态与绑定 props（或子组件），不提供样式。
- **Controller**：提供渲染无关的控制器对象（更偏业务/领域）。

适合：设计系统需要多主题、多品牌、多 UI 形态复用同一行为。

### 4.4 Controlled vs Uncontrolled（受控/非受控）

核心不是“表单”，而是 **状态所有权**：

- Uncontrolled：状态在组件内部，调用方只关心结果（简单好用）。
- Controlled：状态在外部，组件成为“视图”，更易与路由/URL/全局状态同步。

成熟组件一般同时支持两者（优先 Uncontrolled，必要时 Controlled）。

### 4.5 Slot API（插槽 API）/ Polymorphic / asChild

在 React 中用“插槽”表达结构与替换点（常见于 Radix UI / Headless UI 的生态）：

- `slots`/`components`/`renderXxx`：让调用方替换局部子结构。
- `asChild`/`as`：让组件把语义标签交给调用方（避免多层嵌套）。

适合：需要强可定制但不想暴露内部 DOM 结构的组件。

### 4.6 “业务组件”常见误区：把数据获取塞进 UI

如果组件同时负责：
- 数据获取（fetch/query）
- 权限与路由（auth/router）
- 状态机（interaction）
- UI 表现（view）

那它很难作为“组件库资产”沉淀。建议显式拆成：
- **UI Component**（纯视图/可访问性/交互）
- **Container/Feature**（业务编排/数据获取/权限）

---

## 五、对比表（Trade-off Matrix）

下面的表格是“架构师视角”的粗粒度评估（实际还要结合团队能力与运行时约束）。

| 方案 | 复杂度 | API 表达力 | 耦合度 | 运行时成本 | 组织成本 | 可测试性 | 适用场景 |
|------|--------|------------|--------|------------|----------|----------|----------|
| Compound Components | 中 | 高（结构强） | 中 | 低 | 中 | 中-高 | Tabs/Menu/Modal 等结构化组件 |
| Render Props | 中-高 | 高（注入灵活） | 低-中 | 中（重渲染风险） | 中 | 高 | 需要“能力注入”且 hooks 不方便时 |
| Hooks（逻辑复用） | 低-中 | 中-高 | 低 | 低 | 低 | 高 | 逻辑复用、分层、业务能力复用 |
| Headless/Controller | 高 | 很高 | 低 | 低-中 | 高 | 很高 | 设计系统/多品牌/强可定制 |
| Controlled | 中 | 中 | 中（外部状态耦合） | 低 | 中 | 高 | 需要 URL/全局状态同步 |
| Uncontrolled | 低 | 中 | 低 | 低 | 低 | 中 | 默认选择：简单场景、交付快 |
| Slot API / asChild | 中 | 高 | 低-中 | 低 | 中 | 中 | 需要局部替换/语义控制 |

---

## 六、决策树：什么时候选什么（以及什么时候别选）

下面是一个可落地的“选择指南”（建议纳入团队文档与 Code Review）：

### 6.1 先问三个问题

1. **结构是否复杂且语义强？**（Tabs/Menu/Accordion…）
   - 是 → 优先 Compound Components（必要时配合 Slot API）
2. **行为是否需要跨多种 UI 复用？**（同一交互在不同视觉/品牌中复用）
   - 是 → Headless/Controller + UI Shell
3. **状态是否必须由外部拥有？**（URL 同步、表单库、全局状态、服务端回填）
   - 是 → Controlled（同时保留 Uncontrolled 作为默认）

### 6.2 什么时候别选（反例）

- **别为了“优雅”用 Compound**：如果组件只有单一节点（一个 Button），Compound 会徒增心智负担。
- **别把 Render Props 当“万能扩展点”**：它会让渲染路径隐式化，容易导致不必要的 re-render，且类型推断复杂。
- **别过早 Headless**：Headless 适合“长期资产”，如果你还不确定交互模型是否稳定，先做 UI Component + hooks，等稳定后再抽 Headless。
- **别强制 Controlled**：默认 Controlled 会把所有调用方绑到状态管理方案上（尤其在 Vite SPA 的多状态源环境），优先提供 Uncontrolled。

---

## 七、落地架构：Next.js（App Router / RSC）

Next.js 的核心约束：**Server Components 不能使用 state/effect**，交互只能在 Client Components 中完成（`'use client'`）。

### 7.1 推荐分层：Server Wrapper + Client Interactive

把“数据获取（RSC）”与“交互（Client）”拆开：

```
app/
  (dashboard)/
    users/
      page.tsx              # Server Component：fetch/权限/数据编排
src/
  components/
    tabs/
      Tabs.tsx              # Client：Compound/Headless
      index.ts
```

`page.tsx`（Server）：

```tsx
import { TabsClient } from '@/src/components/tabs/Tabs';

export default async function UsersPage() {
  const initial = await getUsers(); // Server fetch
  return (
    <section>
      <h1>Users</h1>
      <TabsClient initialUsers={initial} />
    </section>
  );
}
```

`Tabs.tsx`（Client）：

```tsx
'use client';

import React, { createContext, useContext, useMemo, useState } from 'react';

type TabsContextValue = {
  value: string;
  setValue: (v: string) => void;
};

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('Tabs.* must be used within <Tabs.Root>');
  return ctx;
}

export function TabsRoot(props: {
  defaultValue: string;
  children: React.ReactNode;
}) {
  const [value, setValue] = useState(props.defaultValue);
  const ctx = useMemo(() => ({ value, setValue }), [value]);
  return <TabsContext.Provider value={ctx}>{props.children}</TabsContext.Provider>;
}

export function TabsList(props: { children: React.ReactNode }) {
  return <div role="tablist">{props.children}</div>;
}

export function TabsTrigger(props: { value: string; children: React.ReactNode }) {
  const { value, setValue } = useTabsContext();
  const selected = value === props.value;
  return (
    <button
      role="tab"
      aria-selected={selected}
      onClick={() => setValue(props.value)}
    >
      {props.children}
    </button>
  );
}

export function TabsContent(props: { value: string; children: React.ReactNode }) {
  const { value } = useTabsContext();
  if (value !== props.value) return null;
  return (
    <div role="tabpanel">
      {props.children}
    </div>
  );
}

export const TabsClient = Object.assign(
  function TabsClient({ initialUsers }: { initialUsers: unknown[] }) {
    return (
      <TabsRoot defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="active">Active</TabsTrigger>
        </TabsList>
        <TabsContent value="all">...</TabsContent>
        <TabsContent value="active">...</TabsContent>
      </TabsRoot>
    );
  },
  { Root: TabsRoot, List: TabsList, Trigger: TabsTrigger, Content: TabsContent }
);
```

这里的关键点不是“Tabs 怎么写”，而是：
- **交互组件必须是 Client**，因此 Compound Provider 也必须在 Client。
- **数据获取留在 Server**，避免把 fetch 塞进组件库导致 RSC 不可用。

### 7.2 Controlled/Uncontrolled：在 Next 中更重要

Next 的典型需求是把 UI 状态与 URL 同步（可分享、可刷新、可 SSR）。

推荐策略：
- 默认 Uncontrolled（`defaultValue`）
- 可选 Controlled（`value` + `onValueChange`）

```tsx
export function TabsRoot(props: {
  defaultValue?: string;
  value?: string;
  onValueChange?: (v: string) => void;
  children: React.ReactNode;
}) {
  const [inner, setInner] = useState(props.defaultValue ?? '');
  const controlled = props.value !== undefined;
  const value = controlled ? props.value! : inner;
  const setValue = (v: string) => {
    props.onValueChange?.(v);
    if (!controlled) setInner(v);
  };
  // ...
}
```

### 7.3 RSC/Client Boundary 对组件 API 的影响（重要）

在 Next App Router 中，**“组件是否能作为 Server Component 使用”** 会影响你的 API：

- 如果组件需要交互（state/effect），它必须是 Client。
- 如果组件只是排版/静态 UI，它可以是 Server（更少 JS、更快）。

常见落地方式：
- **UI Shell（Server） + Interactive Core（Client）**：Server 负责结构与数据，Client 负责局部交互。
- **Headless Hook（Client）**：把 headless 能力做成 client-only hook，然后配套一个 server-safe 的 “纯展示组件”。

---

## 八、落地架构：Vite SPA（CSR） {#八落地架构vite-spa-csr}

Vite SPA 没有 RSC 约束，但更容易出现“状态随意增长”与“跨页复用失控”。

### 8.1 推荐目录：组件模式与业务分层一起规划

```
src/
  shared/
    ui/
      tabs/
        Tabs.tsx           # 纯 UI/交互（可复用）
    lib/
      a11y/
      dom/
  features/
    user-filter/
      ui/
      model/               # Zustand/Redux/Signals 等（可选）
  pages/
    users/
      index.tsx
```

原则：
- `shared/ui`：只放“无业务依赖”的 UI 资产（Compound/Headless/Slot 都可以在这里实现）
- `features/*/ui`：业务相关的 UI（可以使用 shared/ui，但不反向依赖）

### 8.2 在 Vite 中更常用的组合：Hooks + Slot API

在 CSR 项目里，Hooks 通常是“低成本复用”的最佳起点；Slot API 用来控制 DOM 结构与可定制点。

示例：一个 Headless `useDialog` + UI shell（可替换 Trigger/Footer）：

```tsx
import React, { useId, useMemo, useState } from 'react';

export function useDialog(props?: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!props?.defaultOpen);
  const titleId = useId();
  const contentId = useId();
  return useMemo(
    () => ({
      open,
      setOpen,
      getTriggerProps: () => ({
        'aria-haspopup': 'dialog',
        'aria-controls': contentId,
        onClick: () => setOpen(true),
      }),
      getContentProps: () => ({
        role: 'dialog',
        'aria-modal': true,
        'aria-labelledby': titleId,
        id: contentId,
      }),
      titleId,
    }),
    [open, contentId, titleId]
  );
}

export function Dialog(props: {
  controller: ReturnType<typeof useDialog>;
  slots?: {
    Trigger?: (p: { onClick: () => void }) => React.ReactNode;
    Footer?: (p: { close: () => void }) => React.ReactNode;
  };
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  const c = props.controller;
  return (
    <>
      {props.slots?.Trigger?.({ onClick: () => c.setOpen(true) }) ?? (
        <button {...c.getTriggerProps()}>Open</button>
      )}
      {c.open ? (
        <div {...c.getContentProps()}>
          <h2 id={c.titleId}>{props.title}</h2>
          <div>{props.children}</div>
          {props.slots?.Footer?.({ close: () => c.setOpen(false) }) ?? (
            <button onClick={() => c.setOpen(false)}>Close</button>
          )}
        </div>
      ) : null}
    </>
  );
}
```

---

## 九、团队规范模板：Lint/PR Checklist/ADR

### 9.1 组件模式选择规范（可贴到 Wiki）

1. **默认策略**：简单组件 → 普通组件 / hooks；结构化组件 → Compound；强可定制交互 → Headless。
2. **状态所有权**：默认 Uncontrolled；需要同步（URL/表单库/全局状态）→ Controlled。
3. **扩展点表达**：优先“组合”（children/子组件），其次 Slot API，最后才是大量 boolean props。
4. **Next.js**：交互必须 Client；避免把数据获取塞进 UI 组件。

### 9.2 PR Checklist（组件相关）

```markdown
## Component Architecture Checklist

- [ ] 组件职责是否单一？（UI / 状态 / 数据 / side effects 是否拆分清楚）
- [ ] 是否存在 Props 爆炸？能否用组合/slot 代替开关？
- [ ] 是否需要同时支持 controlled / uncontrolled？
- [ ] Next.js 场景下：是否明确了 Server/Client boundary？
- [ ] 是否提供最小可用示例（usage snippet）？
- [ ] 是否写了至少一个“反例”（不要这样用）？
- [ ] 是否补齐 a11y 属性与键盘行为（如果是交互组件）？
```

### 9.3 ADR 模板（简版）

```markdown
# ADR: Component Pattern Choice - <ComponentName>

## Context
- 业务场景：
- 复用范围：
- Next.js / Vite 环境约束：

## Decision
- 采用的模式：Compound / Hooks / Headless / Slot / Controlled...
- 为什么不是其他模式：

## Consequences
- API 约束：
- 迁移成本：
- 测试与治理策略：
```

---

## 十、迁移策略：从现状到目标（避免大爆炸重构）

### 10.1 从“全能组件”迁移到“Headless + UI Shell”

阶段建议：

1. **抽出逻辑 Hook**：把状态机、事件处理、可访问性绑定抽到 `useXxx`。
2. **保持外部 API 不变**：旧组件内部先调用 hook 实现，避免一次性改调用方。
3. **引入 Slot/Compound**：把扩展点从 props 开关迁移到组合表达。
4. **收敛边界**：把数据获取/权限等挪到 feature/container。
5. **新增用法优先走新 API**：旧用法逐步 deprecate。

### 10.2 用“可迁移 API”降低调用方成本

常用策略：
- 新增 `slots` 而不是新增 10 个 boolean props。
- 同时支持 `defaultXxx` 与 `xxx/onXxxChange`。
- 提供 codemod 或 lint rule 自动提示（可选）。

---

## 十一、常见坑与反模式（Edge cases）

### 11.1 Hydration mismatch（Next.js）

反模式：在 Client Component 首次渲染时读取 `localStorage` 决定 UI 结构，导致服务端与客户端 DOM 不一致。

建议：
- 主题/偏好类状态在 `<html data-theme>` 或 cookie 上做 **服务端可见** 的初始化。
- 或使用“先渲染占位，再 client-only 替换”的降级策略（但要评估体验）。

### 11.2 Context 导致的全量重渲染

Compound Components 常用 Context；如果 Context value 每次 render 都是新对象，会导致子树重渲染。

建议：
- `useMemo` 包装 value
- 或拆分多个 Context（state 与 actions 分离）
- 或采用 selector（复杂时再上）

### 11.3 Render Props 的性能陷阱

Render Props 的函数 children 在父组件每次渲染都会创建，容易导致子树 re-render。

建议：
- 对性能敏感场景优先 hooks/compound
- 需要 Render Props 时，配合 memo 与稳定引用（但不要过度优化）

### 11.4 Controlled 组件的“状态源冲突”

当外部 state 更新频繁（例如 URL、全局 store、表单库）时，Controlled 组件可能出现：
- 输入延迟
- 竞争更新（race）

建议：
- 对输入类组件配合 `useDeferredValue` 或局部 optimistic state
- 明确“单一状态源”，避免同时受 URL + store 双向控制

### 11.5 Slot API 的类型复杂度

Slot API 如果允许替换大量节点，类型会迅速复杂化。

建议：
- 只开放“必要插槽”（Trigger/Footer/Empty/Loading）
- 保持 slot props 稳定、有限

---

## 十二、参考资料

1. [React - Sharing State Between Components](https://react.dev/learn/sharing-state-between-components)
2. [React - You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)
3. [React - useId](https://react.dev/reference/react/useId)
4. [Next.js - Server and Client Components](https://nextjs.org/docs/app/building-your-application/rendering/server-and-client-components)
5. [Radix UI Primitives](https://www.radix-ui.com/primitives)
6. [Headless UI](https://headlessui.com/)
7. [Kent C. Dodds - Compound Components](https://kentcdodds.com/blog/compound-components-with-react-hooks)

