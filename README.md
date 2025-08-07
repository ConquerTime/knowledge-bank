# 📚 开发者知识库

> 系统化学习·深度理解·面试必备

一个基于 Docusaurus 构建的个人开发者知识库，涵盖计算机科学基础、现代技术栈、项目经验和面试准备。

## 🌟 特性

- 📖 **体系化内容**: 从基础理论到实战应用的完整学习路径
- 🎯 **面试导向**: 针对技术面试的专项准备内容
- 🔍 **本地搜索**: 支持中文全文搜索，离线可用
- 📱 **响应式设计**: 完美适配桌面端和移动端
- 🎨 **自定义组件**: 项目经验卡片、面试题组件等
- ⚡ **快速部署**: 基于 GitHub Pages 的自动化部署

## 📋 内容大纲

### 💻 计算机科学基础
- 数据结构与算法
- 操作系统
- 计算机网络
- 数据库系统
- 计算机组成原理

### 🎨 前端技术栈
- Vue 生态系统
- React 生态系统
- TypeScript
- 构建工具

### ⚙️ 后端技术栈
- Node.js 开发
- 数据库技术
- API 设计
- 部署运维

### 🤖 AI 应用开发
- LangChain 应用
- RAG 系统
- 提示工程

### 💼 项目经验库
- Web 项目实战
- 问题与解决方案
- 项目模板

### 📝 面试准备
- 技术面试题
- 行为面试
- 系统设计

## 🚀 快速开始

### 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm start

# 构建项目
npm run build

# 本地预览构建结果
npm run serve
```

### 部署到 GitHub Pages

项目配置了 GitHub Actions 自动部署，推送到 `main` 分支后会自动部署到 GitHub Pages。

## 🛠️ 技术栈

- **框架**: [Docusaurus 3](https://docusaurus.io/) - 现代化静态站点生成器
- **搜索**: [docusaurus-plugin-search-local](https://github.com/gabrielcsapo/docusaurus-plugin-search-local) - 本地搜索插件
- **样式**: CSS Modules + Infima - 响应式设计系统
- **部署**: GitHub Actions + GitHub Pages - 自动化部署
- **语言**: TypeScript + React - 类型安全的组件开发

## 📂 项目结构

```
developer-knowledge-base/
├── docs/                      # 文档内容
│   ├── computer-science/      # 计算机科学基础
│   ├── frontend/              # 前端技术栈
│   ├── backend/               # 后端技术栈
│   ├── ai/                    # AI应用开发
│   ├── projects/              # 项目经验
│   └── interview/             # 面试准备
├── src/
│   ├── components/            # 自定义React组件
│   │   ├── ProjectCard/       # 项目经验卡片
│   │   └── InterviewQuestion/ # 面试题组件
│   ├── css/                   # 全局样式
│   └── pages/                 # 自定义页面
├── static/                    # 静态资源
├── docusaurus.config.ts       # Docusaurus配置
├── sidebars.ts                # 侧边栏配置
└── .github/workflows/         # GitHub Actions工作流
```

## 🎯 使用指南

### 添加新文档

1. 在相应的分类目录下创建 Markdown 文件
2. 添加正确的 front matter
3. 在 `sidebars.ts` 中配置导航

### 使用自定义组件

#### 项目经验卡片

```jsx
import ProjectCard from '@site/src/components/ProjectCard';

<ProjectCard
  title="项目名称"
  techStack={['React', 'Node.js', 'MongoDB']}
  problem="遇到的问题描述"
  solution="解决方案描述"
  learnings="收获和总结"
  duration="3个月"
  teamSize={4}
  status="completed"
/>
```

#### 面试题组件

```jsx
import InterviewQuestion from '@site/src/components/InterviewQuestion';

<InterviewQuestion
  question="什么是闭包？"
  difficulty="medium"
  category="JavaScript"
  answer="闭包是函数和其周围状态的组合..."
  tags={['JavaScript', '闭包', '作用域']}
  company="某互联网公司"
  followUp={['闭包的应用场景', '内存泄漏问题']}
/>
```

## 🤝 贡献指南

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

## 📄 许可证

本项目采用 [MIT 许可证](LICENSE)。

## 🙋‍♂️ 联系方式

如果你有任何问题或建议，欢迎通过以下方式联系：

- GitHub Issues: [提交问题](../../issues)
- 项目主页: [开发者知识库](https://zhouyangdong.github.io/AI_Web_Interview_Prep/)

---

⭐ **觉得有用的话，请给个 Star 支持一下！**
