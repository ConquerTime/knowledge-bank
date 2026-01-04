# React 深度技术文档

> 面向高级工程师和架构师的 React 技术体系，聚焦源码原理、架构设计与工程实践。

---

## 一、React 核心原理

### 1.1 Fiber 架构

- [ ] Fiber 架构设计原理与源码实现
- [ ] 时间切片 (Time Slicing) 与调度器 (Scheduler) 深度解析
- [ ] 优先级调度机制：Lane 模型源码分析
- [ ] 双缓冲技术与增量渲染

### 1.2 Reconciliation 算法

- [ ] Diff 算法的设计哲学与实现细节
- [ ] key 的作用机制与性能陷阱
- [ ] 从 Stack Reconciler 到 Fiber Reconciler 的演进

### 1.3 Hooks 实现原理

- [x] [Hooks 链表存储机制与调用顺序约束](./hooks-linked-list-storage.md)
- [x] [useState/useReducer 源码级实现分析](./usestate-usereducer-implementation.md)
- [x] [React Effect 的设计弊端与完全替代方案](./react-effect-design-flaws-and-alternatives.md)
- [x] [useMemo/useCallback 的缓存策略与滥用问题](./usememo-usecallback-caching-strategy.md)
- [x] [useTransition/useDeferredValue 并发特性解析](./usetransition-usedeferredvalue-concurrency.md)

---

## 二、状态管理

### 2.1 状态管理方案对比

- [x] [React 状态管理库源码对比：Zustand vs Jotai vs Redux Toolkit](./zustand-jotai-redux-toolkit-comparison.md)
- [x] [React Query vs SWR：服务端状态管理源码对比](./react-query-vs-swr-server-state-source-compare.md)
- [x] [状态管理的本质：从 Flux 到 Signals 的演进](./state-management-essence-flux-to-signals-evolution.md)

### 2.2 Context 深度剖析

- [ ] Context 源码实现与性能陷阱
- [ ] Context 优化策略：memo、拆分、selector 模式
- [ ] 为什么大型应用不应该用 Context 做全局状态

### 2.3 服务端状态

- [ ] React Query 缓存架构与 Stale-While-Revalidate 策略
- [ ] 乐观更新 (Optimistic Updates) 的实现模式
- [ ] 无限滚动与分页的状态管理最佳实践

---

## 三、性能优化

### 3.1 渲染优化

- [ ] React 渲染机制全解：从 trigger 到 commit
- [ ] 组件拆分策略与渲染边界设计
- [ ] React.memo、useMemo、useCallback 的正确使用场景
- [ ] 虚拟列表实现原理与性能优化

### 3.2 并发特性

- [ ] React 18 并发渲染深度解析
- [ ] Suspense 的实现原理与架构意义
- [ ] Streaming SSR 与选择性注水 (Selective Hydration)

### 3.3 性能监控与调优

- [ ] React Profiler API 与性能分析实战
- [ ] 内存泄漏排查与预防
- [ ] Bundle 优化：Code Splitting 与 Tree Shaking

---

## 四、架构设计

### 4.1 组件设计模式

- [ ] Compound Components 复合组件模式
- [ ] Render Props vs Hooks：模式演进与取舍
- [ ] Headless Components 设计哲学
- [ ] 受控与非受控组件的架构决策

### 4.2 大型应用架构

- [ ] Feature-Sliced Design：前端分层架构实践
- [ ] Monorepo 下的 React 组件库架构
- [ ] 微前端架构：Module Federation 与 React

### 4.3 设计系统

- [ ] Design Tokens 与主题系统实现
- [ ] CSS-in-JS 方案对比：Styled-components vs Emotion vs Vanilla Extract
- [ ] Headless UI 组件库设计原则

---

## 五、服务端渲染

### 5.1 SSR 原理

- [ ] React SSR 完整流程源码分析
- [ ] Hydration 原理与 Mismatch 问题解决
- [ ] renderToString vs renderToPipeableStream

### 5.2 React Server Components

- [ ] RSC 协议规范与实现原理
- [ ] Server Components vs Client Components 边界划分
- [ ] RSC 与传统 SSR 的本质区别

### 5.3 框架对比

- [ ] Next.js App Router 架构深度解析
- [ ] Remix 数据流设计哲学
- [ ] Astro Islands 架构与 React 集成

---

## 六、测试策略

### 6.1 测试金字塔

- [ ] React 组件测试策略与最佳实践
- [ ] Testing Library 设计哲学与反模式
- [ ] Mock 策略：MSW 在 React 测试中的应用

### 6.2 高级测试

- [ ] 视觉回归测试：Storybook + Chromatic
- [ ] E2E 测试方案对比：Playwright vs Cypress
- [ ] 性能测试与基准测试

---

## 七、工程化实践

### 7.1 构建工具

- [ ] Vite 在 React 项目中的深度应用
- [ ] Turbopack vs Webpack vs esbuild：构建工具演进
- [ ] React Compiler (React Forget) 原理与展望

### 7.2 类型系统

- [ ] TypeScript 在 React 中的高级模式
- [ ] 类型安全的组件 API 设计
- [ ] 泛型组件与类型推断最佳实践

### 7.3 代码质量

- [ ] ESLint 规则集设计：从 Airbnb 到自定义规则
- [ ] React 专属 ESLint 插件深度配置
- [ ] 代码评审清单：React 项目最佳实践

---

## 八、跨端开发

### 8.1 React Native

- [ ] React Native 新架构深度解析
- [ ] Hermes 引擎与性能优化
- [ ] React Native vs Flutter 架构对比

### 8.2 跨平台方案

- [ ] Expo 生态与最佳实践
- [ ] React Native Web 同构方案
- [ ] Tauri + React 桌面应用开发

---

## 九、前沿探索

### 9.1 新范式

- [ ] Signals 响应式范式与 React 的未来
- [ ] React Compiler 自动优化原理
- [ ] Fine-Grained Reactivity 细粒度响应式对比

### 9.2 AI 集成

- [ ] React + LLM：流式输出的最佳实践
- [ ] AI Agent UI 组件设计
- [ ] Vercel AI SDK 架构解析

---

## 更新日志

| 日期 | 更新内容 |
|------|---------|
| 2026-01-04 | 新增《React Query vs SWR：服务端状态管理源码对比》 |
| 2026-01-04 | 新增《状态管理的本质：从 Flux 到 Signals 的演进》 |
| 2025-01-03 | 新增《Hooks 链表存储机制与调用顺序约束》 |
| 2025-01-03 | 新增《useState/useReducer 源码级实现分析》 |
| 2025-01-03 | 新增《useMemo/useCallback 的缓存策略与滥用问题》 |
| 2025-01-03 | 新增《useTransition/useDeferredValue 并发特性解析》 |
| 2024-01-03 | 新增《React Effect 的设计弊端与完全替代方案》 |
| 2024-01-03 | 新增《React 状态管理库源码对比：Zustand vs Jotai vs Redux Toolkit》 |
| 2024-01-03 | 初始化 React 技术文档体系结构 |

---

> **贡献指南**：欢迎补充高质量的深度技术内容，要求：
>
> 1. 基于源码分析和参考文献，不凭空杜撰
> 2. 面向高级工程师，避免入门级内容
> 3. 中英混合风格，技术术语保留英文
