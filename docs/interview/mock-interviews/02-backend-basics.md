# 面试模拟 2：技术筛选 - 后端基础

> **面试类型**：技术筛选（电话/视频面试）  
> **时长**：45分钟  
> **面试官**：后端架构师  
> **考察重点**：Node.js/Python、API设计、数据库、并发处理

---

## 开场（2分钟）

**面试官**：你好，我是公司的后端架构师。今天主要聊聊后端开发相关的话题。简单介绍一下你的后端开发经验吧。

**候选人**：您好！我有4年的全栈开发经验，后端主要使用Node.js和Python。在上一家AI公司，我负责设计和开发智能客服系统的后端架构，包括对话服务API、RAG检索服务、以及与LLM的集成。日均处理对话请求约10万次，系统可用性达到99.9%。我对高并发处理、API设计以及AI服务集成都有较深的实践经验。

---

## 第一部分：Node.js核心（12分钟）

### 问题1：事件循环

**面试官**：请解释一下Node.js的事件循环机制，以及宏任务和微任务的执行顺序。

**候选人**：Node.js的事件循环是其非阻塞I/O模型的核心。事件循环分为几个阶段，按顺序执行：

```
   ┌───────────────────────────┐
┌─>│           timers          │  setTimeout, setInterval
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
│  │     pending callbacks     │  I/O callbacks
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
│  │       idle, prepare       │  内部使用
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
│  │           poll            │  获取新I/O事件
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
│  │           check           │  setImmediate
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
└──┤      close callbacks      │  socket.on('close')
   └───────────────────────────┘
```

**微任务与宏任务的执行顺序**：

- **微任务**：`process.nextTick`、`Promise.then/catch/finally`
- **宏任务**：`setTimeout`、`setInterval`、`setImmediate`、I/O操作

执行顺序：每个阶段结束后，会先清空`process.nextTick`队列，再清空`Promise`微任务队列，然后进入下一个阶段。

```javascript
console.log('1');

setTimeout(() => console.log('2'), 0);

setImmediate(() => console.log('3'));

Promise.resolve().then(() => console.log('4'));

process.nextTick(() => console.log('5'));

console.log('6');

// 输出顺序：1, 6, 5, 4, 2, 3（2和3的顺序在某些情况下可能不确定）
```

**在AI应用中的实际影响**：

在处理流式响应时，理解事件循环很重要：

```javascript
async function* streamResponse(prompt) {
  const stream = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: prompt }],
    stream: true
  });

  for await (const chunk of stream) {
    // 每个chunk的处理都在事件循环中调度
    yield chunk.choices[0]?.delta?.content || '';
    
    // 如果需要在chunk之间做一些清理工作
    await new Promise(resolve => setImmediate(resolve));
  }
}
```

**面试官**：如何在Node.js中处理CPU密集型任务，比如大文档的文本处理？

**候选人**：CPU密集型任务会阻塞事件循环，影响其他请求的处理。有几种解决方案：

**1. Worker Threads（推荐）**

```javascript
// main.js
const { Worker } = require('worker_threads');

function processDocument(document) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('./document-processor.js', {
      workerData: { document }
    });
    
    worker.on('message', resolve);
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
    });
  });
}

// document-processor.js
const { parentPort, workerData } = require('worker_threads');

function processDocument(doc) {
  // CPU密集型处理：分块、提取、清洗等
  const chunks = splitIntoChunks(doc);
  const processed = chunks.map(chunk => cleanAndExtract(chunk));
  return processed;
}

const result = processDocument(workerData.document);
parentPort.postMessage(result);
```

**2. 使用Worker Pool**

对于频繁的CPU任务，维护一个Worker Pool更高效：

```javascript
const { Pool } = require('worker-threads-pool');

const pool = new Pool({ max: 4 }); // 4个Worker线程

async function processDocuments(documents) {
  const promises = documents.map(doc => 
    pool.run('./processor.js', { workerData: { doc } })
  );
  return Promise.all(promises);
}
```

**3. 子进程（适合独立脚本）**

```javascript
const { fork } = require('child_process');

function runPythonProcessor(data) {
  return new Promise((resolve, reject) => {
    const process = fork('./python-bridge.js');
    process.send(data);
    process.on('message', resolve);
    process.on('error', reject);
  });
}
```

在我们的RAG系统中，文档处理（PDF解析、文本分块）就是用Worker Pool处理的，主线程只负责接收请求和返回结果。

---

### 问题2：流处理

**面试官**：你提到处理大文档，Node.js的Stream有什么优势？背压（Backpressure）是什么？

**候选人**：Stream的核心优势是内存效率——不需要将整个数据加载到内存，可以逐块处理。

**Stream类型**：
- Readable：可读流（文件读取、HTTP请求体）
- Writable：可写流（文件写入、HTTP响应）
- Duplex：双向流（TCP Socket）
- Transform：转换流（压缩、加密）

**背压问题**：

当生产者（Readable）速度超过消费者（Writable）时，数据会在内存中积压。背压机制用于协调生产和消费速度。

```javascript
const fs = require('fs');

// 错误示例：没有处理背压
function badCopy(source, dest) {
  const readable = fs.createReadStream(source);
  const writable = fs.createWriteStream(dest);
  
  readable.on('data', (chunk) => {
    writable.write(chunk); // 如果写入慢，内存会暴涨
  });
}

// 正确示例：使用pipe自动处理背压
function goodCopy(source, dest) {
  const readable = fs.createReadStream(source);
  const writable = fs.createWriteStream(dest);
  
  readable.pipe(writable);
}

// 手动处理背压
function manualBackpressure(source, dest) {
  const readable = fs.createReadStream(source);
  const writable = fs.createWriteStream(dest);
  
  readable.on('data', (chunk) => {
    const canContinue = writable.write(chunk);
    if (!canContinue) {
      readable.pause(); // 暂停读取
    }
  });
  
  writable.on('drain', () => {
    readable.resume(); // 恢复读取
  });
}
```

**AI应用中的实际应用——流式响应转发**：

```javascript
async function streamChatResponse(req, res) {
  const openaiStream = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: req.body.messages,
    stream: true
  });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // 使用pipeline处理背压
  const { pipeline } = require('stream/promises');
  const { Transform } = require('stream');

  const sseTransform = new Transform({
    objectMode: true,
    transform(chunk, encoding, callback) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        this.push(`data: ${JSON.stringify({ content })}\n\n`);
      }
      callback();
    }
  });

  try {
    await pipeline(
      Readable.from(openaiStream),
      sseTransform,
      res
    );
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ error: 'Stream failed' });
    }
  }
}
```

---

## 第二部分：Python与FastAPI（10分钟）

### 问题3：异步编程

**面试官**：你们的RAG服务是用Python写的，说说Python的异步编程和Node.js有什么区别？

**候选人**：两者都是单线程事件循环模型，但有一些关键区别：

**语法层面**：

```python
# Python - 必须显式await
async def fetch_data():
    result = await database.query("SELECT * FROM docs")
    return result

# Node.js - Promise可以不await（虽然不推荐）
async function fetchData() {
    const result = await database.query("SELECT * FROM docs");
    return result;
}
```

**并发处理**：

```python
# Python - asyncio.gather
async def process_multiple():
    results = await asyncio.gather(
        fetch_embeddings(text1),
        fetch_embeddings(text2),
        fetch_embeddings(text3)
    )
    return results

# 带错误处理
async def process_with_errors():
    results = await asyncio.gather(
        fetch_embeddings(text1),
        fetch_embeddings(text2),
        return_exceptions=True  # 不会因单个失败而全部失败
    )
    for r in results:
        if isinstance(r, Exception):
            logger.error(f"Task failed: {r}")
```

**FastAPI中的实际应用**：

```python
from fastapi import FastAPI, BackgroundTasks
from contextlib import asynccontextmanager

app = FastAPI()

# 生命周期管理
@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时初始化
    app.state.vector_db = await init_vector_db()
    app.state.llm_client = init_llm_client()
    yield
    # 关闭时清理
    await app.state.vector_db.close()

# 流式响应
from fastapi.responses import StreamingResponse

@app.post("/chat/stream")
async def stream_chat(request: ChatRequest):
    async def generate():
        async for chunk in llm_client.stream(request.messages):
            yield f"data: {json.dumps({'content': chunk})}\n\n"
        yield "data: [DONE]\n\n"
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream"
    )
```

**GIL的影响**：

Python有GIL（全局解释器锁），对于CPU密集型任务，多线程无法并行执行Python字节码。解决方案：

```python
# CPU密集型使用ProcessPoolExecutor
from concurrent.futures import ProcessPoolExecutor
import asyncio

executor = ProcessPoolExecutor(max_workers=4)

async def process_document(doc: str):
    loop = asyncio.get_event_loop()
    # 在进程池中执行CPU密集任务
    result = await loop.run_in_executor(
        executor, 
        cpu_intensive_task, 
        doc
    )
    return result
```

---

## 第三部分：API设计（10分钟）

### 问题4：RESTful设计

**面试官**：设计一个AI对话系统的API，需要支持创建会话、发送消息、获取历史记录。

**候选人**：我来设计一个RESTful API：

```yaml
# 会话管理
POST   /api/v1/conversations              # 创建会话
GET    /api/v1/conversations              # 获取会话列表
GET    /api/v1/conversations/:id          # 获取单个会话
DELETE /api/v1/conversations/:id          # 删除会话

# 消息管理
POST   /api/v1/conversations/:id/messages  # 发送消息（支持流式响应）
GET    /api/v1/conversations/:id/messages  # 获取消息历史

# 流式响应（使用SSE）
GET    /api/v1/conversations/:id/messages/stream  # 订阅消息流
```

**详细设计**：

```typescript
// 创建会话
POST /api/v1/conversations
Request:
{
  "title": "新对话",
  "system_prompt": "你是一个helpful assistant",
  "model": "gpt-4",
  "metadata": { "source": "web" }
}
Response: 201 Created
{
  "id": "conv_abc123",
  "title": "新对话",
  "created_at": "2024-01-15T10:30:00Z",
  "message_count": 0
}

// 发送消息（非流式）
POST /api/v1/conversations/:id/messages
Request:
{
  "content": "什么是RAG？",
  "stream": false
}
Response: 200 OK
{
  "id": "msg_xyz789",
  "role": "assistant",
  "content": "RAG（Retrieval-Augmented Generation）是...",
  "created_at": "2024-01-15T10:31:00Z",
  "usage": {
    "prompt_tokens": 50,
    "completion_tokens": 200,
    "total_tokens": 250
  }
}

// 发送消息（流式）
POST /api/v1/conversations/:id/messages
Request:
{
  "content": "什么是RAG？",
  "stream": true
}
Response: 200 OK (text/event-stream)
data: {"type": "start", "message_id": "msg_xyz789"}

data: {"type": "delta", "content": "RAG"}

data: {"type": "delta", "content": "（Retrieval"}

data: {"type": "delta", "content": "-Augmented"}

...

data: {"type": "done", "usage": {"prompt_tokens": 50, "completion_tokens": 200}}
```

**错误处理设计**：

```typescript
// 统一错误响应格式
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "请求过于频繁，请稍后重试",
    "details": {
      "limit": 60,
      "remaining": 0,
      "reset_at": "2024-01-15T10:35:00Z"
    }
  }
}

// 常见状态码使用
// 400 - 请求参数错误
// 401 - 未认证
// 403 - 无权限
// 404 - 资源不存在
// 429 - 请求过于频繁
// 500 - 服务器内部错误
// 503 - 服务暂时不可用（LLM过载）
```

**面试官**：如何处理长时间运行的AI请求超时问题？

**候选人**：AI请求的超时处理需要多层策略：

```python
# 1. 客户端超时配置
import httpx

async def call_llm(prompt: str):
    async with httpx.AsyncClient(
        timeout=httpx.Timeout(
            connect=5.0,      # 连接超时
            read=120.0,       # 读取超时（AI响应可能很长）
            write=10.0,       # 写入超时
            pool=10.0         # 连接池获取超时
        )
    ) as client:
        response = await client.post(
            LLM_ENDPOINT,
            json={"prompt": prompt}
        )
        return response.json()

# 2. 请求级别超时与重试
from tenacity import retry, stop_after_attempt, wait_exponential

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type((httpx.TimeoutException, httpx.NetworkError))
)
async def call_llm_with_retry(prompt: str):
    return await call_llm(prompt)

# 3. 服务端超时中间件
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

class TimeoutMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        try:
            return await asyncio.wait_for(
                call_next(request),
                timeout=300.0  # 5分钟总超时
            )
        except asyncio.TimeoutError:
            return JSONResponse(
                status_code=504,
                content={"error": {"code": "GATEWAY_TIMEOUT", "message": "请求处理超时"}}
            )

# 4. 长任务转异步
@app.post("/api/v1/tasks")
async def create_async_task(request: TaskRequest, background_tasks: BackgroundTasks):
    task_id = str(uuid.uuid4())
    
    # 立即返回task_id
    background_tasks.add_task(process_long_task, task_id, request)
    
    return {"task_id": task_id, "status": "pending"}

@app.get("/api/v1/tasks/{task_id}")
async def get_task_status(task_id: str):
    task = await task_store.get(task_id)
    return {"task_id": task_id, "status": task.status, "result": task.result}
```

---

## 第四部分：数据库设计（8分钟）

### 问题5：对话存储设计

**面试官**：如何设计对话系统的数据库schema？需要考虑哪些因素？

**候选人**：对话系统的数据库设计需要考虑查询模式、存储效率和扩展性：

```sql
-- 用户表
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    settings JSONB DEFAULT '{}'
);

-- 会话表
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    title VARCHAR(200),
    system_prompt TEXT,
    model VARCHAR(50) DEFAULT 'gpt-4',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}',
    
    -- 索引
    INDEX idx_conversations_user_id (user_id),
    INDEX idx_conversations_updated_at (updated_at DESC)
);

-- 消息表
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Token使用统计
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    
    -- 消息元数据（如来源引用）
    metadata JSONB DEFAULT '{}',
    
    -- 索引
    INDEX idx_messages_conversation_id (conversation_id),
    INDEX idx_messages_created_at (conversation_id, created_at)
);

-- 使用统计表（用于计费和限流）
CREATE TABLE usage_stats (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    model VARCHAR(50) NOT NULL,
    prompt_tokens BIGINT DEFAULT 0,
    completion_tokens BIGINT DEFAULT 0,
    request_count INTEGER DEFAULT 0,
    
    UNIQUE(user_id, date, model)
);
```

**查询优化考虑**：

```sql
-- 常见查询1：获取用户最近的会话列表
SELECT c.*, 
       (SELECT content FROM messages WHERE conversation_id = c.id 
        ORDER BY created_at DESC LIMIT 1) as last_message
FROM conversations c
WHERE c.user_id = $1
ORDER BY c.updated_at DESC
LIMIT 20;

-- 优化：使用物化视图或在conversations表中冗余last_message字段

-- 常见查询2：获取会话的消息历史（分页）
SELECT * FROM messages 
WHERE conversation_id = $1
ORDER BY created_at ASC
LIMIT $2 OFFSET $3;

-- 使用游标分页更高效
SELECT * FROM messages
WHERE conversation_id = $1 AND created_at > $cursor
ORDER BY created_at ASC
LIMIT $2;
```

**向量存储设计**（使用pgvector扩展）：

```sql
CREATE EXTENSION vector;

-- 知识库文档表
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL,
    embedding vector(1536),  -- OpenAI embedding维度
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建向量索引
CREATE INDEX idx_documents_embedding ON documents 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- 语义搜索查询
SELECT id, content, 1 - (embedding <=> $1) as similarity
FROM documents
WHERE embedding <=> $1 < 0.5  -- 过滤阈值
ORDER BY embedding <=> $1
LIMIT 5;
```

---

## 结束（3分钟）

**面试官**：好的，最后问一下，在AI后端开发中，你遇到过最有挑战性的问题是什么？

**候选人**：最有挑战性的是解决"流式响应中断重连"的问题。

用户在移动端网络不稳定时，流式响应经常断开。我们需要实现：
1. 服务端：保存streaming session状态，支持从断点恢复
2. 客户端：检测断开后自动重连，带上last_event_id
3. 幂等性：确保重连后不会重复生成内容

最终方案是引入了消息序列号机制和服务端状态缓存（Redis），重连时对比序列号，只发送缺失的部分。这个方案上线后，移动端对话完成率从85%提升到98%。

**面试官**：很好，今天的面试就到这里。你有什么问题吗？

**候选人**：感谢！我想了解：
1. 团队的后端服务是如何部署的？是否使用Kubernetes？
2. 公司对AI推理成本有什么控制策略？

---

## 面试评估

| 评估维度 | 评分 | 评语 |
|---------|------|------|
| Node.js核心 | ⭐⭐⭐⭐⭐ | 事件循环、Stream理解深入 |
| Python异步 | ⭐⭐⭐⭐ | 掌握asyncio和FastAPI |
| API设计 | ⭐⭐⭐⭐⭐ | 设计规范，考虑AI特殊场景 |
| 数据库 | ⭐⭐⭐⭐ | Schema设计合理，了解向量数据库 |
| 问题解决 | ⭐⭐⭐⭐⭐ | 能举出有深度的实际案例 |

**总体评价**：后端基础扎实，对AI应用场景有深入实践，建议进入下一轮技术深度面试。
