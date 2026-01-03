# useState/useReducer 源码级实现分析

> 本文深入剖析 React useState 和 useReducer 的源码实现机制,从 Fiber 架构、Hooks 链表存储到调度更新的完整流程,为高级工程师提供性能优化和架构决策的理论基础。

## 目录

1. [引言](#一引言)
2. [Hooks 的底层存储机制](#二hooks-的底层存储机制)
3. [useState 完整实现流程](#三usestate-完整实现流程)
4. [useReducer 实现机制](#四usereducer-实现机制)
5. [状态更新的批处理机制](#五状态更新的批处理机制)
6. [调度器如何参与状态更新](#六调度器如何参与状态更新)
7. [源码级关键函数解析](#七源码级关键函数解析)
8. [useState vs useReducer 设计取舍](#八usestate-vs-usereducer-设计取舍)
9. [性能优化策略](#九性能优化策略)
10. [开发最佳实践](#十开发最佳实践)
11. [总结](#十一总结)

---

## 一、引言

### 为什么要深入理解 useState/useReducer?

在 React 开发中,useState 和 useReducer 是最常用的状态管理 Hooks。表面上看,它们的 API 简洁明了:

```tsx
// useState 的简洁性
const [count, setCount] = useState(0);
setCount(count + 1);

// useReducer 的可预测性
const [state, dispatch] = useReducer(reducer, initialState);
dispatch({ type: 'INCREMENT' });
```

但在这简洁的 API 背后,隐藏着复杂而精妙的实现机制:

- **Hooks 是如何存储的?** 为什么不能在条件语句中使用?
- **setState 是同步还是异步?** 为什么多次调用会被批处理?
- **函数式更新背后发生了什么?**
- **调度器如何参与状态更新?** 优先级是如何工作的?

理解这些问题能帮助你:
1. 写出更高性能的 React 代码
2. 避免常见的状态管理陷阱
3. 在复杂场景下做出正确的架构决策
4. 在面试中展现深度技术理解

### 本文的知识基础

本文基于 **React 18.2.0** 源码进行分析,假设读者已了解:

- React Fiber 架构基础概念
- 函数式编程基础 (闭包、纯函数、不可变数据)
- JavaScript 事件循环与宏/微任务
- React Hooks 基本使用

---

## 二、Hooks 的底层存储机制

### 2.1 Hooks 链表结构

React 使用**单向链表**存储组件的所有 Hooks。

#### Hook 节点的数据结构

```typescript
// react-reconciler/src/ReactFiberHooks.js
type Hook = {
  memoizedState: any;          // 当前 Hook 的状态值
  baseState: any;              // 基准状态 (用于计算优先级更新)
  baseQueue: Update<any> | null; // 基准更新队列
  queue: any;                  // 更新队列
  next: Hook | null;           // 指向下一个 Hook
};
```

#### 组件 Fiber 与 Hooks 链表的关系

```typescript
// FiberNode 结构 (简化版)
type Fiber = {
  memoizedState: Hook | null;  // 指向 Hooks 链表的头节点
  updateQueue: UpdateQueue;    // 更新队列
  // ... 其他字段
};
```

**关键理解**:
- 每个函数组件的 Fiber 节点通过 `memoizedState` 指向 Hooks 链表头
- 多个 Hooks 通过 `next` 指针串联成链表
- **Hooks 的顺序至关重要**,这就是为什么不能在条件语句中使用 Hooks

#### 示例:多个 Hooks 的链表结构

```tsx
function Counter() {
  const [count, setCount] = useState(0);      // Hook1
  const [name, setName] = useState('React');  // Hook2
  const [list, setList] = useState([]);       // Hook3

  useEffect(() => {
    console.log(count);
  }, [count]);                                // Hook4

  return <div>{count}</div>;
}
```

**对应的 Hooks 链表**:

```
Fiber.memoizedState (Hook1: useState)
    ↓ next
Hook2 (useState)
    ↓ next
Hook3 (useState)
    ↓ next
Hook4 (useEffect)
    ↓ next
null
```

### 2.2 为什么不能在条件语句中使用 Hooks?

理解了链表结构,这个限制就很自然了:

```tsx
// ❌ 错误示例
function Counter({ shouldTrackName }) {
  const [count, setCount] = useState(0);

  if (shouldTrackName) {
    const [name, setName] = useState('React'); // 条件调用!
  }

  const [list, setList] = useState([]);
}
```

**问题分析**:

| 渲染次数 | shouldTrackName | Hooks 链表 |
|---------|----------------|-----------|
| 第1次 | true | count → name → list |
| 第2次 | false | count → list |
| 第3次 | true | count → name → list |

当 `shouldTrackName` 从 true 变为 false 时:
1. React 按顺序遍历链表
2. 第2个 Hook 节点期望是 `name`,实际遇到 `list`
3. 类型不匹配,状态错乱

**React 的解决方案**:
- 开发模式检测 Hooks 数量变化并抛出错误
- ESLint 插件静态检查 Hooks 规则

---

## 三、useState 完整实现流程

### 3.1 Mount 阶段:首次调用 useState

```typescript
function mountState<S>(initialState: (() => S) | S): [S, Dispatch<BasicStateAction<S>>] {
  // 1. 创建 Hook 节点
  const hook = mountWorkInProgressHook();

  // 2. 处理初始值 (支持函数形式)
  if (typeof initialState === 'function') {
    initialState = initialState();
  }

  // 3. 初始化 Hook 状态
  hook.memoizedState = hook.baseState = initialState;

  // 4. 创建更新队列
  const queue: UpdateQueue<S, BasicStateAction<S>> = {
    pending: null,
    lanes: NoLanes,
    dispatch: null,
    lastRenderedReducer: basicStateReducer,
    lastRenderedState: initialState,
  };
  hook.queue = queue;

  // 5. 创建 dispatch 函数
  const dispatch = (queue.dispatch = dispatchSetState.bind(null, currentlyRenderingFiber, queue));

  // 6. 返回 [状态, dispatch函数]
  return [hook.memoizedState, dispatch];
}
```

**basicStateReducer - useState 的核心**:

```typescript
function basicStateReducer<S>(state: S, action: BasicStateAction<S>): S {
  // 支持函数式更新: setState(prev => prev + 1)
  return typeof action === 'function' ? action(state) : action;
}
```

### 3.2 Update 阶段:调用 setState

```typescript
function dispatchSetState<S, A>(fiber: Fiber, queue: UpdateQueue<S, A>, action: A) {
  // 1. 获取优先级
  const lane = requestUpdateLane(fiber);

  // 2. 创建 Update 对象
  const update: Update<S, A> = {
    lane,
    action,
    hasEagerState: false,
    eagerState: null,
    next: null,
  };

  // 3. Eager State 优化
  if (fiber.lanes === NoLanes && (fiber.alternate === null || fiber.alternate.lanes === NoLanes)) {
    const lastRenderedReducer = queue.lastRenderedReducer;
    const currentState = queue.lastRenderedState;
    const eagerState = lastRenderedReducer(currentState, action);

    update.hasEagerState = true;
    update.eagerState = eagerState;

    // 如果新状态与旧状态相同,直接跳过渲染
    if (Object.is(eagerState, currentState)) {
      return;
    }
  }

  // 4. 将 Update 加入队列 (环形链表)
  const pending = queue.pending;
  if (pending === null) {
    update.next = update; // 第一个更新
  } else {
    update.next = pending.next;
    pending.next = update;
  }
  queue.pending = update;

  // 5. 调度更新
  scheduleUpdateOnFiber(fiber, lane, eventTime);
}
```

**Eager State 优化**:当组件没有待处理更新时,React 会预先计算新状态。如果新旧状态相同,直接跳过渲染!

### 3.3 Update 队列的环形链表

```tsx
const [count, setCount] = useState(0);

function handleClick() {
  setCount(count + 1);  // Update1
  setCount(count + 1);  // Update2
  setCount(count + 1);  // Update3
}
```

**环形链表结构**:

```
queue.pending → Update3
                   ↓ next
                Update1
                   ↓ next
                Update2
                   ↓ next
                Update3 (回到起点)
```

**为什么使用环形链表?**
- 在队列尾部插入是 O(1) 复杂度
- `queue.pending` 始终指向最后一个 Update
- `queue.pending.next` 是第一个 Update

### 3.4 函数式更新的重要性

```tsx
function Counter() {
  const [count, setCount] = useState(0);

  function handleClick() {
    // ❌ 错误:三次调用都使用相同的闭包值
    setCount(count + 1);  // 0 + 1 = 1
    setCount(count + 1);  // 0 + 1 = 1
    setCount(count + 1);  // 0 + 1 = 1
    // 最终 count = 1
  }

  function handleClickCorrect() {
    // ✅ 正确:每次都基于最新状态计算
    setCount(prev => prev + 1);  // 0 + 1 = 1
    setCount(prev => prev + 1);  // 1 + 1 = 2
    setCount(prev => prev + 1);  // 2 + 1 = 3
    // 最终 count = 3
  }
}
```

---

## 四、useReducer 实现机制

### 4.1 useState 是 useReducer 的语法糖

**核心真相**:

```typescript
// useState 的实现
function updateState<S>(initialState) {
  return updateReducer(basicStateReducer, initialState);
}

// 本质上
const [state, setState] = useState(initialState);
// 等价于
const [state, dispatch] = useReducer(
  (state, action) => typeof action === 'function' ? action(state) : action,
  initialState
);
```

### 4.2 useReducer Mount 阶段

```typescript
function mountReducer<S, I, A>(
  reducer: (S, A) => S,
  initialArg: I,
  init?: I => S,
): [S, Dispatch<A>] {
  const hook = mountWorkInProgressHook();

  // 惰性初始化
  let initialState;
  if (init !== undefined) {
    initialState = init(initialArg);
  } else {
    initialState = initialArg;
  }

  hook.memoizedState = hook.baseState = initialState;

  const queue = {
    pending: null,
    lanes: NoLanes,
    dispatch: null,
    lastRenderedReducer: reducer,  // 保存自定义 reducer
    lastRenderedState: initialState,
  };
  hook.queue = queue;

  const dispatch = (queue.dispatch = dispatchReducerAction.bind(null, currentlyRenderingFiber, queue));

  return [hook.memoizedState, dispatch];
}
```

### 4.3 为什么 useReducer 不做 Eager State 优化?

```tsx
// 假设有这样的 reducer
function reducer(state, action) {
  // 可能有副作用!
  console.log('Reducer called:', action);
  return { count: state.count + 1 };
}

// 如果做 Eager State 优化
dispatch({ type: 'increment' });  // 第一次调用 reducer
// 渲染阶段再次调用 reducer
// 导致副作用执行两次!
```

**设计原则**:
- useState 的 reducer 是纯函数,可以安全地多次调用
- useReducer 的 reducer 由用户定义,可能有副作用,不能预先调用

### 4.4 复杂状态管理示例

```tsx
type State = {
  count: number;
  loading: boolean;
  error: string | null;
};

type Action =
  | { type: 'increment' }
  | { type: 'decrement' }
  | { type: 'reset' }
  | { type: 'fetch_start' }
  | { type: 'fetch_success'; payload: number }
  | { type: 'fetch_error'; payload: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'increment':
      return { ...state, count: state.count + 1 };
    case 'decrement':
      return { ...state, count: state.count - 1 };
    case 'reset':
      return { count: 0, loading: false, error: null };
    case 'fetch_start':
      return { ...state, loading: true, error: null };
    case 'fetch_success':
      return { count: action.payload, loading: false, error: null };
    case 'fetch_error':
      return { ...state, loading: false, error: action.payload };
    default:
      return state;
  }
}

function Counter() {
  const [state, dispatch] = useReducer(reducer, {
    count: 0,
    loading: false,
    error: null,
  });

  return (
    <div>
      {state.loading ? <p>Loading...</p> : <p>Count: {state.count}</p>}
      {state.error && <p>Error: {state.error}</p>}
      <button onClick={() => dispatch({ type: 'increment' })}>+1</button>
    </div>
  );
}
```

---

## 五、状态更新的批处理机制

### 5.1 自动批处理 (React 18)

**React 17 之前**:

```tsx
// 事件处理器中会批处理
onClick={() => {
  setCount(c => c + 1);
  setName('React');
  setFlag(true);
  // 只触发 1 次渲染
}}

// 异步回调中不会批处理
onClick={() => {
  setTimeout(() => {
    setCount(c => c + 1);  // 引起渲染
    setName('React');      // 引起渲染
    setFlag(true);         // 引起渲染
    // 触发 3 次渲染!
  }, 1000);
}}
```

**React 18 的改进**:

```tsx
// 所有场景都会批处理
setTimeout(() => {
  setCount(c => c + 1);
  setName('React');
  setFlag(true);
  // 只触发 1 次渲染!
}, 1000);

fetch('/api').then(() => {
  setCount(c => c + 1);
  setName('React');
  // 只触发 1 次渲染!
});
```

### 5.2 批处理的实现原理

```typescript
function scheduleUpdateOnFiber(fiber: Fiber, lane: Lane, eventTime: number) {
  markRootUpdated(root, lane, eventTime);

  ensureRootIsScheduled(root, eventTime);
}

function ensureRootIsScheduled(root: FiberRoot, currentTime: number) {
  // 检查是否已经调度
  if (existingCallbackNode !== null) {
    if (existingCallbackPriority === newCallbackPriority) {
      // 优先级相同,复用现有调度 (批处理关键!)
      return;
    }
    // 优先级不同,取消旧调度
    cancelCallback(existingCallbackNode);
  }

  // 创建新调度
  newCallbackNode = scheduleCallback(
    schedulerPriorityLevel,
    performConcurrentWorkOnRoot.bind(null, root),
  );
}
```

**批处理原理**:

```
Time ─────────────────────────────────────────────────►

Event Handler Start
  │
  ├─ setState1  ──► 标记更新,调度渲染
  ├─ setState2  ──► 标记更新,发现已有调度,复用
  ├─ setState3  ──► 标记更新,发现已有调度,复用
  │
Event Handler End

Microtask Checkpoint
  │
  └─ 执行渲染 ──► 一次性处理所有更新
```

### 5.3 flushSync:禁用批处理

```tsx
import { flushSync } from 'react-dom';

function handleClick() {
  flushSync(() => {
    setCount(c => c + 1);
  });
  // DOM 已更新

  flushSync(() => {
    setName('React');
  });
  // DOM 再次更新
  // 总共触发 2 次渲染
}
```

**使用场景**:
- 需要在 DOM 更新后立即测量元素尺寸
- 第三方库集成

**注意事项**:
- `flushSync` 是同步的,会阻塞浏览器
- 过度使用会损害性能

---

## 六、调度器如何参与状态更新

### 6.1 Lane 模型:优先级系统

```typescript
// react-reconciler/src/ReactFiberLane.js
export const NoLane: Lane =          0b0000000000000000000000000000000;
export const SyncLane: Lane =        0b0000000000000000000000000000001;
export const InputContinuousLane: Lane = 0b0000000000000000000000000000100;
export const DefaultLane: Lane =     0b0000000000000000000000000010000;
export const TransitionLane1: Lane = 0b0000000000000000000000001000000;
export const IdleLane: Lane =        0b0100000000000000000000000000000;
```

**Lane 优先级映射**:

| Lane | 优先级 | 触发场景 | 示例 |
|------|--------|---------|------|
| SyncLane | 最高 | 用户输入、离散事件 | onClick, onInput |
| InputContinuousLane | 高 | 连续输入事件 | onScroll, onMouseMove |
| DefaultLane | 中 | 普通更新 | 数据获取后的 setState |
| TransitionLanes | 低 | 非紧急UI更新 | startTransition |
| IdleLane | 最低 | 后台任务 | 预加载、分析 |

### 6.2 优先级调度示例

```tsx
import { startTransition } from 'react';

function SearchBox() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);

  function handleChange(e) {
    const value = e.target.value;

    // 高优先级更新:立即更新输入框
    setQuery(value);

    // 低优先级更新:延迟更新搜索结果
    startTransition(() => {
      const filtered = expensiveFilter(value);
      setResults(filtered);
    });
  }

  return (
    <div>
      <input value={query} onChange={handleChange} />
      <SearchResults results={results} />
    </div>
  );
}
```

**执行流程**:

```
用户输入 "R"
  │
  ├─ setQuery('R')         ──► SyncLane (优先级最高)
  └─ setResults(filtered)  ──► TransitionLane (优先级低)

Render Phase:
  1. 先处理 SyncLane 更新 → 渲染 query = 'R'
  2. 用户继续输入 "Re" → 打断 TransitionLane
  3. 处理新的 SyncLane 更新 → 渲染 query = 'Re'
  4. 恢复 TransitionLane 渲染 → 渲染 results
```

### 6.3 Scheduler 时间切片

Scheduler 使用 **MessageChannel** 实现时间切片:

```typescript
const channel = new MessageChannel();
const port = channel.port2;
channel.port1.onmessage = performWorkUntilDeadline;

function performWorkUntilDeadline() {
  const currentTime = getCurrentTime();
  const deadline = currentTime + 5; // 5ms 时间片

  let hasMoreWork = scheduledHostCallback(true, currentTime);

  if (hasMoreWork) {
    port.postMessage(null); // 继续下一个时间片
  }
}
```

**时间切片原理**:

```
Frame 1 (5ms)       Frame 2 (5ms)       Frame 3 (5ms)
┌────────────┐      ┌────────────┐      ┌──────┐
│ Component A│      │ Component C│      │ Paint│
│ Component B│      │ Component D│      │      │
│ Yield ────►│──────│ Yield ────►│──────│      │
└────────────┘      └────────────┘      └──────┘
```

---

## 七、源码级关键函数解析

### 7.1 renderWithHooks:Hooks 执行环境

```typescript
export function renderWithHooks(
  current: Fiber | null,
  workInProgress: Fiber,
  Component: Function,
  props: any,
  renderLanes: Lanes,
): any {
  renderLanes = renderLanes;
  currentlyRenderingFiber = workInProgress;

  // 重置 Hooks 状态
  workInProgress.memoizedState = null;
  workInProgress.updateQueue = null;

  // 设置 Hooks dispatcher
  ReactCurrentDispatcher.current =
    current === null || current.memoizedState === null
      ? HooksDispatcherOnMount   // 首次渲染
      : HooksDispatcherOnUpdate; // 更新渲染

  // 执行函数组件
  let children = Component(props);

  // 清理渲染上下文
  ReactCurrentDispatcher.current = ContextOnlyDispatcher;
  currentlyRenderingFiber = null;

  return children;
}
```

**Hooks Dispatcher 切换**:

```typescript
const HooksDispatcherOnMount = {
  useState: mountState,
  useReducer: mountReducer,
  useEffect: mountEffect,
};

const HooksDispatcherOnUpdate = {
  useState: updateState,
  useReducer: updateReducer,
  useEffect: updateEffect,
};

const ContextOnlyDispatcher = {
  useState: throwInvalidHookError,
  useReducer: throwInvalidHookError,
};
```

### 7.2 scheduleUpdateOnFiber:调度更新

```typescript
export function scheduleUpdateOnFiber(fiber: Fiber, lane: Lane, eventTime: number) {
  // 1. 检查无限更新循环
  checkForNestedUpdates();

  // 2. 向上标记父 Fiber 的 lanes
  const root = markUpdateLaneFromFiberToRoot(fiber, lane);

  // 3. 标记 root 有待处理更新
  markRootUpdated(root, lane, eventTime);

  // 4. 判断是否需要同步更新
  if (lane === SyncLane) {
    if (executionContext === NoContext) {
      flushSyncCallbacks();
    } else {
      ensureRootIsScheduled(root, eventTime);
    }
  } else {
    // 5. 异步更新
    ensureRootIsScheduled(root, eventTime);
  }

  return root;
}
```

---

## 八、useState vs useReducer 设计取舍

### 8.1 本质关系

```typescript
// useState 就是内置了 basicStateReducer 的 useReducer
useState = useReducer + basicStateReducer

// 证据
function updateState<S>(initialState) {
  return updateReducer(basicStateReducer, initialState);
}
```

### 8.2 设计差异

| 维度 | useState | useReducer |
|-----|---------|-----------|
| **Reducer** | 内置 basicStateReducer | 自定义 reducer |
| **Action** | 新状态值或函数 | 任意类型 |
| **复杂度** | 简单 | 复杂 |
| **类型安全** | 基础 | 强 (discriminated unions) |
| **测试** | 困难 | 简单 (reducer 是纯函数) |
| **Eager State 优化** | 有 | 无 |
| **适用场景** | 简单状态 | 复杂状态逻辑 |

### 8.3 选择决策树

```
需要管理状态?
  ├─ 简单状态 (number, string, boolean)
  │   └─ useState
  │
  ├─ 对象状态,但更新逻辑简单
  │   └─ useState
  │
  ├─ 复杂对象,多个更新操作
  │   ├─ 更新操作少于 3 个 → useState
  │   └─ 更新操作多于 3 个 → useReducer
  │
  ├─ 状态更新有复杂业务逻辑
  │   └─ useReducer
  │
  ├─ 需要严格的类型安全 (TypeScript)
  │   └─ useReducer
  │
  └─ 需要易于测试
      └─ useReducer
```

---

## 九、性能优化策略

### 9.1 避免不必要的渲染

```tsx
// ❌ 问题:状态在父组件,导致子组件重渲染
function Parent() {
  const [count, setCount] = useState(0);
  return (
    <div>
      <button onClick={() => setCount(c => c + 1)}>{count}</button>
      <ExpensiveChild />  {/* 每次 count 变化都重渲染 */}
    </div>
  );
}

// ✅ 解决方案 1:React.memo
const ExpensiveChild = React.memo(function ExpensiveChild() {
  return <div>I'm expensive</div>;
});

// ✅ 解决方案 2:状态下移
function Parent() {
  return (
    <div>
      <Counter />
      <ExpensiveChild />  {/* 不受 count 影响 */}
    </div>
  );
}

function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}
```

### 9.2 惰性初始化

```tsx
// ❌ 糟糕:每次渲染都计算
function Component() {
  const expensiveValue = computeExpensiveValue();
  const [state, setState] = useState(expensiveValue);
}

// ✅ 更好:惰性初始化
function Component() {
  const [state, setState] = useState(() => {
    return computeExpensiveValue();  // 只在 mount 时计算一次
  });
}
```

### 9.3 函数式更新避免闭包陷阱

```tsx
function Counter() {
  const [count, setCount] = useState(0);

  // ❌ 错误:依赖闭包值
  const increment = useCallback(() => {
    setCount(count + 1);
  }, [count]);  // callback 频繁重建

  // ✅ 正确:函数式更新
  const increment = useCallback(() => {
    setCount(c => c + 1);
  }, []);  // callback 永不重建
}
```

### 9.4 不可变更新模式

```tsx
// ❌ 错误:直接修改
function reducer(state, action) {
  state.todos.push(action.todo);  // 直接修改!
  return state;  // 返回相同引用,React 认为没变化
}

// ✅ 正确:不可变更新
function reducer(state, action) {
  return {
    ...state,
    todos: [...state.todos, action.todo],  // 创建新数组
  };
}

// ✅ 使用 Immer 简化
import { useImmerReducer } from 'use-immer';

function reducer(draft, action) {
  draft.todos.push(action.todo);  // 直接修改 draft
}
```

---

## 十、开发最佳实践

### 10.1 避免常见陷阱

#### 陷阱 1:闭包陷阱

```tsx
// ❌ 问题
function Counter() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      console.log(count);  // 永远是 0
      setCount(count + 1);  // 永远设置为 1
    }, 1000);
    return () => clearInterval(timer);
  }, []);  // 空依赖,闭包捕获初始值

  return <div>{count}</div>;
}

// ✅ 解决方案:函数式更新
useEffect(() => {
  const timer = setInterval(() => {
    setCount(c => c + 1);  // 基于最新值
  }, 1000);
  return () => clearInterval(timer);
}, []);
```

#### 陷阱 2:对象引用无限循环

```tsx
// ❌ 问题
function SearchBox() {
  const [results, setResults] = useState([]);
  const filters = { category: 'tech' };  // 每次渲染都是新对象!

  useEffect(() => {
    search(filters).then(setResults);
  }, [filters]);  // 无限循环!
}

// ✅ 解决方案:useMemo 缓存对象
const filters = useMemo(() => ({ category: 'tech' }), []);

// ✅ 或者定义在组件外部
const DEFAULT_FILTERS = { category: 'tech' };

function SearchBox() {
  useEffect(() => {
    search(DEFAULT_FILTERS).then(setResults);
  }, []);
}
```

### 10.2 TypeScript 最佳实践

```tsx
// 类型安全的 useReducer
type State = {
  status: 'idle' | 'loading' | 'success' | 'error';
  data: User | null;
  error: Error | null;
};

type Action =
  | { type: 'FETCH_START' }
  | { type: 'FETCH_SUCCESS'; payload: User }
  | { type: 'FETCH_ERROR'; payload: Error }
  | { type: 'RESET' };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'FETCH_START':
      return { status: 'loading', data: null, error: null };
    case 'FETCH_SUCCESS':
      return { status: 'success', data: action.payload, error: null };
    case 'FETCH_ERROR':
      return { status: 'error', data: null, error: action.payload };
    case 'RESET':
      return { status: 'idle', data: null, error: null };
    default:
      const _exhaustiveCheck: never = action;
      return state;
  }
}

// 类型安全的 dispatch
const [state, dispatch] = useReducer(reducer, initialState);
dispatch({ type: 'FETCH_SUCCESS', payload: user });  // ✅
dispatch({ type: 'FETCH_SUCCESS' });  // ❌ 错误:缺少 payload
dispatch({ type: 'UNKNOWN' });  // ❌ 错误:无效的 type
```

### 10.3 测试策略

```tsx
// 测试 reducer (纯函数,易于测试)
describe('counterReducer', () => {
  test('handles INCREMENT', () => {
    const state = { count: 5 };
    const action = { type: 'INCREMENT' };
    const newState = reducer(state, action);

    expect(newState).toEqual({ count: 6 });
  });

  test('does not mutate original state', () => {
    const state = { count: 5 };
    const action = { type: 'INCREMENT' };
    const newState = reducer(state, action);

    expect(state).toEqual({ count: 5 });  // 原状态不变
    expect(newState).not.toBe(state);  // 返回新对象
  });
});
```

---

## 十一、总结

### 核心要点回顾

1. **Hooks 存储机制**
   - React 使用单向链表存储 Hooks
   - Hooks 必须在顶层调用,保证链表顺序稳定
   - 双缓冲机制保证渲染的原子性

2. **useState 实现流程**
   - Mount:创建 Hook 节点,初始化状态,创建 dispatch
   - Update:处理更新队列,计算新状态
   - 支持函数式更新,避免闭包陷阱
   - Eager State 优化:相同值跳过渲染

3. **useReducer 实现**
   - useState 是 useReducer 的语法糖
   - 使用自定义 reducer 处理复杂状态
   - 更适合复杂状态、多种操作、需要类型安全的场景

4. **批处理机制**
   - React 18 实现自动批处理
   - 使用 Lane 模型判断是否可以复用现有调度
   - flushSync 可以强制同步更新

5. **调度器参与**
   - Lane 模型管理 31 种优先级
   - 不同事件类型分配不同优先级
   - Scheduler 使用 MessageChannel 实现时间切片
   - 过期时间机制防止饥饿

6. **设计取舍**
   - useState:简单、快速、有 Eager State 优化
   - useReducer:复杂、类型安全、易于测试
   - 根据状态复杂度选择合适的 Hook

### 深入学习资源

**React 官方文档**:
- [useState](https://react.dev/reference/react/useState)
- [useReducer](https://react.dev/reference/react/useReducer)

**源码阅读**:
- [ReactFiberHooks.js](https://github.com/facebook/react/blob/main/packages/react-reconciler/src/ReactFiberHooks.js)
- [ReactFiberLane.js](https://github.com/facebook/react/blob/main/packages/react-reconciler/src/ReactFiberLane.js)
- [Scheduler.js](https://github.com/facebook/react/blob/main/packages/scheduler/src/forks/Scheduler.js)

---

## 附录:常见问题 FAQ

### Q1: setState 是同步还是异步的?

**A**: 准确答案:
- setState 调用是同步的,但状态更新可能是异步的
- React 18:所有更新都会批处理 (看起来是异步的)
- 使用 flushSync 可以强制同步更新

### Q2: 为什么多次 setState 只触发一次渲染?

**A**: 批处理机制:
- 所有 setState 创建 Update 对象,加入队列
- React 在微任务检查点统一处理队列
- 一次性计算所有新状态,触发一次渲染

### Q3: useState 和 useRef 有什么区别?

| 特性 | useState | useRef |
|-----|---------|--------|
| 更新触发渲染 | 是 | 否 |
| 值的可变性 | 不可变 | 可变 |
| 异步更新 | 是 | 否 (立即生效) |
| 适用场景 | UI 状态 | DOM 引用、存储可变值 |

### Q4: 如何在 useEffect 中获取最新的状态?

**A**: 三种方法:

```tsx
// 方法 1: 函数式更新
useEffect(() => {
  setCount(c => c + 1);  // 总是基于最新值
}, []);

// 方法 2: useRef 存储最新值
const countRef = useRef(count);
countRef.current = count;

// 方法 3: 将状态加入依赖
useEffect(() => {
  console.log(count);  // 最新值
}, [count]);  // 每次 count 变化都重建
```

---

*本文最后更新于 2025 年 1 月,基于 React 18.2.0 源码分析。*
