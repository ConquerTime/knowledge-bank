# Feature-Sliced Design：React 大型应用分层架构（Next.js + Vite SPA）

> 当 React 项目从“一个仓库”成长为“多个团队共同维护的产品”，真正的复杂度来自依赖方向、边界治理与交付节奏，而不是某个 state 管理库。本文用 Feature-Sliced Design（FSD）作为组织模型，给出 Next.js App Router 与 Vite SPA 两套目录结构、规则约束与迁移路线。

## 目录

1. [引言](#一引言)
2. [问题背景：大型 React 应用的结构性痛点](#二问题背景大型-react-应用的结构性痛点)
3. [设计目标（Design Goals）](#三设计目标design-goals)
4. [方案空间（Options）](#四方案空间options)
5. [对比表（Trade-off Matrix）](#五对比表trade-off-matrix)
6. [决策树：什么时候选择 FSD（以及什么时候别选）](#六决策树什么时候选择-fsd以及什么时候别选)
7. [落地架构：Next.js App Router（RSC/Client Boundary）](#七落地架构nextjs-app-routerrscclient-boundary)
8. [落地架构：Vite SPA（CSR）](#八落地架构vite-spa-csr)
9. [团队规范模板：边界规则/Lint/PR Checklist/ADR](#九团队规范模板边界规则lintpr-checklistadr)
10. [迁移策略：从“按技术分层”到“按业务能力分层”](#十迁移策略从按技术分层到按业务能力分层)
11. [常见坑与反模式（Edge cases）](#十一常见坑与反模式edge-cases)
12. [参考资料](#十二参考资料)

---

## 一、引言

“目录结构”看似琐碎，但它是团队协作的语言：你把什么放在一起、什么不能依赖什么，会直接决定代码库能否长期演进。

Feature-Sliced Design（FSD）不是某个框架插件，而是一套回答以下问题的组织模型：

- **一个需求应该落在哪一层？**
- **哪些层可以依赖哪些层？**
- **复用应该发生在什么粒度？**
- **边界如何被工具强制，而不是靠约定？**

本文会把 FSD 放到真实约束里讨论：**Next.js App Router（含 RSC/Client 边界）** 与 **Vite SPA（CSR）**。

---

## 二、问题背景：大型 React 应用的结构性痛点

### 2.1 典型症状（可量化）

在 6–18 个月的演进周期后，大型 React 代码库常见问题：

- **跨目录依赖失控**：任何地方都能 import 任何东西，导致修改 ripple effect。
- **“共享”不断膨胀**：`utils/`、`common/`、`components/` 变成垃圾场。
- **页面/业务耦合**：一个 feature 的 UI 逻辑散落在 pages、components、hooks、store 多处。
- **复用带来倒置**：为了复用把业务逻辑抽到 shared，反而污染基础层。
- **交付变慢**：新增一个小需求需要改动 10+ 文件、跨 3–4 个目录。

### 2.2 根因：缺少“依赖方向”与“模块边界”的系统约束

React 本身并不提供模块化治理机制；如果你只用“文件夹”表达架构，而没有配套：
- 依赖方向
- 边界规则（lint / build-time）
- 迁移策略与评审 checklist

那么结构会快速退化。

---

## 三、设计目标（Design Goals）

对大型应用，建议把目标写成“组织可执行”的指标：

1. **依赖方向清晰**：业务能力不能反向依赖基础层；跨 feature 的直接依赖受限。
2. **高内聚、低耦合**：功能相关代码聚合（UI + model + api），跨功能复用有明确出口。
3. **可扩展交付**：多人并行开发时冲突最小；能按 feature 进行 ownership。
4. **可测试与可替换**：domain 逻辑可独立测试；UI 可替换实现。
5. **适配运行时**：
   - Next.js：路由/segment 天然约束与 RSC 边界共存。
   - Vite SPA：路由级拆包、懒加载与 feature 边界对齐。
6. **治理工具化**：边界规则可被 lint/CI 强制执行。

---

## 四、方案空间（Options）

大型前端工程常见组织模型：

### 4.1 按技术分层（layer by type）

```
src/
  components/
  hooks/
  services/
  store/
  pages/
```

优点：起步快、容易理解。  
缺点：规模变大后“一个需求改很多层”，跨目录耦合强，ownership 难。

### 4.2 按路由/页面聚合（page-centric）

```
src/pages/users/
  components/
  hooks/
  api.ts
```

优点：需求聚合度高，适合 SPA。  
缺点：跨页面复用容易变成复制粘贴或把东西丢到全局 shared。

### 4.3 Domain-driven / Feature-centric（FSD 属于这类）

FSD 通过“层（layer）+ 切片（slice）+ segment”的结构表达“复用边界”和“依赖方向”。

典型层级（从高到低）：

- `app`：应用级组装（providers、router、global styles）
- `processes`：跨页面的业务流程（可选，很多团队不需要）
- `pages`：路由页面（组合 widgets/features）
- `widgets`：页面级大块 UI（header/sidebar/filter-panel）
- `features`：用户行为/用例（create-order、toggle-like）
- `entities`：领域实体（user、order），包含实体相关 UI/model/api
- `shared`：通用能力（ui kit、lib、config、api client）

---

## 五、对比表（Trade-off Matrix）

| 方案 | 初期成本 | 演进成本 | 复用策略 | 依赖治理 | 组织适配 | 适合场景 |
|------|----------|----------|----------|----------|----------|----------|
| 按技术分层 | 低 | 高 | 共享目录膨胀 | 弱 | 小团队/单人 | MVP、短周期项目 |
| Page-centric | 中 | 中-高 | 复用易复制/抽 shared | 中 | SPA 团队 | 以页面为核心的产品 |
| FSD（Feature-centric） | 中-高 | 低-中 | 先内聚后抽象 | 强（可工具化） | 多团队/长期 | 中大型、长期演进应用 |

结论：FSD 不是“更好看”，而是“更可治理”。它把组织成本提前换取长期可演进性。

---

## 六、决策树：什么时候选择 FSD（以及什么时候别选）

### 6.1 什么时候选 FSD

满足以下任意 2–3 条，建议进入 FSD：

- 有 **2+ 团队**或 5+ 工程师长期协作
- 需求并行开发频繁、冲突多
- 已出现 `shared/common/utils` 膨胀
- 需要按业务能力划分 ownership（谁负责 user、谁负责 order）
- 需要路由级拆包与业务边界对齐

### 6.2 什么时候别选（或延后）

- 纯原型/短周期（< 2–3 个月）项目：组织成本不划算
- 团队缺乏治理投入：没有 lint/CI/评审机制时，结构很快退化
- 业务域高度不稳定：切片频繁变动会导致“目录震荡”，先用 page-centric 更稳

---

## 七、落地架构：Next.js App Router（RSC/Client Boundary）

Next.js 的强约束是：`app/` 目录决定路由与 segment，且 Server/Client Components 混合存在。FSD 的落地需要 **“路由归 Next，业务归 FSD”** 的折中。

### 7.1 推荐结构：app/ 负责路由，src/ 负责 FSD

```
app/
  layout.tsx
  (public)/
    login/
      page.tsx
  (dashboard)/
    users/
      page.tsx
    orders/
      [id]/
        page.tsx
src/
  app/                    # FSD app 层（providers、config）
  pages/                  # 与路由页面对应的组合层（可选：薄层）
  widgets/
  features/
  entities/
  shared/
```

解释：
- `app/**/page.tsx` 作为 Next 的 route entry（尽量薄）：负责 **RSC fetch、权限、metadata、layout 组合**。
- 真正的业务组合落在 `src/pages`（可选）或直接在 `widgets/features` 里完成。

### 7.2 RSC/Client 边界与 FSD 的结合方式

建议把规则写清楚：

- `app/**/page.tsx`：默认 Server Component（可 async fetch）
- `src/features/**/ui`：大概率是 Client（交互）
- `src/entities/**/api`：可在 Server 或 Client 使用，但要避免把 server-only 代码（如 db）放进会被打到 client bundle 的路径

一个可操作的做法：把 server-only 能力放进 `src/shared/server/*`，并禁止 client-side import。

```
src/shared/
  api/
    http-client.ts        # isomorphic（fetch）
  server/
    db.ts                 # server-only
```

### 7.3 Next.js 目录示例：users 页面

```
app/(dashboard)/users/page.tsx          # route entry（Server）
src/pages/users/page.tsx               # page composition（Server/Client 均可）
src/widgets/users-table/               # widget
src/features/user-filter/              # feature（筛选行为）
src/entities/user/                     # entity（user 相关）
src/shared/ui/                         # shared UI
```

`app/(dashboard)/users/page.tsx`（Server）：

```tsx
import { UsersPage } from '@/src/pages/users/page';

export default async function Page() {
  const initialUsers = await fetchUsersOnServer();
  return <UsersPage initialUsers={initialUsers} />;
}
```

`src/pages/users/page.tsx`（通常是 Client 或混合）：

```tsx
import { UsersTableWidget } from '@/src/widgets/users-table';
import { UserFilterFeature } from '@/src/features/user-filter';

export function UsersPage({ initialUsers }: { initialUsers: unknown[] }) {
  return (
    <>
      <UserFilterFeature />
      <UsersTableWidget initialUsers={initialUsers} />
    </>
  );
}
```

---

## 八、落地架构：Vite SPA（CSR） {#八落地架构vite-spa-csr}

Vite SPA 没有 `app/` 路由约束，FSD 可以更“纯粹”。

### 8.1 推荐结构（常见）

```
src/
  app/
    providers/
    router/
    styles/
  pages/
    users/
    orders/
  widgets/
  features/
  entities/
  shared/
```

原则：
- `app` 只做“组装”：Router、Providers、全局初始化
- `pages` 只做“组合”：把 widgets/features 组起来，避免把逻辑塞进 page
- 复用优先在 `features/entities/shared` 内部发生，不要急着抽到 shared

### 8.2 路由级拆包与 FSD 对齐

建议做到：
- route -> page -> widgets/features/entities
- `pages/*` 作为 code-splitting 边界（`React.lazy` / router lazy）

伪代码示例：

```tsx
const UsersPage = lazy(() => import('@/pages/users'));

createBrowserRouter([
  { path: '/users', element: <UsersPage /> },
]);
```

---

## 九、团队规范模板：边界规则/Lint/PR Checklist/ADR

### 9.1 依赖方向规则（核心）

推荐依赖方向（高层依赖低层）：

```
app
  -> pages
    -> widgets
      -> features
        -> entities
          -> shared
```

同时约束：
- `features` 之间默认 **不互相依赖**（除非通过 shared/entities 暴露的公共契约）
- `entities` 之间也尽量不互相依赖（需要时通过 `shared` 的契约或 API 层隔离）

### 9.2 ESLint 边界约束（思路）

可以用 `import/no-restricted-paths` 或 `eslint-plugin-boundaries` 来落地（不同团队选择不同工具）。伪配置示意：

```js
// 关键思想：限制特定目录之间的 import
rules: {
  'import/no-restricted-paths': ['error', {
    zones: [
      { target: './src/shared', from: './src/features' }, // shared 不能依赖 features
      { target: './src/entities', from: './src/features' }, // entities 不能依赖 features
      { target: './src/features', from: './src/pages' }, // pages 可依赖 features（允许）
      // ...按团队依赖方向补齐
    ],
  }],
}
```

### 9.3 PR Checklist（结构类）

```markdown
## Architecture Checklist (FSD)

- [ ] 代码落层是否正确？（feature/entity/widget/page）
- [ ] 是否引入跨切片依赖？能否通过 entities/shared 的公共契约替代？
- [ ] 是否把业务逻辑放进 shared？是否应该保留在 feature 内聚？
- [ ] Next.js 场景：是否引入了 server-only 代码到 client bundle？
- [ ] 是否为新能力补了“public API”（index.ts 导出）？
```

### 9.4 Slice 的 public API 约定

每个 slice 建议只暴露一个“出口”：

```
src/features/user-filter/
  index.ts            # public exports
  ui/
  model/
  api/
```

`index.ts`：

```ts
export { UserFilterFeature } from './ui/UserFilterFeature';
```

这样可以减少“深层路径 import”，并降低重构成本。

---

## 十、迁移策略：从“按技术分层”到“按业务能力分层”

### 10.1 迁移分阶段（推荐）

1. **冻结 shared 膨胀**：禁止新内容随意进入 `common/utils/components`
2. **从一个业务域开始**：例如 `users`，建立 `entities/user` 与 `features/user-*`
3. **建立 lint 规则（先 warn 后 error）**：先可见，再强制
4. **逐步收敛页面**：把页面内散落逻辑迁入 feature/entity
5. **最后重命名与清理**：稳定后再做目录整理，避免“边迁移边改名”

### 10.2 迁移时的“抽象时机”原则

- **先内聚后抽象**：同一能力至少在 2–3 个地方复用稳定后再抽 shared
- **抽象要有契约**：抽到 shared 的不是“实现”，而是“可复用的契约”（API + tests）

---

## 十一、常见坑与反模式（Edge cases）

### 11.1 shared 变成垃圾场（最常见）

反模式：只要“看起来通用”就丢进 shared。  
后果：shared 依赖业务、跨切片耦合、难以治理。

建议：
- shared 只放真正跨域通用（UI primitives、lib、config、api client）
- 复用优先在 entities/features 内部发生

### 11.2 Next.js 中 server-only 泄漏到 client

反模式：把 `db`/`fs`/`process.env` 等 server-only 逻辑放在 `src/shared`，然后被 client component import。

建议：
- 明确 `shared/server` 与 `shared/client`
- 用 lint 或构建检测禁止 client import server-only

### 11.3 过度切片导致“目录噪音”

反模式：每个小功能都建一个 feature，导致目录数量爆炸，反而难找。

建议：
- 以“用户行为/用例”为 feature 粒度（例如 `add-to-cart`），而不是以 UI 控件为粒度
- 小型能力可以先在 page/widget 内聚，稳定再拆

### 11.4 “跨 feature 调用”导致隐式耦合

如果 feature A 直接 import feature B 的内部文件，你会得到：
- 难以测试与替换
- 难以做 ownership

建议：跨 feature 只通过 entities/shared 暴露的公共契约交互。

---

## 十二、参考资料

1. [Feature-Sliced Design（官方）](https://feature-sliced.design/)
2. [Next.js App Router 文档](https://nextjs.org/docs/app)
3. [React - Scaling Up with Reducer and Context](https://react.dev/learn/scaling-up-with-reducer-and-context)
4. [Google - Software Engineering at Google（关于模块化与可维护性）](https://abseil.io/resources/swe-book)

