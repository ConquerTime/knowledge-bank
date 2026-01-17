# n8n 工作流引擎与 Node.js 服务集成架构设计

## 一、引言

### 1.1 什么是 n8n

[n8n](https://n8n.io/) 是一个开源的工作流自动化平台，它允许用户通过可视化界面设计和执行复杂的自动化工作流。n8n 的核心特点包括：

- **可视化设计**：通过拖拽节点构建工作流，无需编写代码
- **丰富的集成**：支持 400+ 预置集成（Slack、GitHub、数据库、AI 等）
- **自托管能力**：可以完全部署在自己的服务器上，保证数据安全
- **可扩展性**：支持自定义节点和 Webhook 触发

### 1.2 为什么选择 n8n + Node.js 架构

在企业级应用中，将 n8n 作为工作流引擎与 Node.js 后端服务集成，可以获得以下优势：

| 特性 | 传统硬编码工作流 | n8n + Node.js 架构 |
|------|----------------|-------------------|
| 开发效率 | 需要大量编码 | 可视化配置，快速迭代 |
| 维护成本 | 修改需要重新部署 | 热更新，无需重启服务 |
| 扩展性 | 新集成需要开发 | 使用现有节点或自定义 |
| 监控调试 | 需要额外日志系统 | 内置执行历史和调试工具 |
| 非技术人员参与 | 困难 | 可视化界面易于理解 |

### 1.3 典型应用场景

```
┌─────────────────────────────────────────────────────────────────┐
│                        典型应用场景                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  📧 邮件自动化     → 用户注册后发送欢迎邮件、验证码               │
│                                                                 │
│  🔔 通知系统       → 多渠道通知（Slack、邮件、短信、Webhook）      │
│                                                                 │
│  📊 数据同步       → CRM 与 ERP 数据双向同步                      │
│                                                                 │
│  🤖 AI 流程        → 调用 OpenAI/Claude 进行内容生成或分析        │
│                                                                 │
│  📝 审批流程       → 请假、报销等多级审批自动流转                  │
│                                                                 │
│  🔄 定时任务       → 报表生成、数据清理、健康检查                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 二、系统架构设计

### 2.1 整体架构图

```
                                    ┌──────────────────────────────────────┐
                                    │           n8n 工作流引擎              │
                                    │  ┌─────────────────────────────────┐ │
                                    │  │     Workflow Editor (可视化)     │ │
                                    │  └─────────────────────────────────┘ │
                                    │  ┌─────────────────────────────────┐ │
                                    │  │     Execution Engine (执行器)    │ │
                                    │  └─────────────────────────────────┘ │
                                    │  ┌─────────────────────────────────┐ │
                    Webhook         │  │     Webhook Server (5678端口)    │ │
                 ┌─────────────────►│  └─────────────────────────────────┘ │
                 │                  │  ┌─────────────────────────────────┐ │
                 │                  │  │     REST API (/api/v1/*)        │ │
                 │                  │  └─────────────────────────────────┘ │
                 │                  └──────────────────────────────────────┘
                 │                                     │
                 │                                     │ 执行结果/回调
                 │                                     ▼
┌────────────────┴─────────────────────────────────────────────────────────┐
│                          Node.js 后端服务                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │
│  │   API Gateway   │  │  Business Logic │  │   n8n Client    │          │
│  │   (路由层)       │  │  (业务逻辑层)    │  │  (工作流客户端)  │          │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘          │
│           │                    │                    │                    │
│           ▼                    ▼                    ▼                    │
│  ┌─────────────────────────────────────────────────────────────┐        │
│  │                    统一数据层 (Database/Cache)               │        │
│  └─────────────────────────────────────────────────────────────┘        │
└──────────────────────────────────────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                              客户端                                       │
│        Web App        │      Mobile App       │      Third-party         │
└──────────────────────────────────────────────────────────────────────────┘
```

### 2.2 核心组件说明

#### 2.2.1 n8n 工作流引擎

n8n 作为独立服务部署，提供以下能力：

| 组件 | 端口 | 功能 |
|------|------|------|
| Webhook Server | 5678 | 接收外部触发请求 |
| REST API | 5678 | 工作流管理 CRUD |
| Execution Engine | - | 工作流执行器 |
| Editor UI | 5678 | 可视化编辑界面 |

#### 2.2.2 Node.js 后端服务

负责核心业务逻辑，通过以下方式与 n8n 交互：

1. **Webhook 触发**：调用 n8n Webhook URL 启动工作流
2. **REST API**：通过 n8n API 管理和执行工作流
3. **回调接收**：接收 n8n 工作流执行完成的回调

### 2.3 通信协议设计

```typescript
// Node.js 服务 → n8n 的请求格式
interface WorkflowTriggerRequest {
  // Webhook 触发
  webhookPath: string;          // 如 /webhook/send-email
  method: 'GET' | 'POST';
  payload: Record<string, any>; // 传递给工作流的数据
  headers?: Record<string, string>;
}

// n8n → Node.js 服务的回调格式
interface WorkflowCallback {
  workflowId: string;
  executionId: string;
  status: 'success' | 'error';
  data: Record<string, any>;
  error?: {
    message: string;
    stack?: string;
  };
  executionTime: number;        // 执行耗时(ms)
  timestamp: string;            // ISO 8601 格式
}
```

---

## 三、n8n 部署方案

### 3.1 Docker Compose 部署（推荐）

```yaml
# docker-compose.yml
version: '3.8'

services:
  n8n:
    image: docker.n8n.io/n8nio/n8n:latest
    container_name: n8n
    restart: always
    ports:
      - "5678:5678"
    environment:
      # 基础配置
      - N8N_HOST=${N8N_HOST:-localhost}
      - N8N_PORT=5678
      - N8N_PROTOCOL=${N8N_PROTOCOL:-http}
      - WEBHOOK_URL=${WEBHOOK_URL:-http://localhost:5678}
      
      # 安全配置
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=${N8N_USER:-admin}
      - N8N_BASIC_AUTH_PASSWORD=${N8N_PASSWORD:-your-secure-password}
      
      # 数据库配置（生产环境推荐使用 PostgreSQL）
      - DB_TYPE=postgresdb
      - DB_POSTGRESDB_HOST=postgres
      - DB_POSTGRESDB_PORT=5432
      - DB_POSTGRESDB_DATABASE=${POSTGRES_DB:-n8n}
      - DB_POSTGRESDB_USER=${POSTGRES_USER:-n8n}
      - DB_POSTGRESDB_PASSWORD=${POSTGRES_PASSWORD:-n8n_password}
      
      # 执行配置
      - EXECUTIONS_DATA_SAVE_ON_ERROR=all
      - EXECUTIONS_DATA_SAVE_ON_SUCCESS=all
      - EXECUTIONS_DATA_SAVE_ON_PROGRESS=true
      - EXECUTIONS_DATA_SAVE_MANUAL_EXECUTIONS=true
      
      # API 配置
      - N8N_PUBLIC_API_DISABLED=false
      
      # 时区
      - GENERIC_TIMEZONE=Asia/Shanghai
      - TZ=Asia/Shanghai
    volumes:
      - n8n_data:/home/node/.n8n
    depends_on:
      - postgres
    networks:
      - n8n-network

  postgres:
    image: postgres:15-alpine
    container_name: n8n-postgres
    restart: always
    environment:
      - POSTGRES_USER=${POSTGRES_USER:-n8n}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-n8n_password}
      - POSTGRES_DB=${POSTGRES_DB:-n8n}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - n8n-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-n8n}"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  n8n_data:
  postgres_data:

networks:
  n8n-network:
    driver: bridge
```

### 3.2 环境变量配置

```bash
# .env 文件
# n8n 基础配置
N8N_HOST=n8n.yourdomain.com
N8N_PROTOCOL=https
WEBHOOK_URL=https://n8n.yourdomain.com

# 认证配置
N8N_USER=admin
N8N_PASSWORD=your-secure-password-here

# 数据库配置
POSTGRES_USER=n8n
POSTGRES_PASSWORD=your-db-password-here
POSTGRES_DB=n8n

# API Key (用于 Node.js 服务调用)
N8N_API_KEY=your-api-key-here
```

### 3.3 生产环境部署清单

```
✅ 部署检查清单
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔒 安全配置
  □ 启用 HTTPS (使用 Nginx/Traefik 反向代理)
  □ 设置强密码和 API Key
  □ 配置防火墙规则
  □ 启用 CORS 白名单

💾 数据持久化
  □ 使用外部数据库 (PostgreSQL)
  □ 配置数据库自动备份
  □ 挂载持久化 Volume

📊 监控告警
  □ 配置健康检查端点
  □ 设置执行失败告警
  □ 日志收集 (ELK/Loki)

⚡ 性能优化
  □ 配置执行队列模式
  □ 设置并发执行限制
  □ 配置执行超时时间

🔄 高可用 (可选)
  □ 部署多实例 + Redis 队列
  □ 配置负载均衡
  □ 数据库主从复制
```

---

## 四、Node.js 服务调用 n8n

### 4.1 n8n 客户端封装

创建一个统一的 n8n 客户端类，封装所有与 n8n 的交互：

```typescript
// src/services/n8n-client.ts
import axios, { AxiosInstance, AxiosError } from 'axios';

interface N8nConfig {
  baseUrl: string;           // n8n 服务地址
  apiKey?: string;           // API Key (可选)
  basicAuth?: {              // Basic Auth (可选)
    username: string;
    password: string;
  };
  timeout?: number;          // 请求超时时间
}

interface WorkflowExecutionResult {
  executionId: string;
  finished: boolean;
  mode: string;
  startedAt: string;
  stoppedAt: string;
  data: {
    resultData: {
      runData: Record<string, any>;
    };
  };
}

interface WebhookResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  executionId?: string;
}

export class N8nClient {
  private client: AxiosInstance;
  private config: N8nConfig;

  constructor(config: N8nConfig) {
    this.config = config;
    this.client = this.createClient();
  }

  private createClient(): AxiosInstance {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // API Key 认证
    if (this.config.apiKey) {
      headers['X-N8N-API-KEY'] = this.config.apiKey;
    }

    const instance = axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout || 30000,
      headers,
    });

    // Basic Auth 认证
    if (this.config.basicAuth) {
      instance.defaults.auth = {
        username: this.config.basicAuth.username,
        password: this.config.basicAuth.password,
      };
    }

    // 响应拦截器
    instance.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        console.error('[N8nClient] Request failed:', {
          url: error.config?.url,
          method: error.config?.method,
          status: error.response?.status,
          message: error.message,
        });
        throw error;
      }
    );

    return instance;
  }

  /**
   * 通过 Webhook 触发工作流
   * 这是最常用的调用方式
   */
  async triggerWebhook<T = any>(
    webhookPath: string,
    payload: Record<string, any> = {},
    options: {
      method?: 'GET' | 'POST';
      headers?: Record<string, string>;
    } = {}
  ): Promise<WebhookResponse<T>> {
    const { method = 'POST', headers = {} } = options;
    
    try {
      const url = `/webhook/${webhookPath}`;
      const response = await this.client.request<T>({
        method,
        url,
        data: method === 'POST' ? payload : undefined,
        params: method === 'GET' ? payload : undefined,
        headers,
      });

      return {
        success: true,
        data: response.data,
        executionId: response.headers['x-n8n-execution-id'],
      };
    } catch (error) {
      const axiosError = error as AxiosError;
      return {
        success: false,
        error: axiosError.message,
      };
    }
  }

  /**
   * 通过 Webhook（测试模式）触发工作流
   * 用于开发测试，会在 n8n UI 中显示执行
   */
  async triggerWebhookTest<T = any>(
    webhookPath: string,
    payload: Record<string, any> = {}
  ): Promise<WebhookResponse<T>> {
    return this.triggerWebhook<T>(`webhook-test/${webhookPath}`, payload);
  }

  /**
   * 通过 REST API 执行工作流（需要 API Key）
   */
  async executeWorkflow(
    workflowId: string,
    inputData?: Record<string, any>
  ): Promise<WorkflowExecutionResult> {
    const response = await this.client.post(`/api/v1/workflows/${workflowId}/execute`, {
      data: inputData,
    });
    return response.data;
  }

  /**
   * 获取工作流执行状态
   */
  async getExecutionStatus(executionId: string): Promise<WorkflowExecutionResult> {
    const response = await this.client.get(`/api/v1/executions/${executionId}`);
    return response.data;
  }

  /**
   * 获取所有工作流列表
   */
  async getWorkflows(): Promise<any[]> {
    const response = await this.client.get('/api/v1/workflows');
    return response.data.data;
  }

  /**
   * 激活/停用工作流
   */
  async setWorkflowActive(workflowId: string, active: boolean): Promise<void> {
    await this.client.patch(`/api/v1/workflows/${workflowId}`, {
      active,
    });
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.client.get('/healthz');
      return true;
    } catch {
      return false;
    }
  }
}

// 导出单例实例
export const n8nClient = new N8nClient({
  baseUrl: process.env.N8N_BASE_URL || 'http://localhost:5678',
  apiKey: process.env.N8N_API_KEY,
  timeout: 30000,
});
```

### 4.2 业务服务集成示例

```typescript
// src/services/notification.service.ts
import { n8nClient } from './n8n-client';

interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
  templateId?: string;
  variables?: Record<string, any>;
}

interface SendSlackParams {
  channel: string;
  message: string;
  blocks?: any[];
}

interface NotificationResult {
  success: boolean;
  channel: string;
  messageId?: string;
  error?: string;
}

export class NotificationService {
  /**
   * 发送邮件通知
   * 触发 n8n 中的邮件发送工作流
   */
  async sendEmail(params: SendEmailParams): Promise<NotificationResult> {
    const result = await n8nClient.triggerWebhook('send-email', {
      to: params.to,
      subject: params.subject,
      body: params.body,
      templateId: params.templateId,
      variables: params.variables,
      timestamp: new Date().toISOString(),
    });

    return {
      success: result.success,
      channel: 'email',
      messageId: result.executionId,
      error: result.error,
    };
  }

  /**
   * 发送 Slack 通知
   */
  async sendSlack(params: SendSlackParams): Promise<NotificationResult> {
    const result = await n8nClient.triggerWebhook('send-slack', {
      channel: params.channel,
      message: params.message,
      blocks: params.blocks,
      timestamp: new Date().toISOString(),
    });

    return {
      success: result.success,
      channel: 'slack',
      messageId: result.executionId,
      error: result.error,
    };
  }

  /**
   * 多渠道通知
   * 同时发送到多个渠道
   */
  async sendMultiChannel(
    channels: ('email' | 'slack' | 'sms')[],
    params: {
      email?: SendEmailParams;
      slack?: SendSlackParams;
      sms?: { phone: string; message: string };
    }
  ): Promise<NotificationResult[]> {
    const results: NotificationResult[] = [];

    const promises = channels.map(async (channel) => {
      switch (channel) {
        case 'email':
          if (params.email) {
            return this.sendEmail(params.email);
          }
          break;
        case 'slack':
          if (params.slack) {
            return this.sendSlack(params.slack);
          }
          break;
        case 'sms':
          if (params.sms) {
            const result = await n8nClient.triggerWebhook('send-sms', params.sms);
            return {
              success: result.success,
              channel: 'sms',
              messageId: result.executionId,
              error: result.error,
            };
          }
          break;
      }
      return null;
    });

    const settled = await Promise.allSettled(promises);
    
    for (const result of settled) {
      if (result.status === 'fulfilled' && result.value) {
        results.push(result.value);
      }
    }

    return results;
  }
}

export const notificationService = new NotificationService();
```

### 4.3 异步工作流处理

对于长时间运行的工作流，采用异步回调模式：

```typescript
// src/services/async-workflow.service.ts
import { n8nClient } from './n8n-client';
import { EventEmitter } from 'events';

interface WorkflowJob {
  id: string;
  workflowPath: string;
  payload: Record<string, any>;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: any;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

export class AsyncWorkflowService extends EventEmitter {
  private jobs: Map<string, WorkflowJob> = new Map();

  /**
   * 提交异步工作流任务
   */
  async submitJob(
    workflowPath: string,
    payload: Record<string, any>
  ): Promise<string> {
    const jobId = this.generateJobId();
    
    const job: WorkflowJob = {
      id: jobId,
      workflowPath,
      payload,
      status: 'pending',
      createdAt: new Date(),
    };

    this.jobs.set(jobId, job);

    // 异步执行，不等待结果
    this.executeJob(job).catch((error) => {
      console.error(`[AsyncWorkflow] Job ${jobId} failed:`, error);
    });

    return jobId;
  }

  private async executeJob(job: WorkflowJob): Promise<void> {
    job.status = 'running';
    this.emit('jobStarted', job);

    try {
      // 在 payload 中包含回调信息
      const result = await n8nClient.triggerWebhook(job.workflowPath, {
        ...job.payload,
        _callback: {
          jobId: job.id,
          callbackUrl: `${process.env.APP_BASE_URL}/api/workflow/callback`,
        },
      });

      if (result.success) {
        job.status = 'completed';
        job.result = result.data;
        job.completedAt = new Date();
        this.emit('jobCompleted', job);
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : String(error);
      job.completedAt = new Date();
      this.emit('jobFailed', job);
    }
  }

  /**
   * 接收 n8n 回调
   * 用于处理工作流执行完成的回调通知
   */
  handleCallback(callbackData: {
    jobId: string;
    status: 'success' | 'error';
    data?: any;
    error?: string;
  }): void {
    const job = this.jobs.get(callbackData.jobId);
    if (!job) {
      console.warn(`[AsyncWorkflow] Unknown job: ${callbackData.jobId}`);
      return;
    }

    if (callbackData.status === 'success') {
      job.status = 'completed';
      job.result = callbackData.data;
    } else {
      job.status = 'failed';
      job.error = callbackData.error;
    }

    job.completedAt = new Date();
    this.emit(callbackData.status === 'success' ? 'jobCompleted' : 'jobFailed', job);
  }

  /**
   * 获取任务状态
   */
  getJobStatus(jobId: string): WorkflowJob | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * 等待任务完成
   */
  waitForJob(jobId: string, timeout: number = 60000): Promise<WorkflowJob> {
    return new Promise((resolve, reject) => {
      const job = this.jobs.get(jobId);
      if (!job) {
        reject(new Error(`Job not found: ${jobId}`));
        return;
      }

      if (job.status === 'completed' || job.status === 'failed') {
        resolve(job);
        return;
      }

      const timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error(`Job timeout: ${jobId}`));
      }, timeout);

      const onCompleted = (completedJob: WorkflowJob) => {
        if (completedJob.id === jobId) {
          cleanup();
          resolve(completedJob);
        }
      };

      const onFailed = (failedJob: WorkflowJob) => {
        if (failedJob.id === jobId) {
          cleanup();
          resolve(failedJob);
        }
      };

      const cleanup = () => {
        clearTimeout(timeoutId);
        this.off('jobCompleted', onCompleted);
        this.off('jobFailed', onFailed);
      };

      this.on('jobCompleted', onCompleted);
      this.on('jobFailed', onFailed);
    });
  }

  private generateJobId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export const asyncWorkflowService = new AsyncWorkflowService();
```

### 4.4 Express 路由集成

```typescript
// src/routes/workflow.routes.ts
import { Router, Request, Response } from 'express';
import { notificationService } from '../services/notification.service';
import { asyncWorkflowService } from '../services/async-workflow.service';
import { n8nClient } from '../services/n8n-client';

const router = Router();

/**
 * 发送通知
 * POST /api/notifications/send
 */
router.post('/notifications/send', async (req: Request, res: Response) => {
  try {
    const { channels, email, slack, sms } = req.body;

    const results = await notificationService.sendMultiChannel(
      channels,
      { email, slack, sms }
    );

    res.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error('[API] Send notification failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send notification',
    });
  }
});

/**
 * 提交异步工作流任务
 * POST /api/workflow/submit
 */
router.post('/workflow/submit', async (req: Request, res: Response) => {
  try {
    const { workflowPath, payload } = req.body;

    if (!workflowPath) {
      return res.status(400).json({
        success: false,
        error: 'workflowPath is required',
      });
    }

    const jobId = await asyncWorkflowService.submitJob(workflowPath, payload || {});

    res.json({
      success: true,
      jobId,
      message: 'Job submitted successfully',
    });
  } catch (error) {
    console.error('[API] Submit workflow failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit workflow',
    });
  }
});

/**
 * 查询任务状态
 * GET /api/workflow/status/:jobId
 */
router.get('/workflow/status/:jobId', (req: Request, res: Response) => {
  const { jobId } = req.params;
  const job = asyncWorkflowService.getJobStatus(jobId);

  if (!job) {
    return res.status(404).json({
      success: false,
      error: 'Job not found',
    });
  }

  res.json({
    success: true,
    job: {
      id: job.id,
      status: job.status,
      result: job.result,
      error: job.error,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
    },
  });
});

/**
 * n8n 回调接收端点
 * POST /api/workflow/callback
 */
router.post('/workflow/callback', (req: Request, res: Response) => {
  try {
    const { jobId, status, data, error } = req.body;

    if (!jobId) {
      return res.status(400).json({
        success: false,
        error: 'jobId is required',
      });
    }

    asyncWorkflowService.handleCallback({ jobId, status, data, error });

    res.json({ success: true });
  } catch (error) {
    console.error('[API] Handle callback failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to handle callback',
    });
  }
});

/**
 * n8n 健康检查
 * GET /api/workflow/health
 */
router.get('/workflow/health', async (req: Request, res: Response) => {
  const isHealthy = await n8nClient.healthCheck();

  res.status(isHealthy ? 200 : 503).json({
    success: isHealthy,
    service: 'n8n',
    status: isHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
  });
});

export default router;
```

---

## 五、n8n 工作流设计示例

### 5.1 邮件发送工作流

在 n8n 中创建一个接收 Webhook 并发送邮件的工作流：

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Webhook   │───►│   Set Data  │───►│    SMTP     │───►│  Respond    │
│   Trigger   │    │   (格式化)   │    │   (发送)    │    │  to Webhook │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

#### Webhook 节点配置

```json
{
  "webhookId": "send-email",
  "path": "send-email",
  "httpMethod": "POST",
  "responseMode": "lastNode",
  "options": {}
}
```

#### Set Data 节点（数据处理）

```javascript
// n8n Expression 示例
return {
  to: $json.to,
  subject: $json.subject,
  htmlBody: $json.body || generateEmailTemplate($json.templateId, $json.variables),
  from: 'noreply@yourdomain.com',
  replyTo: $json.replyTo || 'support@yourdomain.com',
};

function generateEmailTemplate(templateId, variables) {
  const templates = {
    'welcome': `<h1>欢迎 ${variables?.name || '用户'}!</h1><p>感谢您的注册。</p>`,
    'reset-password': `<h1>密码重置</h1><p>您的验证码是: ${variables?.code}</p>`,
    'notification': `<h1>${variables?.title}</h1><p>${variables?.content}</p>`,
  };
  return templates[templateId] || variables?.content || '';
}
```

### 5.2 多渠道通知工作流

```
                                    ┌─────────────┐
                                    │    Email    │
                               ┌───►│    Node     │
                               │    └─────────────┘
┌─────────────┐    ┌─────────┐ │    ┌─────────────┐
│   Webhook   │───►│  Switch │─┼───►│    Slack    │
│   Trigger   │    │  Node   │ │    │    Node     │
└─────────────┘    └─────────┘ │    └─────────────┘
                               │    ┌─────────────┐
                               └───►│    SMS      │
                                    │    Node     │
                                    └─────────────┘
```

### 5.3 AI 内容生成工作流

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Webhook   │───►│  Prepare    │───►│   OpenAI    │───►│   Format    │
│   Trigger   │    │  Prompt     │    │   Chat      │    │   Response  │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
                                                               │
                                                               ▼
                                                         ┌─────────────┐
                                                         │   HTTP      │
                                                         │   Callback  │
                                                         └─────────────┘
```

---

## 六、错误处理与重试机制

### 6.1 客户端重试策略

```typescript
// src/utils/retry.ts
interface RetryOptions {
  maxRetries: number;
  baseDelay: number;      // 基础延迟(ms)
  maxDelay: number;       // 最大延迟(ms)
  backoffFactor: number;  // 退避因子
  retryOn?: (error: any) => boolean;
}

const defaultOptions: RetryOptions = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffFactor: 2,
  retryOn: (error) => {
    // 仅对网络错误和 5xx 错误重试
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      return true;
    }
    if (error.response?.status >= 500) {
      return true;
    }
    return false;
  },
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...defaultOptions, ...options };
  let lastError: any;
  let delay = opts.baseDelay;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === opts.maxRetries) {
        break;
      }

      if (!opts.retryOn?.(error)) {
        break;
      }

      console.warn(
        `[Retry] Attempt ${attempt + 1}/${opts.maxRetries} failed, ` +
        `retrying in ${delay}ms...`
      );

      await sleep(delay);
      delay = Math.min(delay * opts.backoffFactor, opts.maxDelay);
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

### 6.2 增强版 n8n 客户端

```typescript
// src/services/n8n-client-enhanced.ts
import { N8nClient, WebhookResponse } from './n8n-client';
import { withRetry } from '../utils/retry';

export class N8nClientEnhanced extends N8nClient {
  /**
   * 带重试的 Webhook 触发
   */
  async triggerWebhookWithRetry<T = any>(
    webhookPath: string,
    payload: Record<string, any> = {},
    options: {
      maxRetries?: number;
      timeout?: number;
    } = {}
  ): Promise<WebhookResponse<T>> {
    return withRetry(
      () => this.triggerWebhook<T>(webhookPath, payload),
      {
        maxRetries: options.maxRetries ?? 3,
      }
    );
  }

  /**
   * 带超时和重试的工作流执行
   */
  async executeWorkflowSafe(
    workflowId: string,
    inputData?: Record<string, any>,
    options: {
      timeout?: number;
      maxRetries?: number;
    } = {}
  ): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }> {
    try {
      const result = await withRetry(
        () => this.executeWorkflow(workflowId, inputData),
        { maxRetries: options.maxRetries ?? 2 }
      );

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
```

### 6.3 n8n 工作流内的错误处理

在 n8n 工作流中配置错误处理节点：

```
                                    ┌─────────────┐
                               ┌───►│   Success   │
                               │    │   Path      │
┌─────────────┐    ┌─────────┐ │    └─────────────┘
│   Webhook   │───►│  Try    │─┤
│   Trigger   │    │  Node   │ │    ┌─────────────┐
└─────────────┘    └─────────┘ └───►│   Error     │
                                    │   Handler   │
                                    └─────────────┘
                                          │
                                          ▼
                                    ┌─────────────┐
                                    │   Alert     │
                                    │   (Slack)   │
                                    └─────────────┘
```

---

## 七、监控与可观测性

### 7.1 健康检查端点

```typescript
// src/routes/health.routes.ts
import { Router, Request, Response } from 'express';
import { n8nClient } from '../services/n8n-client';

const router = Router();

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: {
    name: string;
    status: 'pass' | 'fail';
    latency?: number;
    message?: string;
  }[];
  timestamp: string;
}

router.get('/health', async (req: Request, res: Response) => {
  const checks: HealthStatus['checks'] = [];
  let overallStatus: HealthStatus['status'] = 'healthy';

  // 检查 n8n 服务
  const n8nStartTime = Date.now();
  const n8nHealthy = await n8nClient.healthCheck();
  const n8nLatency = Date.now() - n8nStartTime;

  checks.push({
    name: 'n8n',
    status: n8nHealthy ? 'pass' : 'fail',
    latency: n8nLatency,
    message: n8nHealthy ? 'n8n service is healthy' : 'n8n service is unreachable',
  });

  if (!n8nHealthy) {
    overallStatus = 'degraded';
  }

  // 可以添加更多检查...
  // - 数据库连接
  // - Redis 连接
  // - 其他依赖服务

  const healthStatus: HealthStatus = {
    status: overallStatus,
    checks,
    timestamp: new Date().toISOString(),
  };

  const statusCode = overallStatus === 'healthy' ? 200 : 
                     overallStatus === 'degraded' ? 200 : 503;

  res.status(statusCode).json(healthStatus);
});

export default router;
```

### 7.2 执行指标收集

```typescript
// src/middleware/metrics.middleware.ts
import { Request, Response, NextFunction } from 'express';

interface WorkflowMetrics {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageLatency: number;
  executionsByWorkflow: Map<string, {
    total: number;
    success: number;
    failed: number;
    latencies: number[];
  }>;
}

class MetricsCollector {
  private metrics: WorkflowMetrics = {
    totalExecutions: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    averageLatency: 0,
    executionsByWorkflow: new Map(),
  };

  private latencies: number[] = [];

  recordExecution(
    workflowPath: string,
    success: boolean,
    latencyMs: number
  ): void {
    this.metrics.totalExecutions++;
    
    if (success) {
      this.metrics.successfulExecutions++;
    } else {
      this.metrics.failedExecutions++;
    }

    this.latencies.push(latencyMs);
    if (this.latencies.length > 1000) {
      this.latencies.shift(); // 保持最近 1000 条记录
    }
    this.metrics.averageLatency = 
      this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length;

    // 按工作流统计
    let workflowStats = this.metrics.executionsByWorkflow.get(workflowPath);
    if (!workflowStats) {
      workflowStats = { total: 0, success: 0, failed: 0, latencies: [] };
      this.metrics.executionsByWorkflow.set(workflowPath, workflowStats);
    }
    
    workflowStats.total++;
    if (success) {
      workflowStats.success++;
    } else {
      workflowStats.failed++;
    }
    workflowStats.latencies.push(latencyMs);
    if (workflowStats.latencies.length > 100) {
      workflowStats.latencies.shift();
    }
  }

  getMetrics(): object {
    const workflowStats: Record<string, any> = {};
    
    for (const [path, stats] of this.metrics.executionsByWorkflow) {
      workflowStats[path] = {
        total: stats.total,
        success: stats.success,
        failed: stats.failed,
        successRate: ((stats.success / stats.total) * 100).toFixed(2) + '%',
        avgLatency: Math.round(
          stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length
        ),
      };
    }

    return {
      totalExecutions: this.metrics.totalExecutions,
      successfulExecutions: this.metrics.successfulExecutions,
      failedExecutions: this.metrics.failedExecutions,
      successRate: this.metrics.totalExecutions > 0
        ? ((this.metrics.successfulExecutions / this.metrics.totalExecutions) * 100).toFixed(2) + '%'
        : 'N/A',
      averageLatency: Math.round(this.metrics.averageLatency),
      workflowStats,
    };
  }
}

export const metricsCollector = new MetricsCollector();

// Express 中间件
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();

  res.on('finish', () => {
    if (req.path.includes('/workflow/') || req.path.includes('/notifications/')) {
      const latency = Date.now() - startTime;
      const success = res.statusCode < 400;
      metricsCollector.recordExecution(req.path, success, latency);
    }
  });

  next();
}
```

### 7.3 Prometheus 指标导出

```typescript
// src/routes/metrics.routes.ts
import { Router, Request, Response } from 'express';
import { metricsCollector } from '../middleware/metrics.middleware';

const router = Router();

// Prometheus 格式指标
router.get('/metrics', (req: Request, res: Response) => {
  const metrics = metricsCollector.getMetrics() as any;
  
  let output = '';
  
  // 总执行次数
  output += '# HELP n8n_workflow_executions_total Total number of workflow executions\n';
  output += '# TYPE n8n_workflow_executions_total counter\n';
  output += `n8n_workflow_executions_total ${metrics.totalExecutions}\n\n`;
  
  // 成功次数
  output += '# HELP n8n_workflow_executions_success_total Total successful executions\n';
  output += '# TYPE n8n_workflow_executions_success_total counter\n';
  output += `n8n_workflow_executions_success_total ${metrics.successfulExecutions}\n\n`;
  
  // 失败次数
  output += '# HELP n8n_workflow_executions_failed_total Total failed executions\n';
  output += '# TYPE n8n_workflow_executions_failed_total counter\n';
  output += `n8n_workflow_executions_failed_total ${metrics.failedExecutions}\n\n`;
  
  // 平均延迟
  output += '# HELP n8n_workflow_latency_avg Average execution latency in ms\n';
  output += '# TYPE n8n_workflow_latency_avg gauge\n';
  output += `n8n_workflow_latency_avg ${metrics.averageLatency}\n\n`;

  res.set('Content-Type', 'text/plain');
  res.send(output);
});

// JSON 格式指标
router.get('/metrics/json', (req: Request, res: Response) => {
  res.json(metricsCollector.getMetrics());
});

export default router;
```

---

## 八、安全最佳实践

### 8.1 认证与授权

```typescript
// src/middleware/auth.middleware.ts
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// Webhook 签名验证中间件
export function verifyN8nSignature(secret: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const signature = req.headers['x-n8n-signature'] as string;
    
    if (!signature) {
      return res.status(401).json({ error: 'Missing signature' });
    }

    const payload = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    if (!crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    )) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    next();
  };
}

// API Key 验证中间件
export function verifyApiKey(validKeys: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const apiKey = req.headers['x-api-key'] as string;
    
    if (!apiKey || !validKeys.includes(apiKey)) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    next();
  };
}
```

### 8.2 敏感数据处理

```typescript
// src/utils/sanitize.ts
export function sanitizePayload(
  payload: Record<string, any>,
  sensitiveFields: string[] = ['password', 'token', 'secret', 'apiKey', 'creditCard']
): Record<string, any> {
  const sanitized = { ...payload };

  for (const key of Object.keys(sanitized)) {
    if (sensitiveFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      sanitized[key] = sanitizePayload(sanitized[key], sensitiveFields);
    }
  }

  return sanitized;
}

// 日志中自动脱敏
export function safeLog(message: string, data?: Record<string, any>): void {
  const sanitizedData = data ? sanitizePayload(data) : undefined;
  console.log(message, sanitizedData);
}
```

### 8.3 速率限制

```typescript
// src/middleware/rate-limit.middleware.ts
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { createClient } from 'redis';

// 基础速率限制
export const basicRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 分钟
  max: 100,            // 最多 100 次请求
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 工作流触发速率限制（更严格）
export const workflowRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 分钟
  max: 30,             // 最多 30 次工作流触发
  message: { error: 'Workflow rate limit exceeded' },
  keyGenerator: (req) => {
    // 按用户 ID 或 IP 限制
    return req.headers['x-user-id'] as string || req.ip || 'unknown';
  },
});

// Redis 存储的速率限制（分布式环境）
export async function createDistributedRateLimiter() {
  const redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  });
  
  await redisClient.connect();

  return rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    store: new RedisStore({
      sendCommand: (...args: string[]) => redisClient.sendCommand(args),
    }),
  });
}
```

---

## 九、完整项目结构

```
n8n-nodejs-integration/
├── docker/
│   ├── docker-compose.yml        # Docker 编排文件
│   ├── docker-compose.prod.yml   # 生产环境配置
│   └── .env.example              # 环境变量示例
│
├── src/
│   ├── config/
│   │   ├── index.ts              # 配置管理
│   │   └── n8n.config.ts         # n8n 相关配置
│   │
│   ├── services/
│   │   ├── n8n-client.ts         # n8n 客户端
│   │   ├── notification.service.ts
│   │   └── async-workflow.service.ts
│   │
│   ├── routes/
│   │   ├── workflow.routes.ts    # 工作流路由
│   │   ├── health.routes.ts      # 健康检查
│   │   └── metrics.routes.ts     # 指标导出
│   │
│   ├── middleware/
│   │   ├── auth.middleware.ts    # 认证中间件
│   │   ├── rate-limit.middleware.ts
│   │   └── metrics.middleware.ts
│   │
│   ├── utils/
│   │   ├── retry.ts              # 重试工具
│   │   └── sanitize.ts           # 数据脱敏
│   │
│   └── app.ts                    # 应用入口
│
├── tests/
│   ├── services/
│   │   └── n8n-client.test.ts
│   └── routes/
│       └── workflow.routes.test.ts
│
├── package.json
├── tsconfig.json
└── README.md
```

---

## 十、总结

### 10.1 架构优势回顾

| 维度 | 收益 |
|------|------|
| **开发效率** | 通过可视化界面快速构建工作流，减少编码工作量 |
| **可维护性** | 工作流逻辑与业务代码分离，便于独立维护和更新 |
| **可扩展性** | 利用 n8n 400+ 预置集成，快速对接新服务 |
| **可观测性** | n8n 内置执行历史，结合自定义指标实现全链路监控 |
| **灵活性** | 支持同步/异步执行模式，适应不同业务场景 |

### 10.2 适用场景总结

```
✅ 推荐使用 n8n 的场景：
━━━━━━━━━━━━━━━━━━━━━━━━━━
• 需要频繁调整的业务流程
• 多系统数据同步与集成
• 通知和告警系统
• 审批和工作流引擎
• AI/LLM 应用的编排层

❌ 不适合使用 n8n 的场景：
━━━━━━━━━━━━━━━━━━━━━━━━━━
• 毫秒级低延迟要求的核心交易
• 简单的单一 API 调用
• 需要复杂事务控制的操作
• 对执行顺序有严格要求的批处理
```

### 10.3 最佳实践清单

```
📋 实施检查清单
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

架构设计
  □ 明确同步/异步调用边界
  □ 设计统一的错误处理机制
  □ 规划回调和重试策略

安全配置
  □ 启用 HTTPS
  □ 配置 API Key 认证
  □ 实施速率限制
  □ 敏感数据脱敏

运维监控
  □ 健康检查端点
  □ 执行指标收集
  □ 日志聚合与告警
  □ 定期备份工作流配置

性能优化
  □ 合理设置超时时间
  □ 配置执行并发限制
  □ 使用连接池
  □ 缓存热点数据
```

---

## 参考资料

### 官方文档

1. [n8n Documentation](https://docs.n8n.io/)
2. [n8n API Reference](https://docs.n8n.io/api/)
3. [n8n Self-hosting Guide](https://docs.n8n.io/hosting/)

### 部署与运维

4. [n8n Docker Hub](https://hub.docker.com/r/n8nio/n8n)
5. [n8n Environment Variables](https://docs.n8n.io/hosting/configuration/environment-variables/)
6. [n8n Scaling Guide](https://docs.n8n.io/hosting/scaling/)

### 社区资源

7. [n8n Community Forum](https://community.n8n.io/)
8. [n8n GitHub Repository](https://github.com/n8n-io/n8n)
9. [n8n Workflow Templates](https://n8n.io/workflows/)

---

*本文最后更新于 2026 年 1 月，基于 n8n 1.x 版本。*
