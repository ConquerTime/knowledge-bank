# 状态管理的本质：从 Flux 到 Signals 的演进

> 本文不做“库选型”罗列，而是追问一个更底层的问题：**状态管理到底在管理什么？** 当我们把“状态”从 UI 局部变量扩展到复杂系统（网络、缓存、协作、并发、跨端）时，Flux/Redux 为什么出现、为什么会被批评、为什么会分化出 hooks/atoms/selectors/signals？理解这些“约束与取舍”，比记住某个 API 更重要。

## 目录

1. [引言：状态管理不是“存值”](#一引言状态管理不是存值)
2. [本质模型：状态 = 数据 + 约束 + 传播](#二本质模型状态--数据--约束--传播)
3. [Flux：把“时间”变成可追踪的数据流](#三flux把时间变成可追踪的数据流)
4. [Redux：把系统约束收敛到 reducer](#四redux把系统约束收敛到-reducer)
5. [React Hooks：把状态回收到组件与闭包](#五react-hooks把状态回收到组件与闭包)
6. [Context：共享很简单，性能很复杂](#六context共享很简单性能很复杂)
7. [External Store：useSyncExternalStore 统一订阅语义](#七external-storeusesyncexternalstore-统一订阅语义)
8. [Atom/Selector：从“全局 store”到“依赖图”](#八atomselector从全局-store-到依赖图)
9. [Server State：把缓存与一致性提升为一等公民](#九server-state把缓存与一致性提升为一等公民)
10. [Signals：细粒度响应式与 React 的张力](#十signals细粒度响应式与-react-的张力)
11. [演进总结：范式选择的决策树](#十一演进总结范式选择的决策树)
12. [参考资料](#参考资料)

---

## 一、引言：状态管理不是“存值”

很多团队讨论状态管理，常常停留在“用 Redux 还是 Zustand/Jotai”这种层面。但你会发现：

- 复杂度不是来自“把值放哪”，而是来自**值如何变化、变化如何传播、变化如何与时间/异步/并发一致**。
- 最难的不是读数据，而是**写数据**：竞态、回滚、并发冲突、派生一致性、可观测性（debuggability）。

所以本文先给一个工作定义：

> **状态管理 = 在约束条件下，让状态变化可预测、可传播、可回放，并让系统成本可控。**

---

## 二、本质模型：状态 = 数据 + 约束 + 传播

把“状态管理”拆成三个维度，几乎能覆盖所有库的设计差异。

### 2.1 数据（Data）

状态本身可以是：

- **UI state**：modal 是否打开、输入框草稿、tab 选择
- **Domain state**：购物车、权限、流程步骤
- **Server state**：请求结果、缓存、分页、乐观更新、离线队列

不同状态的“真相来源”不同：UI state 通常是本地真相（single source of truth），server state 的真相在远端。

### 2.2 约束（Constraints）

状态变化必须满足的约束包括但不限于：

- **可预测性**：相同输入产生相同输出（reducer 的纯函数约束）
- **可追踪性**：能回答“谁在什么时候把它改了”
- **一致性**：多个视图读到的同一资源不应互相撕裂（tearing）
- **并发与时序**：异步竞态、取消、重试、回滚
- **性能边界**：变化传播到哪里？传播成本是什么？

### 2.3 传播（Propagation）

状态变化最终要“通知”消费者：

- **粗粒度传播**：任何变化都让所有订阅者重算/重渲染
- **选择性传播**：只通知依赖某个 slice/atom 的订阅者
- **细粒度传播**：精确到“哪个字段/表达式被读取过”

Flux/Redux、atoms、signals，本质都在不同维度上做取舍。

---

## 三、Flux：把“时间”变成可追踪的数据流

### 3.1 为什么需要 Flux

在 React 早期（尤其 class 时代），常见问题是：

- 任意组件都能 setState，状态来源散落
- 多个异步回调互相覆盖（最后写 wins）
- 很难回答“这个值为什么变成这样”

Flux 给出一个极具工程味的答案：**单向数据流**。

```
Action -> Dispatcher -> Store -> View
            ↑                 |
            └────── user events
```

它的核心不是“有个 store”，而是把状态变更从“隐式副作用”变成“显式事件（Action）”。

### 3.2 Flux 的代价

- 心智模型更重：必须按流程走
- 样板代码：action types、dispatcher、store wiring
- 对异步的表达不自然：异步 action 需要额外中间层

这些痛点最终推动 Redux 诞生。

---

## 四、Redux：把系统约束收敛到 reducer

Redux 的关键设计是：

1. **单一 store**
2. **action 描述发生了什么**
3. **reducer 纯函数计算新状态**

```
dispatch(action)
   ↓
reducer(prevState, action) => nextState
   ↓
notify subscribers
```

### 4.1 Redux 的核心价值：可预测与可回放

因为 reducer 是纯函数，action 是事件日志，所以你天然得到：

- 时间旅行（time-travel）
- 可重放（replay）
- 可测试（reducer 单测）

这解决的是“约束”问题：**让状态变化可证明（provable）**。

### 4.2 Redux 的核心问题：传播成本与样板

在没有 selector 优化时，Redux 的传播模型更偏粗粒度（订阅者全通知）。

即便后来有 `react-redux` 的 selector 订阅与 memoization，本质仍是：

- store 更新可能很频繁
- selector 设计决定性能上限

与此同时，样板代码也在大型团队里成为成本——于是 Redux Toolkit、Zustand/Jotai 等方案各自从不同方向“削减成本”。

---

## 五、React Hooks：把状态回收到组件与闭包

Hooks 的出现，把一部分“状态管理”的需求回收到了组件内部：

- `useState/useReducer`：局部状态与局部状态机
- `useMemo/useCallback`：缓存与引用稳定性
- `useEffect`：与外部系统同步（但也最容易被滥用）

Hooks 的底层实现依赖“调用顺序”和链表（你在系列文章里已有深入分析）。这里关心的是其对状态管理范式的影响：

### 5.1 局部状态管理更自然

当状态只影响一个局部 UI 区域时：

- 不必引入全局 store
- 组件边界即传播边界（天然的性能隔离）

### 5.2 但“共享”又会把问题带回来

一旦你需要：

- 跨页面/跨组件共享
- 多处读同一份数据
- 避免重复请求、保持一致性

你就会回到“外部 store”的世界，只是形式发生了变化。

---

## 六、Context：共享很简单，性能很复杂

Context 在 API 上很简单：Provider 提供值，Consumer 读取值。但它的性能陷阱在于：

- Provider value 变化，会触发所有消费该 Context 的组件重新渲染
- 你很难做到“只订阅一部分”（除非自己做 selector 模式/拆分 Context）

所以 Context 更适合作为：

- 依赖注入（theme、i18n、router、queryClient）
- 稳定引用的服务对象（client、logger）

而不适合做“频繁变化的大型全局状态”。

---

## 七、External Store：useSyncExternalStore 统一订阅语义

React 18 引入 `useSyncExternalStore` 的意义是：在并发渲染下，外部 store 订阅必须遵循统一协议，避免 tearing。

最小协议是：

```ts
subscribe(listener) => unsubscribe
getSnapshot() => snapshot
getServerSnapshot?() => snapshot (SSR)
```

这推动了很多状态库的收敛：

- Zustand：基于 `useSyncExternalStore` 做选择性订阅
- Redux：react-redux 内部也用类似订阅模型确保一致性
- 各种自研 store：只要实现 subscribe/getSnapshot，就能与 React 并发模式正确协作

从“本质模型”看，这是对“传播”维度的规范化。

---

## 八、Atom/Selector：从"全局 store"到"依赖图" {#八atomselector从全局-store-到依赖图}

### 8.1 传统 store 的问题：粗粒度更新

单一 store 的根本问题是：你很容易把很多不相关的状态放进一个对象里，导致更新传播边界很难控制。

### 8.2 Atom：把状态拆成最小可共享单元

Atom 范式（Recoil/Jotai 等）把状态拆成原子：

- 每个 atom 是一个可订阅单元
- 派生状态（selector/derived atom）形成依赖图
- 更新传播沿依赖图传播

这让“传播”从粗粒度变成**依赖驱动**：

```
atomA   atomB
  \      /
   selectorC
       |
   componentD
```

但代价是：

- 需要维护依赖图与失效传播
- Promise/Suspense、并发等细节更复杂

这也是为什么 atom 库的核心实现往往比 Zustand 更“厚”。

---

## 九、Server State：把缓存与一致性提升为一等公民

在很多应用里，最大的状态复杂度不是 UI，而是数据获取：

- 缓存命中与过期策略
- 去重、取消、重试
- 背景刷新（focus/reconnect）
- mutation 后的失效与回滚

这类问题属于“约束 + 时间”，因此 TanStack Query / SWR 这类库把它们提升为一等公民。

关键理解：

> **Server State ≠ Client State**
> Server State 的真相在服务端，客户端缓存只是投影；所以它必须携带“时间、版本、in-flight、错误、重试”等元数据。

因此把 server state 混进 Redux 这类纯 reducer 模型里，往往会出现：

- reducer 里塞进大量异步流程控制
- action 变成“命令式协议”
- 很难收敛一致性与缓存策略

这并非 Redux “不行”，而是模型不匹配：Redux 强在“可回放”，弱在“缓存/新鲜度/竞态协议的系统化”。

---

## 十、Signals：细粒度响应式与 React 的张力

Signals（Solid/Preact/Vue computed/Signals 提案）在“传播”维度把粒度推到极致：依赖由**读取行为**自动建立。

### 10.1 Signals 的核心：按读取追踪依赖

```ts
const count = signal(0)
const double = computed(() => count.value * 2)

effect(() => {
  console.log(double.value)
})
```

你不需要：

- 手写依赖数组
- selector memoization

因为系统知道“谁读了谁”。

### 10.2 与 React 的张力

React 的渲染模型更偏“函数式 UI”：

- render 是一次性计算 UI tree 的过程
- 依赖追踪并不是 React 运行时的默认能力（避免运行时开销与复杂度）

这也是为什么 React 生态里的 signals 往往以“外部 store + 桥接 hook”的形式出现（例如 `@preact/signals-react`），而不是成为 React 核心的一部分。

### 10.3 你该如何理解 Signals 的位置

Signals 不是“取代 Redux”，它更像是：

- 在细粒度传播上，给出一种极致方案
- 在复杂 UI 与高频更新场景（编辑器、图形、实时数据）可能更有优势

但它也会引入新的约束：

- 调试与可追踪性需要新的工具链（否则“自动依赖”可能变成黑盒）
- 与现有 React 组件生态（memo、strict mode、并发）需要适配

---

## 十一、演进总结：范式选择的决策树

不要从“我喜欢哪个 API”出发，而要从“你在解决哪个维度的问题”出发。

### 11.1 决策树（简化版）

```
你要管理的状态是什么？
├─ UI 局部状态（只影响局部渲染）
│   └─ useState/useReducer（必要时下移状态边界）
│
├─ 跨组件共享，但更新不频繁（依赖注入）
│   └─ Context（提供稳定服务对象/配置）
│
├─ 客户端全局状态（业务域状态，写操作多）
│   ├─ 需要强约束/可回放/团队规范 → Redux Toolkit
│   ├─ 需要极简 + selector 订阅 → Zustand
│   └─ 需要依赖图/原子化派生 → Jotai/Recoil 类
│
└─ 服务端状态（缓存/新鲜度/异步一致性）
    ├─ 需要系统能力完整、复杂 mutation → TanStack Query
    └─ 轻量数据获取层、封装 key 约定 → SWR
```

### 11.2 核心结论（再强调一次）

- Flux/Redux 解决的是“约束与可追踪性”
- Atom/Selector/Signals 推进的是“传播粒度”
- Server State 库解决的是“时间与一致性”

把问题放进正确的范式里，往往比“换一个库”更有效。

---

## 参考资料

- [React：Thinking in React](https://react.dev/learn/thinking-in-react)
- [Redux：Three Principles](https://redux.js.org/understanding/thinking-in-redux/three-principles)
- [React：useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore)
- [Dan Abramov：Why Do React Hooks Rely on Call Order?](https://overreacted.io/why-do-hooks-rely-on-call-order/)
- [Preact Signals](https://preactjs.com/guide/v10/signals/)
- [SolidJS Fine-Grained Reactivity](https://www.solidjs.com/docs/latest#fine-grained-reactivity)

> 注：本文讨论的是“范式与约束”，不是某个库的营销对比。不同实现细节会随版本迭代，但它们背后的取舍长期稳定。
