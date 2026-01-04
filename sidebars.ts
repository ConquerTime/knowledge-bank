import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

/**
 * Creating a sidebar enables you to:
 - create an ordered group of docs
 - render a sidebar for each doc of that group
 - provide next/previous navigation

 The sidebars can be generated from the filesystem, or explicitly defined here.

 Create as many sidebars as you want.
 */
const sidebars: SidebarsConfig = {
  // 主要知识库侧边栏
  tutorialSidebar: [
    'index', // 首页
    {
      type: 'category',
      label: '💻 计算机科学基础',
      items: [
        'computer-science/index',
        {
          type: 'category',
          label: '数据结构与算法',
          items: [
            'computer-science/data-structures/index',
          ],
        },
        {
          type: 'category',
          label: '操作系统',
          items: [
            'computer-science/operating-system/index',
          ],
        },
        {
          type: 'category',
          label: '计算机网络',
          items: [
            'computer-science/computer-network/index',
          ],
        },
        {
          type: 'category',
          label: '数据库系统',
          items: [
            'computer-science/database/index',
          ],
        },
        {
          type: 'category',
          label: '计算机组成原理',
          items: [
            'computer-science/computer-architecture/index',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: '🎨 前端技术栈',
      items: [
        'frontend/index',
        {
          type: 'category',
          label: 'Vue生态系统',
          items: [
            'frontend/vue/index',
          ],
        },
        {
          type: 'category',
          label: 'React生态系统',
          items: [
            'frontend/react/index',
          ],
        },
        {
          type: 'category',
          label: 'TypeScript',
          items: [
            'frontend/typescript/index',
          ],
        },
        {
          type: 'category',
          label: '构建工具',
          items: [
            'frontend/build-tools/index',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: '⚙️ 后端技术栈',
      items: [
        'backend/index',
        {
          type: 'category',
          label: 'Node.js开发',
          items: [
            'backend/nodejs/index',
          ],
        },
        {
          type: 'category',
          label: '数据库技术',
          items: [
            'backend/database/index',
          ],
        },
        {
          type: 'category',
          label: 'API设计',
          items: [
            'backend/api/index',
          ],
        },
        {
          type: 'category',
          label: '部署运维',
          items: [
            'backend/deployment/index',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: '🤖 AI应用开发',
      items: [
        'ai/index',
        {
          type: 'category',
          label: 'LangChain应用',
          items: [
            'ai/langchain/index',
          ],
        },
        {
          type: 'category',
          label: 'RAG系统',
          items: [
            'ai/rag/index',
          ],
        },
        {
          type: 'category',
          label: '提示工程',
          items: [
            'ai/prompt-engineering/index',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: '💼 项目经验库',
      items: [
        'projects/index',
        {
          type: 'category',
          label: 'Web项目实战',
          items: [
            'projects/web-projects/index',
          ],
        },
        {
          type: 'category',
          label: '问题与解决方案',
          items: [
            'projects/problems-solutions/index',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: '💰 商业与创业',
      items: [
        'business/index',
        {
          type: 'category',
          label: 'AI创业方向',
          items: [
            'business/ai-entrepreneurship/index',
            'business/ai-entrepreneurship/ai-entrepreneurship-landscape',
            'business/ai-entrepreneurship/ai-tools-layer-analysis',
            'business/ai-entrepreneurship/ai-application-layer/ai-application-layer-analysis',
          ],
        },
        {
          type: 'category',
          label: '商业模式',
          items: [
            'business/business-models/index',
          ],
        },
        {
          type: 'category',
          label: '市场分析',
          items: [
            'business/market-analysis/index',
          ],
        },
        {
          type: 'category',
          label: '创业指南',
          items: [
            'business/startup-guides/index',
          ],
        },
        {
          type: 'category',
          label: '案例研究',
          items: [
            'business/case-studies/index',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: '📝 面试准备',
      items: [
        'interview/index',
        {
          type: 'category',
          label: '技术面试题',
          items: [
            'interview/technical/index',
          ],
        },
        {
          type: 'category',
          label: '行为面试',
          items: [
            'interview/behavioral/index',
          ],
        },
        {
          type: 'category',
          label: '系统设计',
          items: [
            'interview/system-design/index',
          ],
        },
      ],
    },
  ],
};

export default sidebars;
