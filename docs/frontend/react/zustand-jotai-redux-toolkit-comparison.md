# React 状态管理库源码对比：Zustand vs Jotai vs Redux Toolkit

## 引言

在 React 生态系统中，状态管理一直是核心议题。从早期的 Redux 到如今百花齐放的状态管理方案，每个库都代表着不同的设计哲学和架构思路。本文将从**源码设计角度**深入分析三个主流状态管理库：

- **Zustand** v5.0.9 - 极简主义的状态管理
- **Jotai** v2.16.1 - 原子化状态管理
- **Redux Toolkit** v2.11.2 - 规范化的 Flux 架构

> 本文所有源码分析均基于实际 node_modules 中的源码，力求严谨准确。

---

## 一、核心设计哲学对比

### 1.1 设计范式

| 特性 | Zustand | Jotai | Redux Toolkit |
|------|---------|-------|---------------|
| **架构模式** | 单一 Store | 原子化 | Flux/Redux |
| **状态粒度** | 整体状态 | 原子级别 | Slice 切片 |
| **数据流** | 发布-订阅 | 依赖图追踪 | 单向数据流 |
| **核心抽象** | store | atom | slice + store |
| **状态共享** | 模块级 | Context/模块级 | Provider 模式 |

### 1.2 代码复杂度对比

```
Zustand 核心代码:    ~27 行  (vanilla.ts)
Jotai Store 实现:    ~767 行 (vanilla/internals.js)
Redux Toolkit:       ~1000+ 行 (createSlice.ts + createReducer.ts + configureStore.ts)
```

这个对比直接反映了三者的设计取向：
- **Zustand**: 极简主义，做减法
- **Jotai**: 精细粒度，依赖追踪复杂但概念简单
- **Redux Toolkit**: 功能全面，约定大于配置

---

## 二、Zustand 源码分析

### 2.1 核心实现（仅 27 行）

Zustand 的核心代码令人惊叹地简洁。以下是 `vanilla.ts` 的核心实现：

```typescript
// packages/zustand/src/vanilla.ts
const createStoreImpl: CreateStoreImpl = (createState) => {
  type TState = ReturnType<typeof createState>
  type Listener = (state: TState, prevState: TState) => void

  let state: TState
  const listeners: Set<Listener> = new Set()

  const setState: SetState<TState> = (partial, replace) => {
    const nextState =
      typeof partial === 'function'
        ? (partial as (state: TState) => TState)(state)
        : partial
    if (!Object.is(nextState, state)) {
      const previousState = state
      state =
        replace ?? typeof nextState !== 'object' || nextState === null
          ? (nextState as TState)
          : Object.assign({}, state, nextState)
      listeners.forEach((listener) => listener(state, previousState))
    }
  }

  const getState: () => TState = () => state

  const subscribe: Subscribe<TState> = (listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  const api = { setState, getState, subscribe }
  state = createState(setState, getState, api)
  return api as StoreApi<TState>
}
```

### 2.2 设计亮点

#### 2.2.1 发布-订阅模式

```typescript
const listeners: Set<Listener> = new Set()

// 订阅
const subscribe = (listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener) // 返回取消订阅函数
}

// 发布
listeners.forEach((listener) => listener(state, previousState))
```

使用 `Set` 而非数组的优势：
- **O(1)** 的添加和删除复杂度
- 自动去重，防止重复订阅
- 迭代顺序与插入顺序一致

#### 2.2.2 状态变更检测

```typescript
if (!Object.is(nextState, state)) {
  // 只有在状态真正变化时才通知订阅者
}
```

使用 `Object.is` 进行比较：
- 比 `===` 更严格（正确处理 `NaN`、`+0/-0`）
- 与 React 的比较逻辑一致

#### 2.2.3 灵活的状态更新

```typescript
// 支持函数式更新
const nextState = typeof partial === 'function'
  ? (partial as (state: TState) => TState)(state)
  : partial

// 支持完全替换或合并
state = replace ?? typeof nextState !== 'object' || nextState === null
  ? (nextState as TState)
  : Object.assign({}, state, nextState)
```

### 2.3 React 集成

```typescript
// packages/zustand/src/react.ts
export function useStore<TState, StateSlice>(
  api: ReadonlyStoreApi<TState>,
  selector: (state: TState) => StateSlice = identity as any,
  equalityFn?: (a: StateSlice, b: StateSlice) => boolean,
) {
  const slice = useSyncExternalStore(
    api.subscribe,
    () => selector(api.getState()),
    () => selector(api.getInitialState?.() ?? api.getState()),
  )
  useDebugValue(slice)
  return slice
}
```

**关键点**：使用 React 18 的 `useSyncExternalStore` 进行集成，这是官方推荐的外部状态同步方式，保证了：
- 并发模式下的一致性
- SSR 支持（通过第三个参数）
- 正确的 tearing 处理

### 2.4 中间件系统

Zustand 的中间件采用**高阶函数组合模式**：

```typescript
// persist 中间件示例
const persistImpl = (config, baseOptions) => (set, get, api) => {
  // 包装原始 set
  const wrappedSet = (state, replace) => {
    set(state, replace)
    // 持久化逻辑
    storage.setItem(name, serialize(get()))
  }

  // 初始化时恢复状态
  const hydrate = () => {
    const storedValue = storage.getItem(name)
    if (storedValue) {
      set(deserialize(storedValue), true)
    }
  }

  return config(wrappedSet, get, api)
}
```

这种设计的优势：
- **可组合性**：`persist(devtools(immer(store)))`
- **透明性**：中间件不改变 API 接口
- **惰性执行**：只在需要时才执行

---

## 三、Jotai 源码分析

### 3.1 Atom 定义

Jotai 的核心概念是 **Atom**（原子）。来看 `vanilla.js` 中的实现：

```javascript
// jotai/vanilla.js
var keyCount = 0;

function atom(read, write) {
  var key = "atom" + ++keyCount;
  var config = {
    toString: function toString() {
      return process.env.NODE_ENV !== 'production' && this.debugLabel
        ? key + ':' + this.debugLabel
        : key;
    }
  };

  if (typeof read === 'function') {
    // 派生 atom
    config.read = read;
  } else {
    // 原始 atom
    config.init = read;
    config.read = defaultRead;
    config.write = defaultWrite;
  }

  if (write) {
    config.write = write;
  }

  return config;
}

function defaultRead(get) {
  return get(this);
}

function defaultWrite(get, set, arg) {
  return set(this, typeof arg === 'function' ? arg(get(this)) : arg);
}
```

**设计洞察**：
- Atom 本质上是一个**配置对象**，包含 `read`、`write`、`init` 等属性
- 使用递增的 `keyCount` 生成唯一标识
- 支持函数式更新（类似 React 的 setState）

### 3.2 Store 实现（Building Blocks 架构）

Jotai 的 Store 采用**模块化的 Building Blocks 架构**，这是源码中最复杂也最精妙的部分：

```javascript
// jotai/vanilla/internals.js

// Store 核心数据结构
function buildStore() {
  var store = {
    get: function get(atom) {
      var storeGet = getInternalBuildingBlocks(store)[21];
      return storeGet(store, atom);
    },
    set: function set(atom) {
      var storeSet = getInternalBuildingBlocks(store)[22];
      return storeSet.apply(void 0, [store, atom].concat(args));
    },
    sub: function sub(atom, listener) {
      var storeSub = getInternalBuildingBlocks(store)[23];
      return storeSub(store, atom, listener);
    }
  };

  // Building Blocks 数组
  var buildingBlocks = [
    new WeakMap(),  // [0] atomStateMap - 存储 atom 状态
    new WeakMap(),  // [1] mountedMap - 存储已挂载的 atom
    new WeakMap(),  // [2] invalidatedAtoms - 失效的 atom
    new Set(),      // [3] changedAtoms - 变化的 atom
    new Set(),      // [4] mountCallbacks - 挂载回调
    new Set(),      // [5] unmountCallbacks - 卸载回调
    {},             // [6] storeHooks - Store 钩子
    // ... 更多 building blocks
  ];

  buildingBlockMap.set(store, Object.freeze(buildingBlocks));
  return store;
}
```

### 3.3 依赖追踪机制

这是 Jotai 最核心的特性。每个 atom 状态维护一个依赖图：

```javascript
// AtomState 数据结构
atomState = {
  d: new Map(),  // 依赖映射 Map<atom, epochNumber>
  p: new Set(),  // 待处理的 Promise 集合
  n: 0,          // epoch number（版本号）
  v: undefined,  // 值
  e: undefined   // 错误
};
```

#### 读取 Atom 时的依赖收集

```javascript
var BUILDING_BLOCK_readAtomState = function(store, atom) {
  // ... 省略部分代码

  function getter(a) {
    if (a === atom) {
      // 读取自身
      var aState = ensureAtomState(store, a);
      if (!isAtomStateInitialized(aState)) {
        if (hasInitialValue(a)) {
          setAtomStateValueOrPromise(store, a, a.init);
        } else {
          throw new Error('no atom init');
        }
      }
      return returnAtomValue(aState);
    }

    // 读取依赖 atom
    var aState = readAtomState(store, a);
    try {
      return returnAtomValue(aState);
    } finally {
      // 🔑 关键：记录依赖关系
      atomState.d.set(a, aState.n);

      // 处理 pending promise
      if (isPendingPromise(atomState.v)) {
        addPendingPromiseToDependency(atom, atomState.v, aState);
      }

      // 如果已挂载，更新依赖图
      if (mountedMap.has(atom)) {
        mountedMap.get(a).t.add(atom); // t = dependents (依赖此 atom 的 atoms)
      }
    }
  }

  // 执行 atom 的 read 函数
  var valueOrPromise = atomRead(store, atom, getter, options);
  setAtomStateValueOrPromise(store, atom, valueOrPromise);

  return atomState;
};
```

### 3.4 失效传播（Invalidation Propagation）

当一个 atom 变化时，需要使所有依赖它的 atoms 失效：

```javascript
var BUILDING_BLOCK_invalidateDependents = function(store, atom) {
  var stack = [atom];

  while (stack.length) {
    var a = stack.pop();
    var aState = ensureAtomState(store, a);

    // 遍历所有依赖此 atom 的 atoms
    for (var d of getMountedOrPendingDependents(a, aState, mountedMap)) {
      var dState = ensureAtomState(store, d);
      // 标记为失效
      invalidatedAtoms.set(d, dState.n);
      // 继续传播
      stack.push(d);
    }
  }
};
```

### 3.5 重新计算优化（Topological Sort）

Jotai 使用拓扑排序来确保依赖按正确顺序重新计算：

```javascript
var BUILDING_BLOCK_recomputeInvalidatedAtoms = function(store) {
  var topSortedReversed = [];
  var visiting = new WeakSet();
  var visited = new WeakSet();
  var stack = Array.from(changedAtoms);

  // 深度优先遍历，构建拓扑排序
  while (stack.length) {
    var a = stack[stack.length - 1];
    var aState = ensureAtomState(store, a);

    if (visited.has(a)) {
      stack.pop();
      continue;
    }

    if (visiting.has(a)) {
      if (invalidatedAtoms.get(a) === aState.n) {
        topSortedReversed.push([a, aState]);
      }
      visited.add(a);
      stack.pop();
      continue;
    }

    visiting.add(a);
    // 将依赖者加入栈
    for (var d of getMountedOrPendingDependents(a, aState, mountedMap)) {
      if (!visiting.has(d)) {
        stack.push(d);
      }
    }
  }

  // 逆序遍历，从叶子节点开始重新计算
  for (var i = topSortedReversed.length - 1; i >= 0; --i) {
    var [a, aState] = topSortedReversed[i];

    // 检查是否有依赖发生变化
    var hasChangedDeps = false;
    for (var dep of aState.d.keys()) {
      if (dep !== a && changedAtoms.has(dep)) {
        hasChangedDeps = true;
        break;
      }
    }

    if (hasChangedDeps) {
      readAtomState(store, a);
      mountDependencies(store, a);
    }
    invalidatedAtoms.delete(a);
  }
};
```

### 3.6 React 集成

```javascript
// jotai/react.js
function useAtomValue(atom, options) {
  var store = useStore(options);

  var storeRef = useRef$1();
  storeRef.current = store;
  var atomRef = useRef$1();
  atomRef.current = atom;

  // 使用 useReducer 触发重渲染
  var _useReducer = useReducer(function (prev, nextVersion) {
    var nextValue = store.get(atom);
    if (Object.is(prev[1], nextValue) && prev[2] === atom) {
      return prev;
    }
    return [nextVersion, nextValue, atom];
  }, undefined, function () {
    return [, store.get(atom), atom];
  });

  var value = _useReducer[0][1];
  var rerenderIfChanged = _useReducer[1];

  useEffect(function () {
    // 订阅 atom 变化
    return store.sub(atom, function () {
      rerenderIfChanged({}); // 使用新对象触发更新
    });
  }, [store, atom]);

  return isPromiseLike(value) ? use(value) : value;
}
```

**注意**：Jotai 使用 `useReducer` 而非 `useSyncExternalStore` 的原因是为了更好地控制渲染时机和处理 Suspense。

---

## 四、Redux Toolkit 源码分析

### 4.1 createSlice 实现

`createSlice` 是 RTK 最核心的 API，它自动生成 action creators 和 reducer：

```typescript
// @reduxjs/toolkit/src/createSlice.ts

export function buildCreateSlice({ creators }: BuildCreateSliceConfig = {}) {
  return function createSlice<State, CaseReducers, Name, Selectors, ReducerPath>(
    options: CreateSliceOptions<State, CaseReducers, Name, ReducerPath, Selectors>
  ): Slice<State, CaseReducers, Name, ReducerPath, Selectors> {

    const { name, reducerPath = name as unknown as ReducerPath } = options

    if (!name) {
      throw new Error('`name` is a required option for createSlice')
    }

    // 处理 reducers（支持函数式和对象式两种写法）
    const reducers = (typeof options.reducers === 'function'
      ? options.reducers(buildReducerCreators<State>())
      : options.reducers) || {}

    const reducerNames = Object.keys(reducers)

    // 上下文：收集 case reducers 和 action creators
    const context: ReducerHandlingContext<State> = {
      sliceCaseReducersByName: {},
      sliceCaseReducersByType: {},
      actionCreators: {},
      sliceMatchers: [],
    }

    // 处理每个 reducer 定义
    reducerNames.forEach((reducerName) => {
      const reducerDefinition = reducers[reducerName]
      const reducerDetails: ReducerDetails = {
        reducerName,
        type: getType(name, reducerName), // 生成 action type: "sliceName/reducerName"
        createNotation: typeof options.reducers === 'function',
      }

      if (isAsyncThunkSliceReducerDefinition<State>(reducerDefinition)) {
        // 处理 async thunk
        handleThunkCaseReducerDefinition(reducerDetails, reducerDefinition, contextMethods, cAT)
      } else {
        // 处理普通 reducer
        handleNormalReducerDefinition<State>(reducerDetails, reducerDefinition, contextMethods)
      }
    })

    // 构建最终的 reducer
    function buildReducer() {
      const [extraReducers, actionMatchers, defaultCaseReducer] =
        typeof options.extraReducers === 'function'
          ? executeReducerBuilderCallback(options.extraReducers)
          : [options.extraReducers]

      const finalCaseReducers = {
        ...extraReducers,
        ...context.sliceCaseReducersByType,
      }

      return createReducer(options.initialState, (builder) => {
        for (let key in finalCaseReducers) {
          builder.addCase(key, finalCaseReducers[key])
        }
        for (let sM of context.sliceMatchers) {
          builder.addMatcher(sM.matcher, sM.reducer)
        }
        for (let m of actionMatchers) {
          builder.addMatcher(m.matcher, m.reducer)
        }
        if (defaultCaseReducer) {
          builder.addDefaultCase(defaultCaseReducer)
        }
      })
    }

    // 返回 Slice 对象
    const slice: Slice = {
      name,
      reducer,
      actions: context.actionCreators,
      caseReducers: context.sliceCaseReducersByName,
      getInitialState,
      ...makeSelectorProps(reducerPath),
      injectInto(injectable, config) {
        // 动态注入到 combineSlices
      },
    }

    return slice
  }
}

// Action Type 生成规则
function getType(slice: string, actionKey: string): string {
  return `${slice}/${actionKey}` // e.g., "counter/increment"
}
```

### 4.2 createReducer 与 Immer 集成

`createReducer` 是 RTK 的核心，它使用 Immer 实现"可变式"的不可变更新：

```typescript
// @reduxjs/toolkit/src/createReducer.ts

import { createNextState, isDraft, isDraftable } from './immerImports'

export function createReducer<S extends NotFunction<any>>(
  initialState: S | (() => S),
  mapOrBuilderCallback: (builder: ActionReducerMapBuilder<S>) => void,
): ReducerWithInitialState<S> {

  let [actionsMap, finalActionMatchers, finalDefaultCaseReducer] =
    executeReducerBuilderCallback(mapOrBuilderCallback)

  // 冻结初始状态
  let getInitialState: () => S
  if (isStateFunction(initialState)) {
    getInitialState = () => freezeDraftable(initialState())
  } else {
    const frozenInitialState = freezeDraftable(initialState)
    getInitialState = () => frozenInitialState
  }

  function reducer(state = getInitialState(), action: any): S {
    // 收集匹配的 case reducers
    let caseReducers = [
      actionsMap[action.type],
      ...finalActionMatchers
        .filter(({ matcher }) => matcher(action))
        .map(({ reducer }) => reducer),
    ]

    if (caseReducers.filter((cr) => !!cr).length === 0) {
      caseReducers = [finalDefaultCaseReducer]
    }

    // 依次执行 case reducers（支持链式处理）
    return caseReducers.reduce((previousState, caseReducer): S => {
      if (caseReducer) {
        if (isDraft(previousState)) {
          // 🔑 已经是 draft，直接使用
          const draft = previousState as Draft<S>
          const result = caseReducer(draft, action)
          if (result === undefined) {
            return previousState
          }
          return result as S

        } else if (!isDraftable(previousState)) {
          // 🔑 原始值（如 number），不使用 Immer
          const result = caseReducer(previousState as any, action)
          if (result === undefined) {
            if (previousState === null) {
              return previousState
            }
            throw Error('A case reducer on a non-draftable value must not return undefined')
          }
          return result as S

        } else {
          // 🔑 核心：使用 Immer 的 createNextState（即 produce）
          return createNextState(previousState, (draft: Draft<S>) => {
            return caseReducer(draft, action)
          })
        }
      }
      return previousState
    }, state)
  }

  reducer.getInitialState = getInitialState
  return reducer as ReducerWithInitialState<S>
}
```

**Immer 集成的精妙之处**：

1. **自动检测 draft 状态**：如果已经在 Immer 上下文中，避免嵌套 produce
2. **原始值处理**：对于不可被 draft 的值（如 number），直接处理
3. **状态冻结**：生产环境下自动冻结状态，防止意外修改

### 4.3 createAsyncThunk 异步处理

`createAsyncThunk` 是 RTK 处理异步操作的标准方式：

```typescript
// @reduxjs/toolkit/src/createAsyncThunk.ts

export const createAsyncThunk = (() => {
  function createAsyncThunk<Returned, ThunkArg, ThunkApiConfig>(
    typePrefix: string,
    payloadCreator: AsyncThunkPayloadCreator<Returned, ThunkArg, ThunkApiConfig>,
    options?: AsyncThunkOptions<ThunkArg, ThunkApiConfig>,
  ): AsyncThunk<Returned, ThunkArg, ThunkApiConfig> {

    // 创建三个 action creators
    const fulfilled = createAction(
      typePrefix + '/fulfilled',
      (payload: Returned, requestId: string, arg: ThunkArg, meta?: FulfilledMeta) => ({
        payload,
        meta: { ...meta, arg, requestId, requestStatus: 'fulfilled' },
      }),
    )

    const pending = createAction(
      typePrefix + '/pending',
      (requestId: string, arg: ThunkArg, meta?: PendingMeta) => ({
        payload: undefined,
        meta: { ...meta, arg, requestId, requestStatus: 'pending' },
      }),
    )

    const rejected = createAction(
      typePrefix + '/rejected',
      (error: Error | null, requestId: string, arg: ThunkArg, payload?: RejectedValue, meta?: RejectedMeta) => ({
        payload,
        error: (options?.serializeError || miniSerializeError)(error || 'Rejected'),
        meta: {
          ...meta,
          arg,
          requestId,
          rejectedWithValue: !!payload,
          requestStatus: 'rejected',
          aborted: error?.name === 'AbortError',
          condition: error?.name === 'ConditionError',
        },
      }),
    )

    // Action Creator 返回一个 thunk 函数
    function actionCreator(arg: ThunkArg, { signal }: AsyncThunkDispatchConfig = {}) {
      return (dispatch, getState, extra) => {
        const requestId = options?.idGenerator?.(arg) || nanoid()
        const abortController = new AbortController()

        // 支持外部 AbortSignal
        if (signal) {
          if (signal.aborted) {
            abort(externalAbortMessage)
          } else {
            signal.addEventListener('abort', () => abort(externalAbortMessage), { once: true })
          }
        }

        const promise = (async function () {
          let finalAction

          try {
            // 条件检查
            let conditionResult = options?.condition?.(arg, { getState, extra })
            if (isThenable(conditionResult)) {
              conditionResult = await conditionResult
            }

            if (conditionResult === false || abortController.signal.aborted) {
              throw { name: 'ConditionError', message: 'Aborted due to condition callback returning false.' }
            }

            // 创建取消 Promise
            const abortedPromise = new Promise<never>((_, reject) => {
              abortController.signal.addEventListener('abort', () => {
                reject({ name: 'AbortError', message: abortReason || 'Aborted' })
              }, { once: true })
            })

            // 🔑 派发 pending action
            dispatch(pending(requestId, arg, options?.getPendingMeta?.({ requestId, arg }, { getState, extra })))

            // 🔑 执行 payloadCreator，与取消 Promise 竞争
            finalAction = await Promise.race([
              abortedPromise,
              Promise.resolve(
                payloadCreator(arg, {
                  dispatch,
                  getState,
                  extra,
                  requestId,
                  signal: abortController.signal,
                  abort,
                  rejectWithValue: (value, meta) => new RejectWithValue(value, meta),
                  fulfillWithValue: (value, meta) => new FulfillWithMeta(value, meta),
                }),
              ).then((result) => {
                if (result instanceof RejectWithValue) {
                  throw result
                }
                if (result instanceof FulfillWithMeta) {
                  return fulfilled(result.payload, requestId, arg, result.meta)
                }
                return fulfilled(result, requestId, arg)
              }),
            ])

          } catch (err) {
            finalAction = err instanceof RejectWithValue
              ? rejected(null, requestId, arg, err.payload, err.meta)
              : rejected(err, requestId, arg)
          }

          // 派发最终 action
          const skipDispatch = options?.dispatchConditionRejection === false
            && rejected.match(finalAction)
            && finalAction.meta.condition

          if (!skipDispatch) {
            dispatch(finalAction)
          }

          return finalAction
        })()

        // 返回增强的 Promise
        return Object.assign(promise, {
          abort,
          requestId,
          arg,
          unwrap() {
            return promise.then(unwrapResult)
          },
        })
      }
    }

    return Object.assign(actionCreator, {
      pending,
      rejected,
      fulfilled,
      settled: isAnyOf(rejected, fulfilled),
      typePrefix,
    })
  }

  createAsyncThunk.withTypes = () => createAsyncThunk
  return createAsyncThunk
})()
```

**关键设计**：

1. **生命周期 Actions**：自动生成 `pending`、`fulfilled`、`rejected` 三个 action
2. **可取消性**：内置 AbortController 支持
3. **条件执行**：支持 `condition` 选项跳过执行
4. **类型安全**：强大的 TypeScript 类型推断

### 4.4 configureStore 实现

```typescript
// @reduxjs/toolkit/src/configureStore.ts

export function configureStore<S, A extends Action, M, E, P>(
  options: ConfigureStoreOptions<S, A, M, E, P>
): EnhancedStore<S, A, E> {

  const getDefaultMiddleware = buildGetDefaultMiddleware<S>()

  const {
    reducer = undefined,
    middleware,
    devTools = true,
    duplicateMiddlewareCheck = true,
    preloadedState = undefined,
    enhancers = undefined,
  } = options || {}

  // 处理 reducer（支持单个 reducer 或 reducer map）
  let rootReducer: Reducer<S, A, P>
  if (typeof reducer === 'function') {
    rootReducer = reducer
  } else if (isPlainObject(reducer)) {
    rootReducer = combineReducers(reducer)
  } else {
    throw new Error('`reducer` is a required argument')
  }

  // 处理 middleware
  let finalMiddleware: Tuple<Middlewares<S>>
  if (typeof middleware === 'function') {
    finalMiddleware = middleware(getDefaultMiddleware)
  } else {
    finalMiddleware = getDefaultMiddleware()
  }

  // 开发环境检查重复 middleware
  if (process.env.NODE_ENV !== 'production' && duplicateMiddlewareCheck) {
    let middlewareReferences = new Set()
    finalMiddleware.forEach((middleware) => {
      if (middlewareReferences.has(middleware)) {
        throw new Error('Duplicate middleware references found')
      }
      middlewareReferences.add(middleware)
    })
  }

  // DevTools 集成
  let finalCompose = compose
  if (devTools) {
    finalCompose = composeWithDevTools({
      trace: process.env.NODE_ENV !== 'production',
      ...(typeof devTools === 'object' && devTools),
    })
  }

  // 构建 enhancer 链
  const middlewareEnhancer = applyMiddleware(...finalMiddleware)
  const getDefaultEnhancers = buildGetDefaultEnhancers(middlewareEnhancer)

  let storeEnhancers = typeof enhancers === 'function'
    ? enhancers(getDefaultEnhancers)
    : getDefaultEnhancers()

  const composedEnhancer = finalCompose(...storeEnhancers)

  // 🔑 最终调用 Redux 的 createStore
  return createStore(rootReducer, preloadedState, composedEnhancer)
}
```

---

## 五、关键差异对比表

### 5.1 架构设计对比

| 对比维度 | Zustand | Jotai | Redux Toolkit |
|---------|---------|-------|---------------|
| **状态存储** | 闭包变量 | WeakMap | Redux Store |
| **订阅机制** | Set + 直接通知 | 依赖图 + 拓扑排序 | Redux subscribe |
| **更新检测** | Object.is | Object.is + epoch | Reducer 纯函数 |
| **不可变性** | 可选（immer 中间件） | 自动 | 内置（Immer） |
| **React 集成** | useSyncExternalStore | useReducer | react-redux |
| **Devtools** | 中间件 | Devtools atom | 内置 |
| **TypeScript** | 良好 | 优秀 | 优秀 |

### 5.2 API 复杂度对比

```typescript
// Zustand - 最简 API
const useStore = create((set) => ({
  count: 0,
  increment: () => set((s) => ({ count: s.count + 1 })),
}))

// Jotai - 原子化 API
const countAtom = atom(0)
const incrementAtom = atom(null, (get, set) => set(countAtom, get(countAtom) + 1))

// Redux Toolkit - 规范化 API
const counterSlice = createSlice({
  name: 'counter',
  initialState: { count: 0 },
  reducers: {
    increment: (state) => { state.count += 1 },
  },
})
```

### 5.3 Bundle Size 对比

| 库 | 核心大小 (gzipped) | 完整功能 |
|----|-------------------|---------|
| Zustand | ~2.2 KB | ~3 KB |
| Jotai | ~3.5 KB | ~8 KB |
| Redux Toolkit | ~12 KB | ~35 KB |

---

## 六、性能特性分析

### 6.1 渲染优化策略

**Zustand**: 选择性订阅
```typescript
// 只有 count 变化时才重渲染
const count = useStore((state) => state.count)

// shallow 比较优化
const { name, email } = useStore(
  (state) => ({ name: state.name, email: state.email }),
  shallow
)
```

**Jotai**: 原子级精确更新
```typescript
// 只订阅需要的 atom
const name = useAtomValue(nameAtom)
const email = useAtomValue(emailAtom)

// 派生 atom 自动跟踪依赖
const fullName = atom((get) => `${get(firstNameAtom)} ${get(lastNameAtom)}`)
```

**Redux Toolkit**: Selector 缓存
```typescript
// reselect 缓存计算结果
const selectCompletedTodos = createSelector(
  [(state) => state.todos],
  (todos) => todos.filter((t) => t.completed)
)
```

### 6.2 更新传播效率

| 场景 | Zustand | Jotai | Redux Toolkit |
|------|---------|-------|---------------|
| 单值更新 | O(n) 订阅者 | O(依赖链) | O(n) 订阅者 |
| 批量更新 | 手动合并 | 自动批处理 | batch API |
| 选择性更新 | selector | 原子粒度 | selector |

---

## 七、选型指南

### 7.1 选择 Zustand 当...

- ✅ 追求**最小 bundle size**
- ✅ 需要**简单直接**的 API
- ✅ 项目**状态结构简单**
- ✅ 团队**React 经验丰富**，能自行处理性能优化
- ✅ 需要**模块级单例 store**（无 Provider）

```typescript
// 典型 Zustand 使用场景：简单全局状态
const useAppStore = create<AppState>((set) => ({
  theme: 'light',
  user: null,
  setTheme: (theme) => set({ theme }),
  login: async (credentials) => {
    const user = await api.login(credentials)
    set({ user })
  },
}))
```

### 7.2 选择 Jotai 当...

- ✅ 状态间有**复杂依赖关系**
- ✅ 需要**精细粒度**的更新控制
- ✅ 重度使用 **Suspense** 和 **Concurrent Mode**
- ✅ 喜欢 **Recoil 风格**的原子化思维
- ✅ 项目需要**自底向上**构建状态

```typescript
// 典型 Jotai 使用场景：依赖图状态
const currencyAtom = atom('USD')
const amountAtom = atom(100)
const rateAtom = atom(async (get) => {
  const currency = get(currencyAtom)
  return await fetchExchangeRate(currency)
})
const convertedAtom = atom((get) => {
  const amount = get(amountAtom)
  const rate = get(rateAtom)
  return amount * rate
})
```

### 7.3 选择 Redux Toolkit 当...

- ✅ 团队已有 **Redux 经验**
- ✅ 需要**时间旅行调试**
- ✅ 项目需要**严格的状态可预测性**
- ✅ 需要完整的 **DevTools 支持**
- ✅ 有复杂的**异步数据流**（RTK Query）
- ✅ 大型项目需要**约定俗成的模式**

```typescript
// 典型 RTK 使用场景：企业级应用
const userSlice = createSlice({
  name: 'user',
  initialState: { entities: {}, loading: false },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchUsers.pending, (state) => {
        state.loading = true
      })
      .addCase(fetchUsers.fulfilled, (state, action) => {
        state.loading = false
        state.entities = action.payload
      })
  },
})
```

---

## 八、总结

### 8.1 设计哲学对比

| 库 | 核心理念 | 适用场景 |
|----|---------|---------|
| **Zustand** | "Less is More" | 中小型项目、性能敏感场景 |
| **Jotai** | "Atomic State" | 复杂依赖关系、精细更新控制 |
| **Redux Toolkit** | "Predictable State Container" | 大型项目、团队协作、严格规范 |

### 8.2 源码设计启示

1. **Zustand** 展示了如何用最少的代码解决核心问题
2. **Jotai** 展示了依赖追踪和拓扑排序在状态管理中的应用
3. **Redux Toolkit** 展示了如何通过约定和工具减少样板代码

### 8.3 技术选型决策树

```
是否需要 DevTools 和时间旅行？
├── 是 → Redux Toolkit
└── 否 → 状态间是否有复杂依赖？
          ├── 是 → Jotai
          └── 否 → 是否追求最小 bundle？
                    ├── 是 → Zustand
                    └── 否 → 根据团队熟悉度选择
```

---

## 参考资源

- [Zustand GitHub](https://github.com/pmndrs/zustand)
- [Jotai GitHub](https://github.com/pmndrs/jotai)
- [Redux Toolkit GitHub](https://github.com/reduxjs/redux-toolkit)
- [React 18 useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore)

> 本文基于 Zustand v5.0.9、Jotai v2.16.1、Redux Toolkit v2.11.2 源码分析
