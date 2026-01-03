#  Next.js 导航的核心原理与机制

本文将围绕以下四大核心概念展开：**服务端渲染**、**预获取（Prefetching）**、**流式渲染（Streaming）**、**客户端转场（Client-side transitions）**，并探讨如何在动态路由和网络较慢的情况下提升导航体验([Next.js](https://nextjs.org/docs/app/getting-started/linking-and-navigating?utm_source=chatgpt.com))

------

## 1. 服务端渲染（Server Rendering）

- 默认情形下，Next.js 在服务端渲染页面，生成 Server Component 的Payload，在客户端才展示。
- 两种渲染模式：
  - **静态渲染（Static Rendering / Prerender）**：在构建时生成 HTML 或在缓存失效时重新渲染。
  - **动态渲染（Dynamic Rendering）**：每次请求时在服务端生成，适合内容频繁变化的页面。
    - 缺点是客户端需等待服务端响应才能渲染新页面，从而影响用户体验。 

------

## 2. 预获取（Prefetching）

### 定义

在用户点击之前，Next.js 会自动预加载那些通过 `<Link>` 组件链接的路由，只要它们进入了视口或被 hover。

但这里的“预加载”不是传统的整页 HTML，而是 **针对 App Router 的拆分资源**：

- **JS bundle**（页面组件代码块）
- **RSC Payload**（React Server Component 渲染所需的数据）
- **共享 Layout**（避免重复加载）

### 原理

#### `<Link>` 的作用

Next.js 的 `<Link>` 组件内部有一个逻辑：

- 当 `<Link>` 出现在视口（或者被鼠标 hover）时，Next.js 会自动调用 `router.prefetch()`。
- 这个方法会触发 **fetch 请求**，去拿目标路由的 **RSC Payload + JS 代码**。

👉 举例：

```
import Link from 'next/link'

export default function Home() {
  return (
    <nav>
      <Link href="/about">About</Link>
    </nav>
  )
}
```

当 `About` 链接进入视口时，Next.js 在后台发起请求，缓存 `/about` 页面的必要资源。

#### 浏览器层面的实现

- Next.js 并不是靠 `<link rel="prefetch">` 标签，而是通过 **内置的路由系统**调用 `fetch()` 请求 RSC payload，再动态加载相应的 JS chunk。
- 在客户端，Next.js Router 有一个 **缓存（Router Cache）**，会把预取的数据和模块存起来。

所以当你点击 `<Link>` 时：

1. 不再发起新的 HTTP 请求（除非缓存过期）。
2. 直接从 Router Cache 里读取页面内容。
3. React 执行 “软导航”（soft navigation），替换页面区域，而不是整页刷新。

#### Prefetch 的策略

- **静态路径**：Next.js 会完整预取页面内容。
- **动态路径**：若定义了 `loading.tsx`，只会预取共享布局和 loading 状态；若没有，默认跳过，避免无谓服务端资源消耗。 

------

## 3. 流式渲染（Streaming）

- 针对动态路由，Next.js 支持流式渲染，把页面拆分若干部分，先发送用户能看到的部分（如 shared layout 或 loading skeleton），剩余内容继续加载。
- 使用方法：在动态路由文件夹下创建 `loading.tsx`，Next.js 会自动将 `page.tsx` 包装在 React 的 `Suspense` 组件中，实现分段加载。([Next.js](https://nextjs.org/docs/app/getting-started/linking-and-navigating?utm_source=chatgpt.com))
- 优点包括：快速展示 UI、保持布局交互性、提升核心网页指标（TTFB、FCP、TTI）([Next.js](https://nextjs.org/docs/app/getting-started/linking-and-navigating?utm_source=chatgpt.com))

------

## 4. 客户端转场（Client-side Transitions）

- 使用 `<Link>` 组件触发客户端 SPA 式导航，无需整页刷新。
- 页面仅替换内容部分（RSC payload），共享布局仍然保持，从而让服务器渲染的应用也拥有类似客户端渲染的流畅体验。([Next.js](https://nextjs.org/docs/app/getting-started/linking-and-navigating?utm_source=chatgpt.com))

------

## 性能卡顿的原因与优化建议

即便采用了上述优化，某些场景下页面导航仍可能感觉缓慢，这里总结常见问题和解决思路：

| 情况                                      | 描述                                      | 优化方式                                    |
| ----------------------------------------- | ----------------------------------------- | ------------------------------------------- |
| **动态路由未使用 `loading.tsx`**          | 用户需等待服务端完成渲染后才看到内容      | 添加 `loading.tsx` 实现快速 loading UI      |
| **动态路由未使用 `generateStaticParams`** | 本可静态生成的页面变为动态渲染，影响速度  | 使用 `generateStaticParams` 生成静态路由    |
| **网络慢**                                | Prefetch 不会及时完成，点击时加载延迟明显 | 使用 `useLinkStatus` 显式反馈 loading 状态  |
| **Hydration 过程未完成**                  | 页面结构已加载，但 React 尚未接管交互逻辑 | 确保 hydration 不被阻塞或报错，性能平稳完成 |

([Next.js](https://nextjs.org/docs/app/getting-started/linking-and-navigating?utm_source=chatgpt.com))

------

## 拓展：App Router 中的导航方式及底层机制

在较新版的 App Router（例如 Next.js v14）中，导航方式更丰富：

### 导航方式一览

- **`<Link>` 组件**：带预取、渲染优化，推荐使用。([Next.js](https://nextjs.org/docs/14/app/building-your-application/routing/linking-and-navigating?utm_source=chatgpt.com))
- **`useRouter()` 钩子**（客户端组件）：用于编程式导航，例如按钮点击触发跳转。([Next.js](https://nextjs.org/docs/14/app/building-your-application/routing/linking-and-navigating?utm_source=chatgpt.com))
- **`redirect` 函数**（服务器组件）：用于服务端重定向，常用于鉴权后跳转。([Next.js](https://nextjs.org/docs/14/app/building-your-application/routing/linking-and-navigating?utm_source=chatgpt.com))
- **原生 History API**：`pushState` / `replaceState`，与 Next.js Router 集成，可自定义历史操作。([Next.js](https://nextjs.org/docs/14/app/building-your-application/routing/linking-and-navigating?utm_source=chatgpt.com))

### 导航底层原理（App Router）

- **代码拆分**：路径各段自动拆分，可逐段加载。
- **预取**：`<Link>` 可自动在视口中或显现时预取，也可手动 `router.prefetch()`。([Next.js](https://nextjs.org/docs/13/app/building-your-application/routing/linking-and-navigating?utm_source=chatgpt.com))
- **缓存**：客户端维护 Router Cache，存储已访问或预取的页面片段，重复访问时无需重新请求。([Next.js](https://nextjs.org/docs/13/app/building-your-application/routing/linking-and-navigating?utm_source=chatgpt.com))
- **软导航（Soft Navigation）**：不是完整页面刷新，而是只更新变动部分，保留组件状态和滚动位置。([Next.js](https://nextjs.org/docs/13/app/building-your-application/routing/linking-and-navigating?utm_source=chatgpt.com))

------

## 总结与建议

Next.js 的导航系统致力于在服务端渲染和客户端体验间取得平衡，通过预取、流式更新、软导航等技术构建流畅、快速的页面跳转：

- 使用 `<Link>` 并结合 `loading.tsx` 优化动态路由的用户反馈速度；
- 对于动态页面，建议结合 `generateStaticParams` 实现静态生成；
- 网络环境较差时，可使用 `useLinkStatus` 提示 loading；
- 在 App Router 中，优先使用 `<Link>` 和 `useRouter()`，必要时用 `redirect` 和原生 History API。

------

#### 扩展话题

- 如何结合国际化 i18n 路由
- 路由守卫
- loading skeleton 设计
- 路由缓存控制策略 