# React Query vs SWR：服务端状态管理源码对比

> 本文从**源码架构**与**运行时数据流**出发，对比 TanStack Query（React Query）与 SWR 两类主流“服务端状态（Server State）”管理方案：它们如何建模缓存、如何订阅组件、如何去重/取消请求、如何失效与重新验证，以及这些选择对性能与可维护性的影响。

## 目录

1. [引言：什么是服务端状态](#一引言什么是服务端状态)
2. [核心结论速览](#二核心结论速览)
3. [模型对比：Query/Observer vs Cache/Hook](#三模型对比queryobserver-vs-cachehook)
4. [Key 与缓存定位：queryKey hashing vs key serialization](#四key-与缓存定位querykey-hashing-vs-key-serialization)
5. [订阅与渲染一致性：useSyncExternalStore 与 tearing](#五订阅与渲染一致性usesyncexternalstore-与-tearing)
6. [请求去重与竞态：dedupe window vs query 实例化](#六请求去重与竞态dedupe-window-vs-query-实例化)
7. [Stale/GC：staleTime、gcTime vs dedupingInterval、cache provider](#七stalegcstaletimegctime-vs-dedupingintervalcache-provider)
8. [Invalidation 与 Revalidate：invalidateQueries vs mutate/revalidate](#八invalidation-与-revalidateinvalidatequeries-vs-mutate-revalidate)
9. [Mutations：MutationCache vs mutate(key, data)](#九mutationsmutationcache-vs-mutatekey-data)
10. [并发与取消：AbortSignal、Retryer vs fetcher 约定](#十并发与取消abortsignalretryer-vs-fetcher-约定)
11. [工程化差异：core 分层、插件化、DevTools](#十一工程化差异core-分层插件化devtools)
12. [选型建议：从“状态语义”而不是“API 喜好”出发](#十二选型建议从状态语义而不是api-喜好出发)
13. [参考资料](#参考资料)

---

## 一、引言：什么是服务端状态

在 React 语境里，“状态管理”常被简化为 Redux/Zustand 之争，但真正占据复杂度峰值的往往是**服务端状态**：

- **来源不在客户端**：值来自网络、数据库、Edge、第三方 API。
- **存在“过期/新鲜”语义**：同一个资源在不同时间段可能被认为“足够新”或“必须刷新”。
- **需要一致性策略**：去重、取消、重试、失效、后台刷新、乐观更新、回滚。
- **跨组件共享**：多个组件可能读取同一个资源，并在不同生命周期触发刷新。

因此它的本质不是“存一个值”，而是管理一个**资源的生命周期**：\(\text{resource} = \text{data} + \text{metadata} + \text{in-flight} + \text{observers}\)。

TanStack Query 与 SWR 都解决这个问题，但它们的**核心抽象**不同，这会直接影响你在复杂应用里的上限与成本。

---

## 二、核心结论速览

### 2.1 两句话概括

- **TanStack Query**：用 `Query`/`Mutation` 作为“资源实例”，用 `Observer` 作为“订阅视图”，通过 `QueryClient` 统一调度——更像一个小型**缓存与调度系统**。
- **SWR**：用全局 `cache` + `useSWR` hook 协作，通过 `mutate`/`revalidate` 驱动更新——更像一个极简的 **Stale-While-Revalidate runtime**。

### 2.2 架构对比表

| 维度 | TanStack Query（React Query） | SWR |
|---|---|---|
| **核心抽象** | `Query` / `QueryObserver` | `cache` / `useSWR` / `mutate` |
| **缓存容器** | `QueryCache`（以 Query 实例为单位） | cache provider（Map-like），以 key 为单位 |
| **订阅模型** | Observer 集合，notifyManager 批处理通知 | per-key revalidator 列表 + useSyncExternalStore |
| **新鲜度/过期** | `staleTime` + `gcTime`（语义清晰可组合） | `dedupingInterval` + provider 的保留策略 |
| **失效** | `invalidateQueries`（按 queryKey 匹配） | `mutate(key)` 触发 revalidate |
| **Mutation 一等公民** | `MutationCache`、状态机、重试、并发策略 | mutate 能做变更，但 mutation 语义相对轻量 |
| **扩展性** | core 分层、插件化（persist、devtools 等生态） | 核心轻量，适合做一层 fetch abstraction |

---

## 三、模型对比：Query/Observer vs Cache/Hook

### 3.1 TanStack Query：资源实例化

TanStack Query 的关键是把“资源”实体化为 `Query`：

- `Query` 负责：数据、状态（idle/loading/success/error）、时间戳、in-flight promise、retry、取消、gc 等。
- `QueryObserver` 负责：把 `Query` 的状态投影成组件需要的 `result`，并订阅变化。

你可以把它理解成：

```
QueryClient
  ├─ QueryCache
  │    └─ Query (key -> state machine)
  └─ notifyManager / focusManager / onlineManager

React component
  └─ QueryObserver (sub -> render)
```

这种设计带来两点优势：

- **数据与视图解耦**：多个组件可以用不同 selector/config 观察同一 Query。
- **状态机更完整**：适配分页、无限滚动、乐观更新、重试等“复杂生命周期”。

### 3.2 SWR：key 驱动的 Hook runtime

SWR 更像是在 React hook 层“直接搭一个运行时”：

- 全局缓存以 `key -> value` 存储（还会配合一些全局映射表记录请求与 mutation）。
- `useSWR(key, fetcher, config)` 在渲染时读取缓存，在 effect/事件中触发 `revalidate`，并通过订阅机制让组件在缓存变化时重渲染。

抽象更少，意味着：

- **上手快、心智模型轻**：key 就是资源定位。
- **复杂能力依赖约定**：例如 mutation 的一致性与竞态控制更多由调用方设计。

---

## 四、Key 与缓存定位：queryKey hashing vs key serialization

### 4.1 TanStack Query：结构化 queryKey

TanStack Query 的 `queryKey` 通常是结构化数组：

```ts
['repo', owner, name]
['user', { id, fields: ['name'] }]
```

然后通过 hashing/serialization 得到稳定的 `queryHash`，以此定位 `QueryCache` 中的 `Query`。

这背后的“设计意图”是：**key 不是字符串拼接，而是资源的结构化 identity**。它天然支持：

- 层级匹配：`invalidateQueries({ queryKey: ['user'] })` 失效整个域。
- 更稳定的 refactor：少写 `'/api/user?id=' + id` 这种易错字符串。

### 4.2 SWR：key serialization（string/array/function）

SWR 允许 `key` 是：

- string（最常见）
- array（再序列化）
- function（依赖可用性/条件请求）

SWR 内部会把 key **序列化为一个字符串**作为 cache key（常见实现是 `serialize(key)`），并把原始 key 作为 fetch 参数。

这在工程实践里意味着：

- **你要更谨慎地设计 key**：避免“同资源不同 key”导致重复缓存。
- 需要做“域失效”时，一般要自己维护 key 命名空间或集中封装。

---

## 五、订阅与渲染一致性：useSyncExternalStore 与 tearing

React 18+ 并发渲染下，外部 store 订阅的正确姿势是 `useSyncExternalStore`。两者都在核心链路里使用它（或等价模式）来避免 tearing（撕裂）。

### 5.1 TanStack Query：Observer + 批处理通知

典型链路是：

1. `Query` 状态变化
2. 通知所有 `QueryObserver`
3. `notifyManager` 负责批处理（避免同一 tick 多次 setState）
4. 组件通过 `useSyncExternalStore` 订阅 observer 的变化

重点在于：**Observer 作为“订阅边界”**，可以把计算（result derivation）从 React render 中抽离。

### 5.2 SWR：按 key 订阅 revalidator

SWR 的订阅更像“按 key 的事件总线”：

- 订阅者注册到该 key 的 revalidator 列表
- `mutate/revalidate` 触发时广播
- hook 侧通过 `useSyncExternalStore` / internal state 接住并重渲染

这种模型很轻，但当你需要更复杂的“观察视图”（例如同一资源在不同组件需要不同衍生状态）时，通常要自己封装 selector 或拆 key。

---

## 六、请求去重与竞态：dedupe window vs Query 实例化

### 6.1 SWR：显式的 dedupe window

SWR 的典型策略是：

- 同一个 key 在 `dedupingInterval` 内触发的请求会复用同一个 in-flight promise。
- 通过全局 `FETCH` 映射记录 key 的 in-flight。

它很好理解，也非常符合 SWR 的“轻量”定位。但要注意：

- dedupe 是**时间窗语义**：窗口外再次触发会重新请求，即使数据仍然“够新”。
- 更复杂的竞态（mutation 与 revalidate 并行）需要额外规则（例如 mutation 时间戳、回放/丢弃旧结果）。

### 6.2 TanStack Query：Query 内聚 in-flight 与状态机

TanStack Query 通常把 in-flight 与 retry/cancel 绑定在 `Query` 实例上：

- 同一个 queryHash 只有一个 `Query`
- 多个 observer 共享同一个 fetch 生命周期
- 结果落地与状态变迁由 Query 控制

这使得它在复杂场景（例如多个组件同时 mount、以及后台 refetch）里更容易保持一致性。

---

## 七、Stale/GC：staleTime、gcTime vs dedupingInterval、cache provider

### 7.1 TanStack Query：显式的新鲜度与回收

两个关键参数：

- `staleTime`：数据在多长时间内被视为 fresh（不会自动 refetch）
- `gcTime`：无人观察时，Query 在 cache 中保留多长时间后回收

优势是语义清晰：**fresh/stale** 与 **in-cache** 分离，便于推导系统行为。

### 7.2 SWR：更依赖 provider 与约定

SWR 的缓存生命周期更依赖：

- provider 的实现（默认 Map）
- revalidate 时机（focus、reconnect、interval）
- `dedupingInterval` 等时间参数

它也能实现相同效果，但“语义更分散”，通常需要团队统一封装一层配置基线。

---

## 八、Invalidation 与 Revalidate：invalidateQueries vs mutate/revalidate {#八invalidation-与-revalidateinvalidatequeries-vs-mutate-revalidate}

### 8.1 TanStack Query：声明式失效（按 key 匹配）

典型流程：

- mutation 成功后：
  - `invalidateQueries(['todos'])`：标记 stale
  - 由活跃 observer 触发 refetch（或下一次 mount/focus 时 refetch）

关键点是：**失效是“状态标记”，不是立即请求**，因此很好做节流与批处理。

### 8.2 SWR：mutate 即是更新与再验证入口

SWR 的核心操作就是 `mutate(key, data?, options?)`：

- 可以直接写入缓存（乐观更新）
- 可以触发 revalidate（拉取真实值）
- 可以选择回滚、广播、去重等策略

它非常灵活，但也意味着更容易出现“不同团队成员写法不一致”的问题——通常需要你把 mutate 封装成 domain API。

---

## 九、Mutations：MutationCache vs mutate(key, data) {#九mutationsmutationcache-vs-mutatekey-data}

### 9.1 TanStack Query：Mutation 是一等公民

TanStack Query 把 Mutation 也当作状态机对象：

- `MutationCache` 管理所有 mutation
- 支持并发策略（按 scope/Key 串行）
- 支持 retry、取消、onMutate/onError/onSettled 生命周期
- 与 QueryCache 集成（例如自动失效）

适合“写多读多、复杂交互”的应用（电商、协作、后台）。

### 9.2 SWR：写能力可用但更轻量

SWR 的 mutate 更像是“写缓存 + 触发刷新”的统一入口：

- 足够覆盖大量 CRUD 场景
- 但复杂 mutation orchestration（例如队列、并发冲突、跨 key 事务一致性）需要你自己约定

---

## 十、并发与取消：AbortSignal、Retryer vs fetcher 约定

### 10.1 TanStack Query：更完整的取消/重试模型

TanStack Query 的 `queryFn` 常能拿到 `signal`（AbortSignal）用于取消；并通过内部 retryer 管理：

- 重试次数/退避策略
- 可取消 in-flight
- 与 focus/online 状态联动

### 10.2 SWR：更偏“fetcher 是约定”

SWR 也支持取消，但更多依赖 fetcher 自己处理（例如使用 `AbortController`）以及库内部对竞态结果的丢弃策略。

这不是缺陷，而是取舍：SWR 选择把“协议复杂度”留给调用方或框架层（例如 Next.js）。

---

## 十一、工程化差异：core 分层、插件化、DevTools

### 11.1 TanStack Query：core/adapter 分层带来的生态优势

TanStack Query 把核心放在 `@tanstack/query-core`，React 绑定在 `@tanstack/react-query`。

这种分层让它：

- 易于跨框架复用（Vue/Svelte/Solid adapter）
- 易于做 DevTools、persist、logger、测试工具
- 更容易在大型团队里建立统一规范（QueryClient 配置集中化）

### 11.2 SWR：小而美，更适合做“数据获取 hook 标准层”

SWR 的核心 API 非常稳定，适合：

- 作为组件库/业务组件的数据获取标准
- 与 Next.js 的缓存/数据获取范式配合（尤其是轻量客户端场景）

当需求变复杂，SWR 常见演进路径是“外面再包一层领域层”（例如 `useUser()` / `useRepo()`），把 key 与 mutate 规则收口。

---

## 十二、选型建议：从“状态语义”而不是“API 喜好”出发

### 12.1 选择 TanStack Query 当…

- 你需要**明确的新鲜度语义**（stale/fresh/GC 可推导）。
- 你有大量 mutation，并且需要**乐观更新、回滚、并发控制**。
- 你需要 DevTools、持久化、离线、分页/无限滚动等“系统能力”。
- 你希望把“服务端状态层”做成团队的基础设施。

### 12.2 选择 SWR 当…

- 你的场景主要是“读多写少”的数据获取与轻量缓存。
- 你更倾向把复杂性放到框架/领域层：key 规则、mutate 规则统一封装。
- 你希望尽可能少的抽象与 bundle 开销。

### 12.3 关键提醒：两者都不是“全局状态管理”

无论 TanStack Query 还是 SWR，都更擅长管理：

- **资源缓存**（GET）
- **异步状态机**（loading/error/retry）
- **跨组件共享与一致性**

而 UI 状态（主题、modal、草稿输入、交互步骤等）仍应由：

- `useState/useReducer`（组件内）
- 或 Zustand/Jotai/Redux 等（客户端状态）

负责。把 UI 状态塞进服务端状态缓存，往往会导致语义错乱与维护成本飙升。

---

## 参考资料

- [TanStack Query 文档](https://tanstack.com/query/latest)
- [TanStack Query GitHub](https://github.com/TanStack/query)
- [SWR 文档](https://swr.vercel.app)
- [SWR GitHub](https://github.com/vercel/swr)
- [React：useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore)

> 注：本文的“源码架构”对比基于 TanStack Query v5.x 与 SWR v2.x 的公开实现与设计文档；不同小版本在文件组织与细节上可能存在差异，但核心抽象与数据流稳定。
