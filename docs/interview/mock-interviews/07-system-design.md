# 面试模拟 7：系统设计面试

> **面试类型**：系统设计面试  
> **时长**：60分钟  
> **面试官**：首席架构师  
> **考察重点**：系统架构设计、技术选型、扩展性、AI系统特有挑战

---

## 开场（2分钟）

**面试官**：你好，今天的系统设计题目是：**设计一个AI驱动的企业知识库问答系统**。

需求背景：
- 目标用户：企业内部员工，约1万人
- 文档规模：10万篇文档，每篇平均5000字
- 支持多种文档格式：PDF、Word、Markdown、网页
- 日均查询量：5万次
- 响应时间要求：首字节 < 1秒，完整响应 < 10秒

请你设计这个系统。

---

## 需求澄清（5分钟）

**候选人**：好的，在开始设计前，我想先澄清几个问题：

**功能需求**：
1. 用户是否需要多轮对话，还是单轮问答？
2. 是否需要支持引用来源，让用户知道答案出处？
3. 是否需要支持用户反馈（赞/踩）来改进系统？
4. 是否需要权限控制，不同部门看不同文档？

**面试官**：
1. 需要支持多轮对话
2. 必须支持引用来源
3. 需要用户反馈
4. 需要权限控制，基于部门和职级

**候选人**：

**非功能需求确认**：
1. 文档更新频率如何？实时还是定期？
2. 是否有峰值流量？比如早上刚上班时？
3. 数据是否有敏感性要求？是否需要私有化部署？
4. 系统可用性要求是多少？

**面试官**：
1. 文档更新频率不高，每天约新增/更新100篇
2. 有峰值，早上9-10点流量是平时的3倍
3. 企业敏感数据，需要私有化部署
4. 可用性要求99.9%

**候选人**：明白了，我来总结一下关键约束：

```
功能需求：
- 多轮对话问答
- 来源引用
- 用户反馈
- 基于部门/职级的权限控制

非功能需求：
- 1万用户，日均5万查询
- 峰值QPS：~50（假设8小时工作，峰值3倍）
- 10万文档，每天增量100篇
- 私有化部署
- 99.9%可用性
- 首字节 < 1秒
```

---

## 高层设计（10分钟）

**候选人**：让我先画出整体架构：

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              用户层                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│     ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                  │
│     │  Web 应用   │    │  企业微信   │    │   API      │                  │
│     │  (React)    │    │   集成      │    │  接入      │                  │
│     └──────┬──────┘    └──────┬──────┘    └──────┬──────┘                  │
│            │                  │                  │                          │
│            └──────────────────┼──────────────────┘                          │
│                               ▼                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                            网关层                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│     ┌─────────────────────────────────────────────────────────────────┐    │
│     │                    API Gateway (Kong)                           │    │
│     │     认证/授权  │  限流  │  负载均衡  │  日志  │  监控           │    │
│     └─────────────────────────────────────────────────────────────────┘    │
│                               │                                             │
├───────────────────────────────┼─────────────────────────────────────────────┤
│                            服务层                                           │
├───────────────────────────────┼─────────────────────────────────────────────┤
│     ┌─────────────┬───────────┼───────────┬─────────────┐                  │
│     ▼             ▼           ▼           ▼             ▼                  │
│ ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐                │
│ │ 对话   │  │ 检索   │  │ 文档   │  │ 用户   │  │ 反馈   │                │
│ │ 服务   │  │ 服务   │  │ 服务   │  │ 服务   │  │ 服务   │                │
│ └───┬────┘  └───┬────┘  └───┬────┘  └───┬────┘  └───┬────┘                │
│     │           │           │           │           │                      │
├─────┼───────────┼───────────┼───────────┼───────────┼──────────────────────┤
│     │         数据层        │           │           │                      │
├─────┼───────────┼───────────┼───────────┼───────────┼──────────────────────┤
│     │           │           │           │           │                      │
│ ┌───▼───┐   ┌───▼───┐   ┌───▼───┐   ┌───▼───┐   ┌───▼───┐                │
│ │Redis  │   │Milvus │   │MinIO  │   │Postgres│   │Elastic│                │
│ │会话   │   │向量库 │   │文件   │   │元数据 │   │日志   │                │
│ └───────┘   └───────┘   └───────┘   └───────┘   └───────┘                │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                          AI 基础设施                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│ ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                      │
│ │  Embedding  │    │    LLM      │    │  Reranker   │                      │
│ │   Service   │    │   Service   │    │   Service   │                      │
│ │ (本地部署)  │    │ (私有/API)  │    │  (本地部署) │                      │
│ └─────────────┘    └─────────────┘    └─────────────┘                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

**核心服务职责**：

| 服务 | 职责 | 技术选型 |
|------|------|---------|
| 对话服务 | 会话管理、上下文维护、流式响应 | FastAPI + Redis |
| 检索服务 | 向量检索、混合搜索、重排序 | FastAPI + Milvus |
| 文档服务 | 文档解析、分块、索引管理 | Celery + MinIO |
| 用户服务 | 身份认证、权限管理 | FastAPI + PostgreSQL |
| 反馈服务 | 收集反馈、数据分析 | FastAPI + PostgreSQL |

---

## 深入设计（25分钟）

### 1. 文档处理Pipeline

**面试官**：详细说说文档是如何被处理和索引的？

**候选人**：文档处理是一个异步Pipeline：

```python
# 文档处理流程
class DocumentProcessor:
    """文档处理Pipeline"""
    
    async def process(self, doc_id: str, file_path: str, metadata: dict):
        """
        完整的文档处理流程
        """
        # 1. 解析文档
        content = await self._parse_document(file_path)
        
        # 2. 文本清洗
        cleaned = await self._clean_text(content)
        
        # 3. 智能分块
        chunks = await self._smart_chunking(cleaned, metadata)
        
        # 4. 生成Embedding
        embeddings = await self._generate_embeddings(chunks)
        
        # 5. 存储到向量数据库
        await self._store_vectors(doc_id, chunks, embeddings, metadata)
        
        # 6. 更新搜索索引
        await self._update_search_index(doc_id, chunks, metadata)
        
        return {"doc_id": doc_id, "chunk_count": len(chunks)}
    
    async def _parse_document(self, file_path: str) -> str:
        """根据文件类型选择解析器"""
        parsers = {
            ".pdf": PDFParser(),
            ".docx": WordParser(),
            ".md": MarkdownParser(),
            ".html": HTMLParser()
        }
        ext = Path(file_path).suffix.lower()
        parser = parsers.get(ext, DefaultParser())
        return await parser.parse(file_path)
    
    async def _smart_chunking(self, text: str, metadata: dict) -> list[Chunk]:
        """智能分块：保持语义完整性"""
        # 首先按章节/段落分割
        sections = self._split_by_structure(text)
        
        chunks = []
        for section in sections:
            if len(section.content) <= MAX_CHUNK_SIZE:
                chunks.append(section)
            else:
                # 大段落递归分割
                sub_chunks = self._recursive_split(
                    section.content,
                    chunk_size=512,
                    overlap=50
                )
                for i, sub in enumerate(sub_chunks):
                    chunks.append(Chunk(
                        content=sub,
                        metadata={
                            **metadata,
                            "section_title": section.title,
                            "chunk_index": i
                        }
                    ))
        
        return chunks
```

**分块策略设计**：

```
文档结构感知分块：

原始文档：
┌─────────────────────────────────────┐
│ # 产品使用指南                       │ ← 一级标题
│                                     │
│ ## 1. 安装步骤                      │ ← 二级标题
│ 1.1 系统要求                        │
│ [详细内容...]                       │
│                                     │
│ ## 2. 基本配置                      │
│ 2.1 账号设置                        │
│ [详细内容...]                       │
└─────────────────────────────────────┘

分块结果：
┌─────────────────────────────────────┐
│ Chunk 1:                            │
│ [标题上下文] # 产品使用指南 > 安装步骤 │
│ [内容] 1.1 系统要求...               │
│ [元数据] section: "安装步骤"         │
├─────────────────────────────────────┤
│ Chunk 2:                            │
│ [标题上下文] # 产品使用指南 > 基本配置 │
│ [内容] 2.1 账号设置...               │
│ [元数据] section: "基本配置"         │
└─────────────────────────────────────┘
```

---

### 2. 检索服务设计

**面试官**：检索服务如何实现高效和高质量的检索？

**候选人**：检索服务采用多路召回 + 重排序的架构：

```python
class RetrievalService:
    def __init__(
        self,
        vector_store: Milvus,
        keyword_store: Elasticsearch,
        reranker: CrossEncoder,
        embedding_model: EmbeddingModel
    ):
        self.vector_store = vector_store
        self.keyword_store = keyword_store
        self.reranker = reranker
        self.embedding_model = embedding_model
    
    async def search(
        self,
        query: str,
        user_context: UserContext,
        top_k: int = 20,
        top_n: int = 5
    ) -> list[SearchResult]:
        """
        混合检索流程：
        1. 并行执行向量检索和关键词检索
        2. 权限过滤
        3. 结果融合
        4. 重排序
        """
        
        # 1. 并行检索
        vector_task = self._vector_search(query, top_k * 2)
        keyword_task = self._keyword_search(query, top_k * 2)
        
        vector_results, keyword_results = await asyncio.gather(
            vector_task, keyword_task
        )
        
        # 2. 权限过滤
        vector_results = self._filter_by_permission(
            vector_results, user_context
        )
        keyword_results = self._filter_by_permission(
            keyword_results, user_context
        )
        
        # 3. RRF融合
        fused = self._rrf_fusion(
            [vector_results, keyword_results],
            weights=[0.7, 0.3]  # 向量权重更高
        )[:top_k]
        
        # 4. 重排序
        reranked = await self._rerank(query, fused)
        
        return reranked[:top_n]
    
    async def _vector_search(self, query: str, top_k: int) -> list[dict]:
        # 生成查询向量
        query_embedding = await self.embedding_model.embed(query)
        
        # Milvus检索
        results = self.vector_store.search(
            collection_name="documents",
            query_vectors=[query_embedding],
            top_k=top_k,
            output_fields=["doc_id", "content", "metadata"]
        )
        
        return [
            {
                "doc_id": r.doc_id,
                "content": r.content,
                "metadata": r.metadata,
                "score": r.distance,
                "source": "vector"
            }
            for r in results
        ]
    
    async def _keyword_search(self, query: str, top_k: int) -> list[dict]:
        # Elasticsearch BM25检索
        results = self.keyword_store.search(
            index="documents",
            body={
                "query": {
                    "multi_match": {
                        "query": query,
                        "fields": ["content^2", "title^3", "metadata.tags"],
                        "type": "best_fields"
                    }
                },
                "size": top_k
            }
        )
        
        return [
            {
                "doc_id": hit["_source"]["doc_id"],
                "content": hit["_source"]["content"],
                "metadata": hit["_source"]["metadata"],
                "score": hit["_score"],
                "source": "keyword"
            }
            for hit in results["hits"]["hits"]
        ]
    
    def _filter_by_permission(
        self, results: list[dict], user_context: UserContext
    ) -> list[dict]:
        """基于用户权限过滤结果"""
        filtered = []
        for r in results:
            doc_permissions = r["metadata"].get("permissions", {})
            
            # 检查部门权限
            if "allowed_departments" in doc_permissions:
                if user_context.department not in doc_permissions["allowed_departments"]:
                    continue
            
            # 检查职级权限
            if "min_level" in doc_permissions:
                if user_context.level < doc_permissions["min_level"]:
                    continue
            
            filtered.append(r)
        
        return filtered
```

**数据模型设计**：

```sql
-- PostgreSQL: 文档元数据
CREATE TABLE documents (
    id UUID PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    source_path VARCHAR(1000),
    file_type VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- 权限控制
    allowed_departments TEXT[],
    min_access_level INTEGER DEFAULT 0,
    
    -- 元数据
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_documents_departments ON documents USING GIN (allowed_departments);

-- PostgreSQL: 文档块
CREATE TABLE document_chunks (
    id UUID PRIMARY KEY,
    document_id UUID REFERENCES documents(id),
    chunk_index INTEGER,
    content TEXT NOT NULL,
    
    -- 分块元数据
    section_title VARCHAR(500),
    char_count INTEGER,
    
    -- 向量ID（指向Milvus中的记录）
    vector_id VARCHAR(100)
);

CREATE INDEX idx_chunks_document_id ON document_chunks(document_id);
```

```python
# Milvus: 向量存储Schema
from pymilvus import CollectionSchema, FieldSchema, DataType

fields = [
    FieldSchema(name="id", dtype=DataType.VARCHAR, max_length=100, is_primary=True),
    FieldSchema(name="document_id", dtype=DataType.VARCHAR, max_length=100),
    FieldSchema(name="chunk_id", dtype=DataType.VARCHAR, max_length=100),
    FieldSchema(name="embedding", dtype=DataType.FLOAT_VECTOR, dim=1536),
    # 标量字段用于过滤
    FieldSchema(name="department", dtype=DataType.VARCHAR, max_length=100),
    FieldSchema(name="access_level", dtype=DataType.INT64),
]

schema = CollectionSchema(fields, description="Document chunks with embeddings")
```

---

### 3. 对话服务设计

**面试官**：对话服务如何管理会话和实现流式响应？

**候选人**：对话服务是用户交互的核心：

```python
class ConversationService:
    def __init__(
        self,
        redis: Redis,
        retrieval_service: RetrievalService,
        llm_service: LLMService
    ):
        self.redis = redis
        self.retrieval = retrieval_service
        self.llm = llm_service
    
    async def chat(
        self,
        session_id: str,
        user_message: str,
        user_context: UserContext
    ) -> AsyncGenerator[str, None]:
        """
        处理用户消息，返回流式响应
        """
        # 1. 加载会话历史
        history = await self._load_history(session_id)
        
        # 2. 查询改写（基于历史上下文）
        enhanced_query = await self._enhance_query(user_message, history)
        
        # 3. 检索相关文档
        search_results = await self.retrieval.search(
            query=enhanced_query,
            user_context=user_context
        )
        
        # 4. 构建Prompt
        prompt = self._build_prompt(
            user_message=user_message,
            history=history,
            context=search_results
        )
        
        # 5. 流式生成响应
        full_response = ""
        async for chunk in self.llm.stream_generate(prompt):
            full_response += chunk
            yield chunk
        
        # 6. 保存对话记录
        await self._save_turn(
            session_id=session_id,
            user_message=user_message,
            assistant_message=full_response,
            context=search_results
        )
        
        # 7. 返回来源引用
        sources = self._format_sources(search_results)
        yield f"\n\n---\n📚 参考来源：\n{sources}"
    
    async def _load_history(self, session_id: str) -> list[dict]:
        """加载会话历史，最多保留最近10轮"""
        key = f"session:{session_id}:history"
        history = await self.redis.lrange(key, -20, -1)  # 20条消息 = 10轮对话
        return [json.loads(h) for h in history]
    
    async def _enhance_query(self, query: str, history: list[dict]) -> str:
        """基于历史上下文改写查询"""
        if not history:
            return query
        
        # 使用LLM理解上下文并改写查询
        recent_history = history[-6:]  # 最近3轮
        history_text = "\n".join([
            f"{m['role']}: {m['content']}" for m in recent_history
        ])
        
        prompt = f"""
基于以下对话历史，改写用户最新的问题，使其成为一个独立完整的查询。
如果问题已经完整，保持原样。

对话历史：
{history_text}

用户最新问题：{query}

改写后的独立查询（只输出查询本身，不要其他内容）：
"""
        
        enhanced = await self.llm.generate(prompt, temperature=0)
        return enhanced.strip()
    
    def _build_prompt(
        self,
        user_message: str,
        history: list[dict],
        context: list[SearchResult]
    ) -> list[dict]:
        """构建对话Prompt"""
        
        system_prompt = """
你是企业知识库助手，帮助员工查询公司内部信息。

【重要规则】
1. 只基于提供的参考资料回答问题
2. 如果资料中没有相关信息，明确告知用户
3. 在回答中使用[1][2]等标注引用来源
4. 保持专业、友好的语气
5. 如果问题涉及敏感信息，提醒用户注意信息安全

【参考资料】
{context}
"""
        
        # 格式化上下文
        context_text = "\n\n".join([
            f"[{i+1}] {r.content}\n来源：{r.metadata.get('title', '未知')}"
            for i, r in enumerate(context)
        ])
        
        messages = [
            {"role": "system", "content": system_prompt.format(context=context_text)}
        ]
        
        # 添加历史对话（最近5轮）
        for msg in history[-10:]:
            messages.append({"role": msg["role"], "content": msg["content"]})
        
        # 添加当前问题
        messages.append({"role": "user", "content": user_message})
        
        return messages
    
    async def _save_turn(
        self,
        session_id: str,
        user_message: str,
        assistant_message: str,
        context: list[SearchResult]
    ):
        """保存对话轮次"""
        key = f"session:{session_id}:history"
        
        # 保存用户消息
        await self.redis.rpush(key, json.dumps({
            "role": "user",
            "content": user_message,
            "timestamp": datetime.now().isoformat()
        }))
        
        # 保存助手消息
        await self.redis.rpush(key, json.dumps({
            "role": "assistant",
            "content": assistant_message,
            "timestamp": datetime.now().isoformat(),
            "sources": [r.doc_id for r in context]
        }))
        
        # 设置过期时间（24小时）
        await self.redis.expire(key, 86400)
```

---

### 4. 扩展性设计

**面试官**：如果用户量增长10倍，系统需要如何扩展？

**候选人**：扩展策略如下：

```
当前规模：
- 1万用户
- 日均5万查询
- 峰值QPS: ~50

10倍增长后：
- 10万用户
- 日均50万查询
- 峰值QPS: ~500
```

**水平扩展方案**：

```yaml
# Kubernetes部署配置示例

# 1. 对话服务 - 无状态，可水平扩展
apiVersion: apps/v1
kind: Deployment
metadata:
  name: conversation-service
spec:
  replicas: 10  # 根据负载自动调整
  template:
    spec:
      containers:
      - name: conversation
        resources:
          requests:
            cpu: "500m"
            memory: "1Gi"
---
# HPA自动伸缩
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: conversation-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: conversation-service
  minReplicas: 3
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

**数据层扩展**：

```
1. Redis集群
   - 从单节点升级为Redis Cluster
   - 6节点（3主3从）
   - 内存从8GB扩展到48GB

2. Milvus集群
   - 从单机升级为分布式部署
   - 3个Query Node处理查询
   - 2个Data Node处理写入
   - 配置分片（Sharding）

3. PostgreSQL
   - 读写分离（1主2从）
   - 热点数据缓存到Redis
   - 考虑分库分表（如果需要）
```

**性能优化策略**：

```python
# 1. 语义缓存 - 减少LLM调用
class SemanticCache:
    async def get_or_compute(self, query: str, compute_fn):
        # 查找语义相似的缓存
        similar = await self.find_similar(query, threshold=0.95)
        if similar:
            return similar.answer
        
        answer = await compute_fn(query)
        await self.store(query, answer)
        return answer

# 2. 请求合并 - 减少Embedding调用
class EmbeddingBatcher:
    def __init__(self, batch_size=32, max_wait_ms=10):
        self.batch_size = batch_size
        self.max_wait_ms = max_wait_ms
        self.pending = []
        self.lock = asyncio.Lock()
    
    async def embed(self, text: str) -> list[float]:
        future = asyncio.Future()
        
        async with self.lock:
            self.pending.append((text, future))
            
            if len(self.pending) >= self.batch_size:
                await self._flush()
        
        # 设置超时自动flush
        asyncio.create_task(self._auto_flush())
        
        return await future

# 3. 预热 - 减少冷启动延迟
async def warm_up():
    # 预加载Embedding模型
    await embedding_model.load()
    
    # 预热向量数据库连接
    await milvus.warm_up()
    
    # 缓存高频问题
    top_questions = await get_top_questions(limit=1000)
    for q in top_questions:
        await semantic_cache.warm_up(q)
```

---

### 5. 监控与可观测性

**面试官**：如何保证系统的稳定性？

**候选人**：建立完整的可观测性体系：

```python
# 关键指标监控
class Metrics:
    # 请求指标
    request_latency = Histogram(
        "request_latency_seconds",
        "Request latency",
        ["service", "endpoint"]
    )
    
    request_count = Counter(
        "request_total",
        "Total requests",
        ["service", "endpoint", "status"]
    )
    
    # AI特有指标
    retrieval_recall = Gauge(
        "retrieval_recall",
        "Retrieval recall rate"
    )
    
    llm_tokens = Counter(
        "llm_tokens_total",
        "LLM tokens used",
        ["model", "type"]  # type: prompt/completion
    )
    
    answer_quality = Histogram(
        "answer_quality_score",
        "Answer quality score from user feedback"
    )

# 链路追踪
from opentelemetry import trace

tracer = trace.get_tracer(__name__)

async def chat(query: str):
    with tracer.start_as_current_span("chat") as span:
        span.set_attribute("query_length", len(query))
        
        with tracer.start_as_current_span("retrieval"):
            docs = await retrieve(query)
            span.set_attribute("docs_count", len(docs))
        
        with tracer.start_as_current_span("llm_generation"):
            answer = await generate(docs, query)
            span.set_attribute("answer_length", len(answer))
        
        return answer
```

**告警规则**：

```yaml
# Prometheus告警规则
groups:
- name: knowledge-base-alerts
  rules:
  # 延迟告警
  - alert: HighLatency
    expr: histogram_quantile(0.95, request_latency_seconds) > 5
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "P95延迟超过5秒"
  
  # 错误率告警
  - alert: HighErrorRate
    expr: rate(request_total{status="error"}[5m]) / rate(request_total[5m]) > 0.05
    for: 5m
    labels:
      severity: critical
    annotations:
      summary: "错误率超过5%"
  
  # LLM调用失败
  - alert: LLMFailure
    expr: rate(llm_requests_total{status="error"}[5m]) > 0
    for: 2m
    labels:
      severity: critical
    annotations:
      summary: "LLM调用失败"
```

---

## 权衡讨论（10分钟）

**面试官**：这个设计有什么权衡和局限性？

**候选人**：主要的权衡包括：

**1. 私有部署 vs 托管服务**

```
选择：私有部署（企业要求）
优势：数据安全、可控性强
代价：运维成本高、迭代慢
替代方案：如果合规允许，托管服务能更快上线
```

**2. 实时性 vs 成本**

```
选择：异步索引 + 语义缓存
优势：成本可控，性能稳定
代价：文档更新有延迟（小时级）
如果需要实时性：可用增量索引 + WebSocket推送
```

**3. 精度 vs 延迟**

```
选择：多路召回 + 重排序
优势：检索质量高
代价：增加约200ms延迟
如果延迟敏感：可跳过重排序，牺牲部分精度
```

**未覆盖的点**：

1. **多语言支持**：当前设计主要针对中文
2. **多模态**：图片、表格等非文本内容处理
3. **离线访问**：移动端离线场景
4. **个性化**：基于用户历史的个性化排序

---

## 结束（3分钟）

**面试官**：总结一下你的设计。

**候选人**：这是一个典型的企业级RAG系统设计：

**核心架构**：
- 微服务架构，各服务独立扩展
- 多路召回 + 重排序的检索策略
- 流式响应 + 语义缓存的性能优化
- 基于RBAC的权限控制

**关键决策**：
- Milvus作为向量数据库（扩展性）
- 混合检索（向量+关键词）提高召回率
- Redis管理会话状态（低延迟）
- Kubernetes部署（弹性伸缩）

**扩展能力**：
- 水平扩展支持10倍增长
- 完整的监控告警体系
- 支持高可用部署（99.9%）

**面试官**：很好，设计比较全面。面试就到这里。

---

## 面试评估

| 评估维度 | 评分 | 评语 |
|---------|------|------|
| 需求理解 | ⭐⭐⭐⭐⭐ | 主动澄清需求，理解全面 |
| 架构设计 | ⭐⭐⭐⭐⭐ | 架构清晰，组件职责明确 |
| 技术深度 | ⭐⭐⭐⭐⭐ | 对RAG、向量数据库理解深入 |
| 扩展性 | ⭐⭐⭐⭐ | 有清晰的扩展策略 |
| 权衡分析 | ⭐⭐⭐⭐⭐ | 能客观分析设计的优缺点 |

**总体评价**：系统设计能力优秀，对AI应用架构有深入理解，建议录用。
