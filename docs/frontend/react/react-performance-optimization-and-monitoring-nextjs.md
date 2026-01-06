# React 性能优化与 Web 性能监控：从 Rerender 到 RUM（Next.js 落地）

> 面向高级工程师的 React 性能方法论：先建立可度量的用户体验指标（Core Web Vitals），再用可解释的工程手段降低成本与波动；最终把“优化”变成“持续的监控与回归治理”。

---

## 0. 先统一语言：我们到底在优化什么？

React 性能在工程实践里通常混成三类问题：

- **用户体验（User-centric）**：页面“感觉”快不快？是否卡顿？是否抖动？
  - 典型指标：**LCP / INP / CLS**（Core Web Vitals）、FCP、TTFB
- **渲染成本（Rendering cost）**：一次交互触发了多少组件 render？render/commit 耗时多少？是否做了无效工作？
  - 典型指标：React commit duration、rerender 次数、reconciliation 热点组件
- **主线程压力（Main-thread contention）**：JS 长任务、layout/paint、资源加载阻塞导致的交互延迟
  - 典型指标：Long Tasks、Event Timing、Resource Timing、CPU time slice

结论：**“把 React render 压到很低”不等于用户体验最优**；最靠谱的路径是：

1. 用 Web Vitals 给体验定锚（目标与告警阈值）
2. 用 React/浏览器性能数据解释波动原因（定位）
3. 用最小化复杂度的方案修复（优化）
4. 用 RUM（Real User Monitoring）守住回归（治理）

---

## 1. React 性能优化的“成本模型”

你优化的不是“组件”，而是 **一次更新（update）** 的总成本：

1. **触发（trigger）**：事件回调/订阅/请求完成 → setState
2. **render 阶段**：计算 element tree（可被中断/重试）
3. **reconciliation**：diff + 标记 effects（work loop）
4. **commit 阶段**：DOM 变更、layout effect、ref、浏览器布局/绘制

所以“优化策略”也应该对应成本项：

- **减少 update 次数**：避免不必要的状态变化/订阅噪声
- **减少一次 update 的工作量**：减少参与 diff 的节点、减少昂贵计算
- **把工作移出关键路径**：并发/延迟、拆包/按需加载、流式/分段注水

---

## 2. 性能定位：先回答“慢在哪”

推荐按“从体验指标到根因”的漏斗排查：

### 2.1 体验层：Core Web Vitals

- **LCP**：最大内容绘制，通常受 **图片/字体/首屏数据/SSR+Hydration** 影响
- **INP**：交互到下一次绘制的延迟，通常受 **长任务、重渲染、复杂布局** 影响
- **CLS**：布局抖动，通常来自 **未声明尺寸的媒体资源、异步插入内容、字体 FOIT/FOUT**

### 2.2 React 层：render/commit 热点

用 React DevTools Profiler 回答：

- 哪个组件 render 频繁？是 props 引用不稳定还是 state 放错层？
- commit duration 是否集中在某个列表/表格/图表？
- 一次交互是否触发了“意外的大面积更新”（context、全局 store、父组件重渲染）？

### 2.3 浏览器层：Long Task / Layout / Network

用 Chrome Performance/Performance Insights 回答：

- INP 波动是否对应 **长任务（>50ms）**？
- 是否有强制同步布局（Forced reflow）？
- 首屏慢是否是 **TTFB（后端）** 还是 **资源（CDN/图片/字体）**？

---

## 3. React 渲染优化：减少无效工作（wasted renders）

### 3.1 状态放置：让更新发生在“最小边界”

高阶经验：

- **把 state 尽量下沉**（只让用到它的子树更新）
- **把 derived state 上移为“计算”而不是“存储”**（避免双写与同步复杂度）
- **把全局状态做 selector 化**（只订阅必要切片）

典型反模式：

- 在页面根组件存放所有交互 state → 任何小交互都导致整页 render
- context 里放“大对象”且 value 每次 render 都是新引用 → 全量消费者更新

### 3.2 让“相等性”可控：memo/selector 的正确姿势

- `React.memo` 不是性能银弹：它用“浅比较”换“比较成本 + 心智负担”
- 真正稳定的优化来自 **数据结构与引用稳定**：
  - props 传递尽量是 **原始值 / 稳定引用 / 小对象**
  - 复杂对象用 **selector + equalityFn**（如 Zustand/Redux Toolkit 的选择器）

### 3.3 列表与大组件：把复杂度从 O(n) 拉回可控区间

- **虚拟列表**：大列表必须用（窗口化渲染），否则 render/commit 都会爆
- **分段渲染**：分批渲染首屏外内容（结合 `useTransition` / `useDeferredValue`）
- **避免不稳定 key**：key 不稳定会让 diff 退化为“全量替换”

---

## 4. React 交互流畅度：控制 INP（卡顿感的根源）

INP 不是“React 指标”，它是“主线程是否被占满”的结果。

### 4.1 把重活移出交互关键路径

- **拆分事件回调**：把非必须逻辑延后（`setTimeout(0)` / `requestIdleCallback`）
- **Web Worker**：解析大 JSON、加解密、复杂计算移出主线程
- **渐进渲染**：输入过滤/搜索用 `useDeferredValue`，昂贵更新用 `useTransition`

### 4.2 避免同步副作用拖慢 commit

- `useLayoutEffect` 会阻塞浏览器绘制，除非必须测量/同步布局，否则优先 `useEffect`
- 大量 DOM 测量/写入交错会触发 Forced reflow：**读写分离**

---

## 5. Next.js 视角：把性能当作“框架能力”用起来

React 的性能很多时候不是“多写一个 memo”，而是 **资源加载与渲染策略**。

### 5.1 首屏：图片/字体/脚本

- 图片：优先 `next/image`（尺寸、懒加载、格式、CDN）
- 字体：使用 Next 字体方案并避免 CLS（预加载/字体策略）
- 第三方脚本：用 `next/script` 控制加载时机（`afterInteractive` / `lazyOnload`）

### 5.2 拆包：按路由、按组件、按交互加载

- route-level splitting 是默认能力，但“重组件”仍需手动拆：`dynamic(() => import(...))`
- 把“低频交互”模块（编辑器、图表、地图）延后加载，避免拖累 LCP/INP

### 5.3 SSR / Streaming / RSC（概念到落地）

- SSR 解决“首屏内容可见”，但 hydration 可能引入交互卡顿
- Streaming/Selective Hydration 的目标是：**更快可见 + 更早可交互**
- RSC 的价值是把一部分渲染与数据获取从客户端挪到服务端，减少 bundle 与客户端执行

---

## 6. 监控体系：没有 RUM 的优化会回归

### 6.1 指标体系建议（最小可用版）

- **体验指标（Core Web Vitals）**：LCP、INP、CLS（按路由/设备/网络/国家分维度）
- **稳定性指标**：JS error rate、白屏率、接口失败率
- **解释指标**：Long Tasks、资源加载时长、React commit duration（抽样）

### 6.2 数据治理：别把监控做成“另一个性能问题”

- **抽样**：1%～10% 起步，遇到回归再提升采样率
- **上报时机**：优先 `sendBeacon`（不阻塞卸载）
- **批量**：聚合上报，避免每个指标一次网络请求
- **脱敏**：URL query、用户输入、错误栈里的 PII 处理

---

## 7. Next.js 落地示例：采集 Web Vitals + React Profiler

下面给两套示例：**Pages Router**（框架原生 `reportWebVitals`）与 **App Router**（更通用的 RUM 方式）。

### 7.1 Pages Router：`reportWebVitals`（最省事）

在 `pages/_app.tsx`：

```ts
import type { AppProps, NextWebVitalsMetric } from "next/app";

export function reportWebVitals(metric: NextWebVitalsMetric) {
  // metric.name: FCP, LCP, CLS, INP, TTFB...
  // metric.value: number
  // metric.id: unique per page load
  // 生产环境建议：抽样 + sendBeacon
  if (process.env.NODE_ENV !== "production") return;

  const body = JSON.stringify({
    type: "web-vitals",
    metric,
    ts: Date.now(),
  });

  navigator.sendBeacon?.("/api/rum", body);
}

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
```

### 7.2 App Router：用 `web-vitals` 主动采集（通用 RUM）

安装依赖（示意）：

```bash
pnpm add web-vitals
```

在任意只运行在客户端的组件里采集（例如 `app/_components/WebVitals.tsx`）：

```tsx
"use client";

import { useEffect } from "react";
import { onCLS, onINP, onLCP, onFCP, onTTFB, type Metric } from "web-vitals";

function send(metric: Metric) {
  // 生产环境建议：抽样/加上 route/ua/network 等维度
  const payload = JSON.stringify({
    type: "web-vitals",
    metric,
    ts: Date.now(),
  });

  if (navigator.sendBeacon) {
    navigator.sendBeacon("/api/rum", payload);
    return;
  }

  // 兜底：keepalive 避免卸载丢包
  fetch("/api/rum", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch(() => {});
}

export function WebVitals() {
  useEffect(() => {
    onCLS(send);
    onINP(send);
    onLCP(send);
    onFCP(send);
    onTTFB(send);
  }, []);

  return null;
}
```

然后在根布局或全局 provider 引入一次：

```tsx
// app/layout.tsx
import { WebVitals } from "./_components/WebVitals";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <WebVitals />
        {children}
      </body>
    </html>
  );
}
```

服务端接收（示意，App Router 的 route handler）：

```ts
// app/api/rum/route.ts
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  // TODO: 写入日志/消息队列/时序库（并做限流与采样）
  console.log("[rum]", body);
  return new Response(null, { status: 204 });
}
```

### 7.3 React Profiler：把“慢组件”变成可观测数据

React 的 Profiler 可以把 commit 耗时上报到 RUM（建议低采样）。

```tsx
"use client";

import React, { Profiler } from "react";

function onRender(
  id: string,
  phase: "mount" | "update",
  actualDuration: number
) {
  // 生产建议：仅采样 slow commits，避免噪声
  if (actualDuration < 16) return; // 小于一帧不关心

  navigator.sendBeacon?.(
    "/api/rum",
    JSON.stringify({
      type: "react-profiler",
      id,
      phase,
      actualDuration,
      ts: Date.now(),
    })
  );
}

export function AppProfiler({ children }: { children: React.ReactNode }) {
  return (
    <Profiler id="app" onRender={onRender}>
      {children}
    </Profiler>
  );
}
```

把它包在业务根节点即可（同样只引入一次）。

---

## 8. 进阶：Long Task / Event Timing（解释 INP 的关键拼图）

Web Vitals 告诉你“慢”，但不一定告诉你“为什么慢”。为了解释 INP，你通常需要：

- **Long Tasks**：主线程被占满的证据（JS、布局、第三方脚本）
- **Event Timing**：具体哪个交互事件最慢（点击/输入/滚动）

这些可以通过 `PerformanceObserver` 采集（此处不展开完整代码，上线前务必做兼容与采样）。

---

## 9. 实战清单（建议直接贴到 PR 模板里）

- **体验指标**
  - LCP 主要内容是否走 `next/image`？是否避免首屏阻塞脚本？
  - CLS 是否所有媒体资源都声明了尺寸/占位？是否避免“插入式”首屏内容？
  - INP 是否有长任务/重渲染热点？是否把重活移出交互关键路径？
- **渲染成本**
  - state 是否放在最小更新边界？context/store 是否 selector 化？
  - list 是否虚拟化？key 是否稳定？
  - `useMemo/useCallback/memo` 是否用于“稳定引用”和“减少昂贵计算”，而不是装饰？
- **工程化**
  - 是否做了按路由/按交互拆包？重组件是否 `dynamic import`？
  - 第三方脚本是否使用 Next 的加载策略？是否可移除/延后？
- **监控**
  - 是否有 Web Vitals + 错误 + 长任务 的最小 RUM？
  - 是否有抽样/批量/脱敏/限流？是否能按路由维度回溯回归？

---

## 参考与延伸

- Web Vitals / Core Web Vitals 官方定义与实践指南
- React DevTools Profiler、Chrome Performance/Performance Insights
- Next.js 文档：Images、Scripts、Dynamic Import、Routing、Performance

