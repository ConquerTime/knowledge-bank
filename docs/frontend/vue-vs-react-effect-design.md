# Vue 与 React 副作用处理的源码级设计差异分析

> 本文从源码设计角度，深入对比 Vue 和 React 在副作用处理上的核心差异，揭示两种框架背后的设计哲学与工程权衡。

## 目录

1. [引言](#一引言)
2. [核心设计哲学对比](#二核心设计哲学对比)
3. [React Effect 源码分析](#三react-effect-源码分析)
4. [Vue Effect 源码分析](#四vue-effect-源码分析)
5. [关键差异对比](#五关键差异对比)
6. [实际影响与最佳实践](#六实际影响与最佳实践)
7. [生态系统对比](#七生态系统对比)
8. [未来演进方向](#八未来演进方向)
9. [总结](#九总结)

---

## 一、引言

### 为什么要从源码角度对比

在日常开发中，我们经常听到这样的说法：

- "Vue 的响应式更直观"
- "React 的 useEffect 依赖数组容易出错"
- "Vue 自动追踪依赖，React 需要手动声明"

这些说法都是正确的，但如果不深入源码，我们很难理解：

1. **为什么** React 选择了手动依赖数组？
2. **为什么** Vue 能够自动追踪依赖？
3. 这两种设计各自的 **代价** 是什么？

本文将通过源码分析，揭示这些设计决策背后的原因。

### 两种设计哲学的根本差异

在深入源码之前，我们需要理解两种框架的核心设计哲学：

```
┌─────────────────────────────────────────────────────────────────────┐
│                           React                                      │
├─────────────────────────────────────────────────────────────────────┤
│  UI = f(state)                                                       │
│  - 函数式编程思想                                                      │
│  - 不可变数据 (Immutable)                                             │
│  - 显式声明依赖                                                        │
│  - 单向数据流                                                          │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                            Vue                                       │
├─────────────────────────────────────────────────────────────────────┤
│  UI = reactive(state)                                                │
│  - 响应式编程思想                                                      │
│  - 可变数据 (Mutable) + Proxy 拦截                                    │
│  - 自动依赖追踪                                                        │
│  - 双向绑定支持                                                        │
└─────────────────────────────────────────────────────────────────────┘
```

这个根本差异决定了两个框架在副作用处理上的不同实现方式。

---

## 二、核心设计哲学对比

### React: 函数式 + 不可变数据 + 显式声明

React 的核心理念是 **UI 是状态的函数**：

```tsx
// React 的心智模型
function Component(props) {
  const [state, setState] = useState(initialState);

  // UI = f(props, state)
  return <div>{state.value}</div>;
}
```

**关键设计决策**：

1. **不可变数据**：状态更新必须返回新对象
2. **纯函数组件**：相同输入产生相同输出
3. **显式依赖**：开发者必须声明副作用依赖

**为什么选择显式依赖？**

```tsx
// React 无法自动追踪依赖，因为：
useEffect(() => {
  // 1. JavaScript 没有原生的"属性访问拦截"机制
  // 2. 函数式组件每次渲染都是全新的闭包
  // 3. React 不知道这个函数会访问哪些变量
  console.log(count); // React 不知道这里访问了 count
}, [count]); // 所以需要手动告诉 React
```

### Vue: 响应式 + 可变数据 + 自动追踪

Vue 的核心理念是 **响应式数据驱动 UI 更新**：

```vue
<script setup>
import { ref, watchEffect } from 'vue';

// Vue 的心智模型
const count = ref(0);

// 自动追踪依赖
watchEffect(() => {
  console.log(count.value); // Vue 自动知道这里访问了 count
});
</script>
```

**关键设计决策**：

1. **Proxy 拦截**：拦截所有属性访问
2. **依赖收集**：运行时自动记录访问的响应式数据
3. **精确更新**：只有真正被访问的数据变化才触发更新

**为什么能自动追踪依赖？**

```ts
// Vue 通过 Proxy 拦截属性访问
const state = reactive({ count: 0 });

// 当执行 effect 时：
effect(() => {
  console.log(state.count);
  // 1. 访问 state.count 触发 Proxy 的 get 拦截
  // 2. Vue 记录"当前 effect 依赖 state.count"
  // 3. state.count 变化时，自动重新执行此 effect
});
```

---

## 三、React Effect 源码分析

### 1. Fiber 节点中的 Effect 结构

在 React Fiber 架构中，每个组件对应一个 Fiber 节点，Effect 信息存储在 Fiber 上：

```ts
// 简化的 Fiber 节点结构
interface Fiber {
  // ... 其他属性

  // 组件的 hooks 链表
  memoizedState: Hook | null;

  // Effect 标记
  flags: Flags;

  // 子树的 Effect 标记
  subtreeFlags: SubtreeFlags;
}

// Hook 结构（链表节点）
interface Hook {
  memoizedState: any;        // hook 的状态
  baseState: any;
  baseQueue: Update | null;
  queue: UpdateQueue | null;
  next: Hook | null;         // 指向下一个 hook
}

// useEffect 的 Hook.memoizedState 结构
interface Effect {
  tag: HookFlags;            // effect 类型标记
  create: () => (() => void) | void;  // effect 函数
  destroy: (() => void) | void;       // 清理函数
  deps: Array<mixed> | null;          // 依赖数组
  next: Effect;              // 环形链表
}
```

### 2. useEffect Hook 的实现

```ts
// 简化的 useEffect 实现（packages/react-reconciler/src/ReactFiberHooks.js）

function mountEffect(
  create: () => (() => void) | void,
  deps: Array<mixed> | void | null,
): void {
  return mountEffectImpl(
    PassiveEffect | PassiveStaticEffect,  // effect 标记
    HookPassive,                          // hook 标记
    create,
    deps,
  );
}

function updateEffect(
  create: () => (() => void) | void,
  deps: Array<mixed> | void | null,
): void {
  return updateEffectImpl(
    PassiveEffect,
    HookPassive,
    create,
    deps,
  );
}

function mountEffectImpl(fiberFlags, hookFlags, create, deps) {
  // 创建 hook 对象
  const hook = mountWorkInProgressHook();
  const nextDeps = deps === undefined ? null : deps;

  // 标记当前 fiber 有 effect 需要处理
  currentlyRenderingFiber.flags |= fiberFlags;

  // 创建 effect 对象并存储
  hook.memoizedState = pushEffect(
    HookHasEffect | hookFlags,  // 标记需要执行
    create,
    undefined,  // destroy 暂时为空
    nextDeps,
  );
}

function updateEffectImpl(fiberFlags, hookFlags, create, deps) {
  const hook = updateWorkInProgressHook();
  const nextDeps = deps === undefined ? null : deps;
  let destroy = undefined;

  if (currentHook !== null) {
    const prevEffect = currentHook.memoizedState;
    destroy = prevEffect.destroy;

    if (nextDeps !== null) {
      const prevDeps = prevEffect.deps;
      // 关键：比较依赖数组
      if (areHookInputsEqual(nextDeps, prevDeps)) {
        // 依赖未变化，不标记 HookHasEffect
        hook.memoizedState = pushEffect(hookFlags, create, destroy, nextDeps);
        return;
      }
    }
  }

  // 依赖变化，标记需要执行
  currentlyRenderingFiber.flags |= fiberFlags;
  hook.memoizedState = pushEffect(
    HookHasEffect | hookFlags,
    create,
    destroy,
    nextDeps,
  );
}
```

### 3. 依赖比较：areHookInputsEqual

这是 React Effect 的核心比较逻辑：

```ts
// 简化的依赖比较实现
function areHookInputsEqual(
  nextDeps: Array<mixed>,
  prevDeps: Array<mixed> | null,
): boolean {
  if (prevDeps === null) {
    return false;
  }

  // 长度不同直接返回 false
  if (nextDeps.length !== prevDeps.length) {
    console.error('依赖数组长度不应该变化');
  }

  // 逐项比较
  for (let i = 0; i < prevDeps.length && i < nextDeps.length; i++) {
    // 使用 Object.is 进行比较
    if (is(nextDeps[i], prevDeps[i])) {
      continue;
    }
    return false;
  }

  return true;
}

// Object.is polyfill
function is(x: any, y: any): boolean {
  return (
    (x === y && (x !== 0 || 1 / x === 1 / y)) ||
    (x !== x && y !== y)  // NaN === NaN
  );
}
```

**关键点**：

1. 使用 `Object.is` 而非 `===`（处理 `NaN` 和 `+0/-0`）
2. **浅比较**：对象/数组只比较引用
3. 依赖数组长度变化会触发警告

**这就是为什么对象依赖容易出问题**：

```tsx
function Component({ filter }) {
  useEffect(() => {
    fetchData(filter);
  }, [filter]);
  // 如果 filter 每次渲染都是新对象，即使值相同，
  // Object.is 也会返回 false，导致 effect 重复执行
}
```

### 4. Effect 的调度：commitRoot 阶段

React 的渲染分为两个阶段：

```
Render Phase (可中断)          Commit Phase (不可中断)
      │                              │
      ▼                              ▼
┌─────────────┐              ┌───────────────────┐
│ beginWork   │              │ commitBeforeMutationEffects │
│ completeWork│              │ commitMutationEffects        │
│ 构建 Fiber  │              │ commitLayoutEffects          │
└─────────────┘              └───────────────────┘
                                      │
                                      ▼
                             ┌───────────────────┐
                             │ flushPassiveEffects │  ← useEffect
                             │ (异步调度)           │
                             └───────────────────┘
```

```ts
// 简化的 commit 阶段 effect 处理
function commitRoot(root) {
  // 1. Before Mutation 阶段
  commitBeforeMutationEffects(root, finishedWork);

  // 2. Mutation 阶段（DOM 操作）
  commitMutationEffects(root, finishedWork);

  // 3. Layout 阶段
  // useLayoutEffect 的 create 在这里同步执行
  commitLayoutEffects(finishedWork, root);

  // 4. 调度 Passive Effects（useEffect）
  // 关键：异步调度，在浏览器绑绘制后执行
  if (rootDoesHavePassiveEffects) {
    scheduleCallback(NormalSchedulerPriority, () => {
      flushPassiveEffects();
      return null;
    });
  }
}

function flushPassiveEffects() {
  // 1. 先执行所有 destroy（清理函数）
  commitPassiveUnmountEffects(root.current);

  // 2. 再执行所有 create（effect 函数）
  commitPassiveMountEffects(root, root.current);
}
```

**关键理解**：

- `useLayoutEffect`：在 DOM 更新后、浏览器绘制前**同步执行**
- `useEffect`：在浏览器绘制后**异步执行**（通过 Scheduler）

### 5. 清理函数的执行时机

```ts
// 清理函数的执行顺序
function commitPassiveUnmountEffects(finishedWork) {
  // 遍历 effect 链表
  let effect = firstEffect;
  do {
    const { destroy, tag } = effect;

    if (destroy !== undefined) {
      if ((tag & HookPassive) !== NoHookEffect) {
        // 执行清理函数
        destroy();
      }
    }

    effect = effect.next;
  } while (effect !== firstEffect);
}
```

**执行顺序**：

```
组件 A 更新：

1. [同步] 新的 render
2. [同步] commit DOM 更新
3. [同步] 浏览器绘制
4. [异步] 执行旧 effect 的 destroy
5. [异步] 执行新 effect 的 create
```

---

## 四、Vue Effect 源码分析

### 1. ReactiveEffect 类的设计

Vue 3 的响应式核心是 `ReactiveEffect` 类：

```ts
// 简化的 ReactiveEffect（packages/reactivity/src/effect.ts）

class ReactiveEffect<T = any> {
  active = true;           // 是否激活
  deps: Dep[] = [];        // 依赖的 Dep 集合
  parent: ReactiveEffect | undefined = undefined;

  // 计算属性相关
  computed?: ComputedRefImpl<T>;

  // 调度器
  scheduler?: EffectScheduler;

  // 允许递归
  allowRecurse?: boolean;

  // 停止时的回调
  onStop?: () => void;

  constructor(
    public fn: () => T,
    public trigger?: () => void,
    public scheduler?: EffectScheduler,
    scope?: EffectScope
  ) {
    recordEffectScope(this, scope);
  }

  run() {
    if (!this.active) {
      return this.fn();
    }

    // 关键：设置当前正在执行的 effect
    let parent: ReactiveEffect | undefined = activeEffect;
    let lastShouldTrack = shouldTrack;

    while (parent) {
      if (parent === this) {
        return; // 防止循环依赖
      }
      parent = parent.parent;
    }

    try {
      this.parent = activeEffect;
      activeEffect = this;  // 设置当前 effect
      shouldTrack = true;

      // 清理旧依赖
      cleanupEffect(this);

      // 执行 effect 函数，触发依赖收集
      return this.fn();
    } finally {
      activeEffect = this.parent;
      shouldTrack = lastShouldTrack;
      this.parent = undefined;
    }
  }

  stop() {
    if (this.active) {
      cleanupEffect(this);
      if (this.onStop) {
        this.onStop();
      }
      this.active = false;
    }
  }
}

// 当前正在执行的 effect（全局变量）
let activeEffect: ReactiveEffect | undefined;
```

### 2. track/trigger 依赖收集机制

Vue 的自动依赖追踪通过 `track` 和 `trigger` 实现：

```ts
// 依赖存储结构
// targetMap: WeakMap<target, Map<key, Set<ReactiveEffect>>>
const targetMap = new WeakMap<object, KeyToDepMap>();

// 依赖收集（当访问响应式属性时调用）
function track(target: object, type: TrackOpTypes, key: unknown) {
  if (shouldTrack && activeEffect) {
    // 获取或创建 target 对应的依赖 Map
    let depsMap = targetMap.get(target);
    if (!depsMap) {
      targetMap.set(target, (depsMap = new Map()));
    }

    // 获取或创建 key 对应的依赖 Set
    let dep = depsMap.get(key);
    if (!dep) {
      depsMap.set(key, (dep = createDep()));
    }

    // 将当前 effect 添加到依赖集合
    trackEffects(dep);
  }
}

function trackEffects(dep: Dep) {
  // 双向关联
  dep.add(activeEffect!);           // dep 记录 effect
  activeEffect!.deps.push(dep);     // effect 记录 dep
}

// 触发更新（当修改响应式属性时调用）
function trigger(
  target: object,
  type: TriggerOpTypes,
  key?: unknown,
  newValue?: unknown,
  oldValue?: unknown,
) {
  const depsMap = targetMap.get(target);
  if (!depsMap) {
    return; // 从未被追踪
  }

  // 收集需要触发的 effects
  let deps: (Dep | undefined)[] = [];

  if (key !== undefined) {
    deps.push(depsMap.get(key));
  }

  // 特殊处理数组长度变化等情况
  // ...

  // 触发所有相关 effects
  const effects: ReactiveEffect[] = [];
  for (const dep of deps) {
    if (dep) {
      effects.push(...dep);
    }
  }

  triggerEffects(createDep(effects));
}

function triggerEffects(dep: Dep) {
  const effects = [...dep];

  // 先触发 computed effects
  for (const effect of effects) {
    if (effect.computed) {
      triggerEffect(effect);
    }
  }

  // 再触发普通 effects
  for (const effect of effects) {
    if (!effect.computed) {
      triggerEffect(effect);
    }
  }
}

function triggerEffect(effect: ReactiveEffect) {
  if (effect !== activeEffect || effect.allowRecurse) {
    if (effect.scheduler) {
      // 有调度器，使用调度器执行
      effect.scheduler();
    } else {
      // 直接执行
      effect.run();
    }
  }
}
```

### 3. Proxy 拦截器的实现

```ts
// 简化的 reactive 实现
function reactive(target: object) {
  return new Proxy(target, {
    get(target, key, receiver) {
      const res = Reflect.get(target, key, receiver);

      // 依赖收集
      track(target, TrackOpTypes.GET, key);

      // 深层响应式
      if (isObject(res)) {
        return reactive(res);
      }

      return res;
    },

    set(target, key, value, receiver) {
      const oldValue = target[key];
      const result = Reflect.set(target, key, value, receiver);

      // 触发更新
      if (hasChanged(value, oldValue)) {
        trigger(target, TriggerOpTypes.SET, key, value, oldValue);
      }

      return result;
    },

    deleteProperty(target, key) {
      const hadKey = hasOwn(target, key);
      const result = Reflect.deleteProperty(target, key);

      if (result && hadKey) {
        trigger(target, TriggerOpTypes.DELETE, key);
      }

      return result;
    },

    // ... has, ownKeys 等
  });
}
```

### 4. watchEffect vs watch 的差异

```ts
// watchEffect：立即执行，自动追踪依赖
function watchEffect(
  effect: WatchEffect,
  options?: WatchEffectOptions
): WatchStopHandle {
  return doWatch(effect, null, options);
}

// watch：懒执行，显式指定数据源
function watch<T>(
  source: WatchSource<T>,
  cb: WatchCallback<T>,
  options?: WatchOptions
): WatchStopHandle {
  return doWatch(source, cb, options);
}

// 核心实现
function doWatch(
  source: WatchSource | WatchSource[] | WatchEffect | object,
  cb: WatchCallback | null,
  { immediate, deep, flush, onTrack, onTrigger }: WatchOptions = {}
): WatchStopHandle {

  let getter: () => any;
  let forceTrigger = false;
  let isMultiSource = false;

  // 根据 source 类型创建 getter
  if (isRef(source)) {
    getter = () => source.value;
    forceTrigger = isShallow(source);
  } else if (isReactive(source)) {
    getter = () => source;
    deep = true;
  } else if (isArray(source)) {
    isMultiSource = true;
    getter = () => source.map(s => /* ... */);
  } else if (isFunction(source)) {
    if (cb) {
      // watch(getter, callback)
      getter = () => source();
    } else {
      // watchEffect
      getter = () => {
        if (cleanup) {
          cleanup();
        }
        return source(onCleanup);
      };
    }
  }

  // 创建调度器
  let scheduler: EffectScheduler;
  if (flush === 'sync') {
    scheduler = job as any;  // 同步执行
  } else if (flush === 'post') {
    scheduler = () => queuePostRenderEffect(job);  // DOM 更新后
  } else {
    // 默认 'pre'
    scheduler = () => queuePreFlushCb(job);  // DOM 更新前
  }

  // 创建 ReactiveEffect
  const effect = new ReactiveEffect(getter, scheduler);

  // 初始执行
  if (cb) {
    if (immediate) {
      job();  // watch 的 immediate
    } else {
      oldValue = effect.run();
    }
  } else {
    effect.run();  // watchEffect 立即执行
  }

  // 返回停止函数
  return () => {
    effect.stop();
  };
}
```

**关键差异**：

| 特性 | watchEffect | watch |
| ---- | ----------- | ----- |
| 执行时机 | 立即执行 | 默认懒执行（除非 immediate: true） |
| 依赖追踪 | 自动 | 显式指定 source |
| 回调参数 | onCleanup | (newVal, oldVal, onCleanup) |
| 适用场景 | 简单副作用 | 需要旧值或精确控制 |

### 5. Scheduler 的 flush 策略

Vue 的调度器支持三种 flush 策略：

```ts
// flush: 'pre' | 'post' | 'sync'

// 调度队列
const queue: SchedulerJob[] = [];
const pendingPreFlushCbs: SchedulerJob[] = [];
const pendingPostFlushCbs: SchedulerJob[] = [];

// 同步执行
// flush: 'sync' - 立即执行，无队列

// Pre flush（默认）- DOM 更新前
function queuePreFlushCb(cb: SchedulerJob) {
  queueCb(cb, pendingPreFlushCbs);
}

// Post flush - DOM 更新后
function queuePostFlushCb(cb: SchedulerJob) {
  queueCb(cb, pendingPostFlushCbs);
}

// 主调度循环
function flushJobs() {
  // 1. 执行 pre flush callbacks
  flushPreFlushCbs();

  // 2. 执行主队列（组件更新）
  try {
    for (flushIndex = 0; flushIndex < queue.length; flushIndex++) {
      const job = queue[flushIndex];
      if (job && job.active !== false) {
        callWithErrorHandling(job, null, ErrorCodes.SCHEDULER);
      }
    }
  } finally {
    flushIndex = 0;
    queue.length = 0;
  }

  // 3. 执行 post flush callbacks
  flushPostFlushCbs();

  // 4. 如果有新任务，继续调度
  if (queue.length || pendingPreFlushCbs.length || pendingPostFlushCbs.length) {
    flushJobs();
  }
}
```

**与 React 的对比**：

```
React:
  useLayoutEffect  →  同步，DOM 更新后立即执行
  useEffect        →  异步，浏览器绘制后执行

Vue:
  flush: 'sync'    →  同步立即执行
  flush: 'pre'     →  异步，DOM 更新前执行（默认）
  flush: 'post'    →  异步，DOM 更新后执行
```

---

## 五、关键差异对比

### 1. 依赖追踪：手动 vs 自动

**React：手动声明**

```tsx
const [count, setCount] = useState(0);
const [name, setName] = useState('');

useEffect(() => {
  console.log(count, name);
}, [count, name]);  // 必须手动列出所有依赖
```

**实现原理**：

```ts
// React 在每次渲染时比较依赖数组
// 1. 保存上一次的依赖数组
// 2. 使用 Object.is 逐项比较
// 3. 任一项不同则重新执行 effect
```

**Vue：自动追踪**

```ts
const count = ref(0);
const name = ref('');

watchEffect(() => {
  console.log(count.value, name.value);
  // 自动追踪 count 和 name
});
```

**实现原理**：

```ts
// Vue 在执行 effect 时收集依赖
// 1. 设置 activeEffect 为当前 effect
// 2. 执行 effect 函数
// 3. 访问响应式数据触发 Proxy get
// 4. get 中调用 track() 建立依赖关系
```

**设计权衡**：

| 方面 | React 手动 | Vue 自动 |
| ---- | --------- | -------- |
| 开发体验 | 容易遗漏依赖 | 无需关心 |
| 运行时开销 | 仅比较数组 | Proxy 拦截 + 依赖收集 |
| 精确性 | 完全可控 | 可能追踪不必要的依赖 |
| 条件依赖 | 需要技巧 | 自然支持 |

### 2. 执行时机对比

```
                     ┌─────────────────────────────────────────┐
                     │            事件/状态变化                  │
                     └─────────────────────────────────────────┘
                                        │
                     ┌──────────────────┴──────────────────┐
                     │                                     │
              ┌──────▼──────┐                       ┌──────▼──────┐
              │   React     │                       │    Vue      │
              └──────┬──────┘                       └──────┬──────┘
                     │                                     │
         ┌───────────┼───────────┐             ┌───────────┼───────────┐
         │           │           │             │           │           │
    ┌────▼────┐ ┌────▼────┐ ┌────▼────┐   ┌────▼────┐ ┌────▼────┐ ┌────▼────┐
    │ Render  │ │ Commit  │ │ Paint   │   │flush:sync│ │flush:pre│ │flush:post│
    │ Phase   │ │ Phase   │ │         │   │ (同步)   │ │(DOM前)  │ │(DOM后)   │
    └────┬────┘ └────┬────┘ └────┬────┘   └────┬────┘ └────┬────┘ └────┬────┘
         │           │           │             │           │           │
         │      useLayout       useEffect      │           │           │
         │      Effect(同步)    (异步)          │           │           │
         │           │           │             │           │           │
         ▼           ▼           ▼             ▼           ▼           ▼
```

### 3. 清理机制对比

**React：返回清理函数**

```tsx
useEffect(() => {
  const subscription = subscribe();

  return () => {
    subscription.unsubscribe();  // 返回清理函数
  };
}, []);
```

**Vue：onCleanup 参数**

```ts
watchEffect((onCleanup) => {
  const subscription = subscribe();

  onCleanup(() => {
    subscription.unsubscribe();  // 通过参数注册清理函数
  });
});
```

**设计差异**：

```ts
// React 的清理函数在闭包中捕获值
useEffect(() => {
  const id = visibleId;  // 捕获当时的值
  return () => {
    console.log(id);  // 清理时使用捕获的值
  };
}, [visibleId]);

// Vue 的 onCleanup 可以访问最新值
watchEffect((onCleanup) => {
  const id = visibleId.value;
  onCleanup(() => {
    console.log(visibleId.value);  // 可以访问最新值
  });
});
```

### 4. 性能优化策略

**React 的优化方向**：

1. **Batching**：批量更新，减少渲染次数
2. **Concurrent Mode**：可中断渲染
3. **useMemo/useCallback**：缓存计算结果和函数
4. **React Compiler**（未来）：自动优化

```tsx
// React 需要手动优化
const memoizedValue = useMemo(() => computeExpensive(a, b), [a, b]);
const memoizedCallback = useCallback(() => doSomething(a, b), [a, b]);
```

**Vue 的优化方向**：

1. **细粒度响应式**：精确追踪变化的属性
2. **computed 缓存**：自动缓存计算结果
3. **模板静态分析**：编译时优化
4. **Vapor Mode**（未来）：无虚拟 DOM

```ts
// Vue 的 computed 自动缓存
const doubled = computed(() => count.value * 2);
// 只有 count 变化时才重新计算
```

### 5. 调试体验

**React DevTools**：

- 可以查看 hooks 列表和值
- Effect 依赖数组可见
- 但难以追踪 effect 执行原因

**Vue DevTools**：

- 响应式数据依赖图可视化
- 可以追踪哪个数据触发了哪个 effect
- 组件更新原因更清晰

---

## 六、实际影响与最佳实践

### 各自的优势场景

**React useEffect 更适合**：

```tsx
// 1. 需要精确控制依赖的场景
useEffect(() => {
  // 只在 id 变化时执行，忽略 config 变化
  fetchData(id, config);
}, [id]);  // 故意省略 config

// 2. 与非响应式外部系统集成
useEffect(() => {
  const chart = new ChartLibrary(ref.current);
  return () => chart.destroy();
}, []);

// 3. 需要异步清理的场景
useEffect(() => {
  let cancelled = false;

  async function fetch() {
    const data = await fetchData();
    if (!cancelled) {
      setData(data);
    }
  }

  fetch();
  return () => { cancelled = true; };
}, []);
```

**Vue watchEffect 更适合**：

```ts
// 1. 依赖关系复杂的场景
watchEffect(() => {
  // 自动追踪所有访问的响应式数据
  if (user.value?.settings?.theme) {
    applyTheme(user.value.settings.theme);
  }
});

// 2. 条件性依赖
watchEffect(() => {
  if (enabled.value) {
    // 只有 enabled 为 true 时才追踪 data
    console.log(data.value);
  }
});

// 3. 需要精确 flush 时机
watchEffect(() => {
  // DOM 更新后执行
  console.log(element.value?.offsetHeight);
}, { flush: 'post' });
```

### 常见陷阱对比

**React 常见陷阱**：

```tsx
// 1. 对象依赖陷阱
useEffect(() => {
  fetchData(options);
}, [options]);  // options 每次都是新对象！

// 解决方案
const stableOptions = useMemo(() => options, [options.key1, options.key2]);

// 2. 闭包陷阱
useEffect(() => {
  const id = setInterval(() => {
    setCount(count + 1);  // count 是过期的值！
  }, 1000);
  return () => clearInterval(id);
}, []);

// 解决方案
setCount(c => c + 1);  // 使用函数式更新

// 3. 依赖遗漏
useEffect(() => {
  fetchUser(userId);  // ESLint 警告：缺少 userId 依赖
}, []);
```

**Vue 常见陷阱**：

```ts
// 1. 解构导致失去响应式
const { count } = reactive({ count: 0 });
watchEffect(() => {
  console.log(count);  // 不会触发！count 已经不是响应式的了
});

// 解决方案
const state = reactive({ count: 0 });
watchEffect(() => {
  console.log(state.count);
});

// 2. 异步操作中的响应式追踪
watchEffect(async () => {
  await someAsyncOperation();
  console.log(data.value);  // 不会被追踪！await 之后的代码不在追踪范围
});

// 解决方案
watchEffect(() => {
  const value = data.value;  // 先同步访问
  someAsyncOperation().then(() => {
    console.log(value);
  });
});

// 3. 过度追踪
watchEffect(() => {
  // 整个 user 对象的任何属性变化都会触发
  console.log(user.value.name);
});

// 解决方案：使用 watch 精确指定
watch(
  () => user.value.name,
  (name) => console.log(name)
);
```

### 性能考量

**React 性能优化要点**：

```tsx
// 1. 避免在渲染期间创建新对象/数组作为依赖
// Bad
useEffect(() => {}, [{ id: 1 }]);

// Good
const deps = useMemo(() => ({ id: 1 }), []);
useEffect(() => {}, [deps]);

// 2. 拆分 effects
// Bad: 一个大 effect
useEffect(() => {
  fetchUser();
  setupAnalytics();
  initializeTheme();
}, [userId]);

// Good: 多个小 effects
useEffect(() => { fetchUser(); }, [userId]);
useEffect(() => { setupAnalytics(); }, []);
useEffect(() => { initializeTheme(); }, []);

// 3. 使用 useTransition 降低优先级
const [isPending, startTransition] = useTransition();
startTransition(() => {
  setSearchQuery(input);
});
```

**Vue 性能优化要点**：

```ts
// 1. 使用 shallowRef/shallowReactive 减少深层追踪
const state = shallowReactive({
  nested: { count: 0 }  // nested 内部不是响应式的
});

// 2. 使用 computed 缓存计算
// Bad
watchEffect(() => {
  const filtered = items.value.filter(expensiveFilter);
  console.log(filtered);
});

// Good
const filtered = computed(() => items.value.filter(expensiveFilter));
watchEffect(() => {
  console.log(filtered.value);  // 只有 items 变化才重新计算
});

// 3. 使用 effectScope 批量管理 effects
const scope = effectScope();

scope.run(() => {
  watchEffect(() => { /* ... */ });
  watchEffect(() => { /* ... */ });
});

// 一次性停止所有 effects
scope.stop();
```

---

## 七、生态系统对比

### React 生态

**TanStack Query（React Query）**：

```tsx
// 替代 useEffect 进行数据获取
function UserProfile({ userId }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['user', userId],
    queryFn: () => fetchUser(userId),
  });
}
```

**SWR**：

```tsx
// Vercel 的轻量级数据获取方案
import useSWR from 'swr';

function Profile() {
  const { data, error } = useSWR('/api/user', fetcher);
}
```

**Jotai/Zustand**：

```tsx
// 原子化状态管理，减少 effect 使用
import { atom, useAtom } from 'jotai';

const countAtom = atom(0);
const doubledAtom = atom((get) => get(countAtom) * 2);

function Counter() {
  const [count, setCount] = useAtom(countAtom);
  const [doubled] = useAtom(doubledAtom);
}
```

### Vue 生态

**VueQuery（TanStack Query for Vue）**：

```vue
<script setup>
import { useQuery } from '@tanstack/vue-query';

const { data, isLoading, error } = useQuery({
  queryKey: ['user', userId],
  queryFn: () => fetchUser(userId.value),
});
</script>
```

**VueUse**：

```vue
<script setup>
import { useWindowSize, useMouse, useStorage } from '@vueuse/core';

// 替代手写 effect
const { width, height } = useWindowSize();
const { x, y } = useMouse();
const state = useStorage('my-store', { count: 0 });
</script>
```

**Pinia**：

```ts
// Vue 官方状态管理
import { defineStore } from 'pinia';

export const useUserStore = defineStore('user', () => {
  const user = ref(null);
  const isLoggedIn = computed(() => !!user.value);

  async function login(credentials) {
    user.value = await api.login(credentials);
  }

  return { user, isLoggedIn, login };
});
```

### 生态对比总结

| 场景 | React 生态 | Vue 生态 |
| ---- | --------- | -------- |
| 数据获取 | TanStack Query, SWR | VueQuery, VueUse |
| 状态管理 | Zustand, Jotai, Redux | Pinia, Vuex |
| 工具函数 | react-use | VueUse |
| 表单处理 | React Hook Form | VeeValidate, FormKit |

---

## 八、未来演进方向

### React 的演进

**1. React Compiler（React Forget）**

React 团队正在开发编译器，自动优化组件：

```tsx
// 编译前
function Component({ items }) {
  const filtered = items.filter(x => x.active);
  return <List items={filtered} />;
}

// 编译后（自动 memo）
function Component({ items }) {
  const filtered = useMemo(
    () => items.filter(x => x.active),
    [items]
  );
  return <List items={filtered} />;
}
```

**2. Signals 讨论**

社区对在 React 中引入 Signals 有广泛讨论：

```tsx
// 假设的 React Signals API（非官方）
import { signal, computed } from 'react';

const count = signal(0);
const doubled = computed(() => count.value * 2);

function Counter() {
  return (
    <div>
      <p>{count.value}</p>
      <p>{doubled.value}</p>
      <button onClick={() => count.value++}>+</button>
    </div>
  );
}
```

**React 团队的态度**：谨慎，认为 Signals 与 React 的心智模型有冲突。

**3. Server Components**

将数据获取移到服务端，减少客户端 effect：

```tsx
// Server Component - 无需 useEffect
async function UserProfile({ userId }) {
  const user = await db.user.findUnique({ where: { id: userId } });
  return <div>{user.name}</div>;
}
```

### Vue 的演进

**1. Vapor Mode**

Vue 团队正在开发的无虚拟 DOM 编译模式：

```vue
<!-- Vapor Mode 编译后直接操作 DOM -->
<template>
  <div>{{ count }}</div>
  <button @click="count++">+</button>
</template>
```

**优势**：
- 更小的运行时
- 更好的性能
- 保持相同的开发体验

**2. 响应式系统优化**

```ts
// Vue 3.4+ 的优化：更精确的依赖追踪
const state = reactive({
  items: [1, 2, 3],
  filter: 'all'
});

// 只有真正被访问的属性才建立依赖
watchEffect(() => {
  if (state.filter === 'all') {
    console.log(state.items.length);  // 只追踪 filter 和 items.length
  }
});
```

**3. 更好的 TypeScript 支持**

```ts
// Vue 3.5+ 泛型组件
<script setup lang="ts" generic="T extends { id: number }">
defineProps<{
  items: T[]
  selected: T
}>();
</script>
```

---

## 九、总结

### 设计权衡分析

**React 的设计选择**：

| 选择 | 优势 | 代价 |
| ---- | ---- | ---- |
| 手动依赖数组 | 完全可控，无运行时开销 | 易出错，心智负担重 |
| 不可变数据 | 可预测，易调试 | 需要更多模板代码 |
| 函数式组件 | 简洁，易测试 | 闭包陷阱 |

**Vue 的设计选择**：

| 选择 | 优势 | 代价 |
| ---- | ---- | ---- |
| 自动依赖追踪 | 开发体验好，不易出错 | Proxy 运行时开销 |
| 可变数据 | 直观，符合直觉 | 需要理解响应式系统 |
| 细粒度响应式 | 精确更新，性能好 | 调试复杂度 |

### 选型建议

**选择 React 如果**：

1. 团队熟悉函数式编程
2. 需要更大的生态系统和社区支持
3. 项目需要 SSR/Server Components
4. 希望更多控制权和可预测性

**选择 Vue 如果**：

1. 追求更好的开发体验
2. 团队偏好较少的模板代码
3. 需要更直观的响应式系统
4. 中小型项目快速开发

### 最终思考

React 和 Vue 的 Effect 设计差异，本质上反映了两种编程范式的对立：

- **React**：显式优于隐式，可预测性优先
- **Vue**：开发体验优先，让框架处理复杂性

没有绝对的优劣，只有是否适合你的团队和项目。理解底层原理，才能更好地使用工具，避免踩坑。

---

## 参考资料

### React 相关

1. [React 源码 - ReactFiberHooks](https://github.com/facebook/react/blob/main/packages/react-reconciler/src/ReactFiberHooks.js)
2. [React 官方文档 - useEffect](https://react.dev/reference/react/useEffect)
3. [Dan Abramov - A Complete Guide to useEffect](https://overreacted.io/a-complete-guide-to-useeffect/)

### Vue 相关

4. [Vue 源码 - @vue/reactivity](https://github.com/vuejs/core/tree/main/packages/reactivity)
5. [Vue 官方文档 - 响应式基础](https://vuejs.org/guide/essentials/reactivity-fundamentals.html)
6. [Vue 官方文档 - 深入响应式系统](https://vuejs.org/guide/extras/reactivity-in-depth.html)

### 对比分析

7. [Vue vs React: 2024 Comparison](https://vuejs.org/guide/extras/comparison.html)
8. [Signals vs React Hooks](https://dev.to/this-is-learning/signals-vs-react-hooks-3n4c)

---

*本文最后更新于 2025 年 1 月。随着 React 和 Vue 的持续演进，部分内容可能需要更新。*
