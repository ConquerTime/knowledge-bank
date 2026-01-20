# 面试模拟 4：AI技术深度 - RAG系统

> **面试类型**：技术深度面试  
> **时长**：60分钟  
> **面试官**：AI架构师  
> **考察重点**：RAG架构设计、向量数据库、检索优化、工程实践

---

## 开场（3分钟）

**面试官**：你好，今天我们深入聊聊RAG（检索增强生成）。你在这方面有什么实践经验？

**候选人**：您好！RAG是我过去项目中的核心技术。在智能客服项目中，我主导设计了一套企业知识库问答系统，主要经验包括：
1. 处理了5万+篇技术文档，日均响应10万+次查询
2. 设计了多级检索架构，将相关性准确率从65%提升到92%
3. 实现了增量索引更新，支持实时文档同步
4. 优化了检索延迟，P95从2秒降到200毫秒

---

## 第一部分：RAG基础架构（15分钟）

### 问题1：RAG工作原理

**面试官**：请描述一下RAG的完整工作流程，以及相比直接使用LLM的优势。

**候选人**：RAG通过将检索到的外部知识注入到LLM的上下文中，增强模型的回答能力。

**完整工作流程**：

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         RAG 系统架构                                      │
└─────────────────────────────────────────────────────────────────────────┘

离线索引流程（Indexing Pipeline）:
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│ 文档加载  │ → │ 文档解析  │ → │ 文本分块  │ → │ 向量化   │ → │ 存储索引  │
│ Loaders  │   │ Parsers  │   │ Chunking │   │ Embedding│   │ VectorDB │
└──────────┘   └──────────┘   └──────────┘   └──────────┘   └──────────┘

在线查询流程（Query Pipeline）:
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│ 用户查询  │ → │ 查询处理  │ → │ 向量检索  │ → │ 重排序   │ → │ LLM生成  │
│ Question │   │ Rewrite  │   │ Retrieval│   │ Rerank   │   │ Generate │
└──────────┘   └──────────┘   └──────────┘   └──────────┘   └──────────┘
                    │               │              │              │
                    ▼               ▼              ▼              ▼
              查询扩展/改写    Top-K候选     精排序Top-N    上下文注入
```

**代码实现示例**：

```python
class RAGPipeline:
    def __init__(
        self,
        embedding_model: EmbeddingModel,
        vector_store: VectorStore,
        reranker: Reranker,
        llm: LLM
    ):
        self.embedding_model = embedding_model
        self.vector_store = vector_store
        self.reranker = reranker
        self.llm = llm
    
    async def query(self, question: str, top_k: int = 20, top_n: int = 5) -> str:
        # 1. 查询向量化
        query_embedding = await self.embedding_model.embed(question)
        
        # 2. 向量检索（召回阶段）
        candidates = await self.vector_store.search(
            embedding=query_embedding,
            top_k=top_k  # 先召回较多候选
        )
        
        # 3. 重排序（精排阶段）
        reranked = await self.reranker.rerank(
            query=question,
            documents=candidates,
            top_n=top_n  # 精选最相关的
        )
        
        # 4. 构建上下文
        context = self._build_context(reranked)
        
        # 5. LLM生成
        prompt = self._build_prompt(question, context)
        answer = await self.llm.generate(prompt)
        
        return answer
    
    def _build_context(self, documents: list[Document]) -> str:
        context_parts = []
        for i, doc in enumerate(documents, 1):
            context_parts.append(f"[{i}] {doc.content}\n来源: {doc.metadata['source']}")
        return "\n\n".join(context_parts)
    
    def _build_prompt(self, question: str, context: str) -> str:
        return f"""基于以下参考资料回答问题。请在回答中引用来源编号。
如果资料中没有相关信息，请明确说明。

参考资料：
{context}

问题：{question}

回答："""
```

**RAG相比直接使用LLM的优势**：

| 方面 | 直接LLM | RAG |
|------|---------|-----|
| 知识时效 | 截止训练日期 | 实时更新 |
| 领域知识 | 通用知识 | 可注入专业知识 |
| 幻觉控制 | 容易幻觉 | 有据可查，可追溯 |
| 数据隐私 | 数据需发送到模型 | 可本地检索 |
| 成本 | 需要大上下文 | 精准检索节省Token |
| 可解释性 | 黑盒 | 可展示来源 |

---

### 问题2：文档处理

**面试官**：文档分块（Chunking）有哪些策略？如何选择合适的分块大小？

**候选人**：分块策略直接影响检索质量，需要根据文档类型和使用场景选择。

**主要分块策略**：

**1. 固定大小分块（Fixed Size）**

```python
def fixed_size_chunking(text: str, chunk_size: int = 500, overlap: int = 50) -> list[str]:
    """简单但可能破坏语义完整性"""
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start = end - overlap
    return chunks
```

**2. 基于分隔符分块（Separator Based）**

```python
def separator_chunking(
    text: str, 
    separators: list[str] = ["\n\n", "\n", "。", ". "],
    chunk_size: int = 500
) -> list[str]:
    """按自然分隔符分割，保持语义完整"""
    chunks = []
    current_chunk = ""
    
    # 递归分割
    for separator in separators:
        if separator in text:
            parts = text.split(separator)
            for part in parts:
                if len(current_chunk) + len(part) < chunk_size:
                    current_chunk += part + separator
                else:
                    if current_chunk:
                        chunks.append(current_chunk.strip())
                    current_chunk = part + separator
            break
    
    if current_chunk:
        chunks.append(current_chunk.strip())
    
    return chunks
```

**3. 递归字符分块（Recursive Character）**

```python
from langchain.text_splitter import RecursiveCharacterTextSplitter

splitter = RecursiveCharacterTextSplitter(
    chunk_size=500,
    chunk_overlap=50,
    separators=["\n\n", "\n", "。", ".", " ", ""],  # 按优先级尝试
    length_function=len
)

chunks = splitter.split_text(document)
```

**4. 语义分块（Semantic Chunking）**

```python
async def semantic_chunking(text: str, threshold: float = 0.8) -> list[str]:
    """基于语义相似度分块"""
    sentences = split_into_sentences(text)
    
    chunks = []
    current_chunk = [sentences[0]]
    current_embedding = await embed(sentences[0])
    
    for sentence in sentences[1:]:
        sentence_embedding = await embed(sentence)
        similarity = cosine_similarity(current_embedding, sentence_embedding)
        
        if similarity > threshold:
            # 语义相近，加入当前块
            current_chunk.append(sentence)
            # 更新块的embedding为平均
            current_embedding = average_embedding(current_chunk)
        else:
            # 语义断裂，开始新块
            chunks.append(" ".join(current_chunk))
            current_chunk = [sentence]
            current_embedding = sentence_embedding
    
    if current_chunk:
        chunks.append(" ".join(current_chunk))
    
    return chunks
```

**5. 文档结构感知分块**

```python
def structure_aware_chunking(document: Document) -> list[Chunk]:
    """保持文档结构，如标题-内容层级"""
    chunks = []
    
    for section in document.sections:
        # 保留章节标题作为上下文
        header_context = f"# {section.title}"
        
        if section.parent:
            header_context = f"# {section.parent.title}\n## {section.title}"
        
        # 分块时附带标题上下文
        section_chunks = split_content(section.content)
        for chunk in section_chunks:
            chunks.append(Chunk(
                content=chunk,
                metadata={
                    "header": header_context,
                    "section_title": section.title,
                    "document_title": document.title
                }
            ))
    
    return chunks
```

**分块大小选择指南**：

| 场景 | 推荐大小 | 原因 |
|------|---------|------|
| 精确问答 | 200-500 tokens | 更精准的定位 |
| 摘要生成 | 500-1000 tokens | 需要更完整的上下文 |
| 代码文档 | 按函数/类分块 | 保持代码完整性 |
| 法律文档 | 按条款分块 | 法律条款需要完整 |
| 对话历史 | 按轮次分块 | 保持对话上下文 |

**我们项目的最佳实践**：

```python
class AdaptiveChunker:
    """根据文档类型自适应选择分块策略"""
    
    def chunk(self, document: Document) -> list[Chunk]:
        doc_type = self._detect_type(document)
        
        if doc_type == "code":
            return self._chunk_code(document)
        elif doc_type == "legal":
            return self._chunk_legal(document)
        elif doc_type == "markdown":
            return self._chunk_markdown(document)
        else:
            return self._chunk_default(document)
    
    def _chunk_code(self, document: Document) -> list[Chunk]:
        """代码按AST结构分块"""
        tree = parse_code(document.content)
        chunks = []
        for node in tree.functions + tree.classes:
            chunks.append(Chunk(
                content=node.source_code,
                metadata={
                    "type": node.type,
                    "name": node.name,
                    "docstring": node.docstring
                }
            ))
        return chunks
```

---

## 第二部分：向量数据库（12分钟）

### 问题3：向量检索原理

**面试官**：向量数据库的ANN（近似最近邻）算法有哪些？各有什么特点？

**候选人**：ANN算法是向量数据库的核心，平衡精度和速度。

**主要ANN算法**：

**1. HNSW（Hierarchical Navigable Small World）**

```
层级结构示意：
Layer 2:    A ─────────────── B
            │                 │
Layer 1:    A ─── C ─── D ─── B
            │    │     │     │
Layer 0:    A-E-C-F-G-D-H-I-B-J

搜索过程：从顶层开始，逐层向下，每层找最近的点
```

**特点**：
- ✅ 搜索速度快（对数复杂度）
- ✅ 召回率高（通常>95%）
- ✅ 支持增量插入
- ❌ 内存消耗大
- ❌ 构建索引慢

```python
# Milvus HNSW配置示例
index_params = {
    "metric_type": "COSINE",
    "index_type": "HNSW",
    "params": {
        "M": 16,  # 每个节点的最大连接数，越大精度越高但内存越大
        "efConstruction": 256  # 构建时搜索宽度，影响构建质量和速度
    }
}
```

**2. IVF（Inverted File Index）**

```
将向量空间划分为多个聚类（Voronoi cells）：
┌───────┬───────┬───────┐
│  C1   │  C2   │  C3   │
│ ●●●   │  ●●   │ ●●●●  │
├───────┼───────┼───────┤
│  C4   │  C5   │  C6   │
│ ●●●●  │  ●●●  │ ●●    │
└───────┴───────┴───────┘

搜索：先找最近的K个聚类，再在这些聚类内搜索
```

**特点**：
- ✅ 内存效率高
- ✅ 适合大规模数据
- ❌ 需要预先训练聚类中心
- ❌ 边界问题（目标可能在相邻聚类）

```python
# Milvus IVF_FLAT配置
index_params = {
    "metric_type": "L2",
    "index_type": "IVF_FLAT",
    "params": {
        "nlist": 1024  # 聚类数量
    }
}

search_params = {
    "nprobe": 16  # 搜索时探测的聚类数，越大精度越高但越慢
}
```

**3. IVF_PQ（IVF + Product Quantization）**

```
向量压缩：将向量分段量化
原始向量: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]
分段:      [0.1, 0.2] [0.3, 0.4] [0.5, 0.6] [0.7, 0.8]
量化:      码本ID: [3, 7, 2, 5]  # 用码本ID代替原始向量
```

**特点**：
- ✅ 极大减少内存使用（可压缩32倍）
- ✅ 适合十亿级数据
- ❌ 精度有损失

**4. ScaNN（Google）**

结合了量化和剪枝技术，在精度和速度间取得更好平衡。

**选型建议**：

| 数据规模 | 内存约束 | 推荐算法 |
|---------|---------|---------|
| <100万 | 充足 | HNSW |
| 100万-1亿 | 中等 | IVF_FLAT |
| >1亿 | 有限 | IVF_PQ |
| 需要高精度 | 充足 | HNSW (高M值) |
| 需要极速 | 充足 | HNSW (高ef值) |

---

### 问题4：向量数据库选型

**面试官**：主流向量数据库有什么区别？如何为项目选择？

**候选人**：向量数据库选型需要考虑多个维度：

**主流产品对比**：

| 产品 | 部署模式 | 特点 | 适用场景 |
|------|---------|------|---------|
| **Pinecone** | 全托管 | 易用，开箱即用 | 快速原型，中小规模 |
| **Milvus** | 自部署/云 | 功能全面，可扩展 | 大规模生产环境 |
| **Weaviate** | 自部署/云 | GraphQL API，多模态 | 复杂查询场景 |
| **Chroma** | 嵌入式 | 轻量，开发友好 | 本地开发，小项目 |
| **pgvector** | PostgreSQL扩展 | 与现有PG集成 | 已有PG，规模适中 |
| **Qdrant** | 自部署/云 | 高性能，Rust实现 | 性能敏感场景 |

**详细对比**：

```python
# 1. Pinecone - 托管服务，最易用
import pinecone

pinecone.init(api_key="xxx", environment="us-west1-gcp")
index = pinecone.Index("my-index")

# 插入
index.upsert(vectors=[
    {"id": "doc1", "values": embedding, "metadata": {"source": "file.pdf"}}
])

# 搜索
results = index.query(vector=query_embedding, top_k=5, include_metadata=True)
```

```python
# 2. Milvus - 功能最全面
from pymilvus import connections, Collection, FieldSchema, CollectionSchema, DataType

connections.connect("default", host="localhost", port="19530")

# 定义Schema
fields = [
    FieldSchema(name="id", dtype=DataType.INT64, is_primary=True),
    FieldSchema(name="embedding", dtype=DataType.FLOAT_VECTOR, dim=1536),
    FieldSchema(name="content", dtype=DataType.VARCHAR, max_length=65535),
]
schema = CollectionSchema(fields)
collection = Collection("documents", schema)

# 创建索引
collection.create_index("embedding", {
    "index_type": "HNSW",
    "metric_type": "COSINE",
    "params": {"M": 16, "efConstruction": 256}
})

# 混合搜索（向量+标量过滤）
results = collection.search(
    data=[query_embedding],
    anns_field="embedding",
    param={"metric_type": "COSINE", "params": {"ef": 64}},
    limit=10,
    expr="category == 'technical'",  # 标量过滤
    output_fields=["content"]
)
```

```python
# 3. pgvector - PostgreSQL集成
import psycopg2

conn = psycopg2.connect("postgresql://localhost/mydb")
cur = conn.cursor()

# 创建表
cur.execute("""
    CREATE TABLE documents (
        id SERIAL PRIMARY KEY,
        content TEXT,
        embedding vector(1536)
    );
    CREATE INDEX ON documents USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
""")

# 搜索
cur.execute("""
    SELECT id, content, 1 - (embedding <=> %s) as similarity
    FROM documents
    ORDER BY embedding <=> %s
    LIMIT 5
""", (query_embedding, query_embedding))
```

**选型决策树**：

```python
def choose_vector_db(requirements: dict) -> str:
    """
    requirements = {
        "scale": "small/medium/large",  # <10万/10万-1000万/>1000万
        "deployment": "cloud/self-hosted",
        "existing_db": "postgresql/none/other",
        "budget": "low/medium/high",
        "features": ["hybrid_search", "multi_tenancy", "real_time_update"],
        "team_expertise": "low/medium/high"
    }
    """
    
    # 快速原型或小规模
    if requirements["scale"] == "small" and requirements["team_expertise"] == "low":
        return "chroma"  # 最简单
    
    # 已有PostgreSQL
    if requirements["existing_db"] == "postgresql" and requirements["scale"] != "large":
        return "pgvector"  # 无需额外基础设施
    
    # 托管优先
    if requirements["deployment"] == "cloud" and requirements["budget"] != "low":
        return "pinecone"  # 全托管，省心
    
    # 大规模生产环境
    if requirements["scale"] == "large":
        return "milvus"  # 最成熟的大规模方案
    
    # 需要高性能
    if "real_time_update" in requirements["features"]:
        return "qdrant"  # 实时更新性能好
    
    return "weaviate"  # 默认选择，功能均衡
```

---

## 第三部分：检索优化（15分钟）

### 问题5：多路召回

**面试官**：单纯的向量检索有什么局限？如何优化？

**候选人**：单纯向量检索的局限性和优化方案：

**向量检索的局限**：

1. **词汇不匹配**：专有名词、缩写、新词可能embedding效果差
2. **精确匹配弱**：如搜索特定型号"iPhone 15 Pro Max"
3. **语义漂移**：短查询embedding可能不准确
4. **稀有概念**：训练数据中少见的概念表示不好

**优化方案：多路召回（Hybrid Search）**

```python
class HybridRetriever:
    def __init__(
        self,
        vector_store: VectorStore,
        bm25_index: BM25Index,
        reranker: Reranker
    ):
        self.vector_store = vector_store
        self.bm25_index = bm25_index
        self.reranker = reranker
    
    async def search(
        self,
        query: str,
        top_k: int = 20,
        top_n: int = 5,
        vector_weight: float = 0.7,
        bm25_weight: float = 0.3
    ) -> list[Document]:
        # 1. 向量检索
        vector_results = await self.vector_store.search(query, top_k)
        
        # 2. BM25关键词检索
        bm25_results = await self.bm25_index.search(query, top_k)
        
        # 3. 结果融合（RRF - Reciprocal Rank Fusion）
        fused_results = self._rrf_fusion(
            [vector_results, bm25_results],
            weights=[vector_weight, bm25_weight]
        )
        
        # 4. 重排序
        reranked = await self.reranker.rerank(query, fused_results[:top_k])
        
        return reranked[:top_n]
    
    def _rrf_fusion(
        self,
        result_lists: list[list[Document]],
        weights: list[float],
        k: int = 60
    ) -> list[Document]:
        """Reciprocal Rank Fusion"""
        doc_scores = {}
        
        for results, weight in zip(result_lists, weights):
            for rank, doc in enumerate(results):
                if doc.id not in doc_scores:
                    doc_scores[doc.id] = {"doc": doc, "score": 0}
                # RRF公式：1 / (k + rank)
                doc_scores[doc.id]["score"] += weight / (k + rank + 1)
        
        # 按融合分数排序
        sorted_docs = sorted(
            doc_scores.values(),
            key=lambda x: x["score"],
            reverse=True
        )
        
        return [item["doc"] for item in sorted_docs]
```

**查询扩展与改写**：

```python
class QueryProcessor:
    def __init__(self, llm: LLM):
        self.llm = llm
    
    async def expand_query(self, query: str) -> list[str]:
        """生成多个相关查询"""
        prompt = f"""
为以下查询生成3个语义相似但表达不同的查询变体，用于搜索。
每个变体一行，不要编号。

原始查询：{query}

变体："""
        
        response = await self.llm.generate(prompt, temperature=0.7)
        variants = response.strip().split("\n")
        
        return [query] + variants[:3]
    
    async def rewrite_query(self, query: str, context: str = "") -> str:
        """重写查询使其更适合检索"""
        prompt = f"""
请重写以下查询，使其更适合在知识库中搜索。
- 补充隐含信息
- 使用更精确的术语
- 保持原意

{"上下文：" + context if context else ""}

原始查询：{query}

重写后的查询："""
        
        return await self.llm.generate(prompt, temperature=0.3)
    
    async def decompose_query(self, query: str) -> list[str]:
        """将复杂查询分解为子查询"""
        prompt = f"""
将以下复杂问题分解为更简单的子问题，每个子问题可以独立回答。
如果问题已经足够简单，只返回原问题。

问题：{query}

子问题（每行一个）："""
        
        response = await self.llm.generate(prompt, temperature=0.3)
        sub_queries = response.strip().split("\n")
        
        return sub_queries if len(sub_queries) > 1 else [query]
```

**完整的优化Pipeline**：

```python
class OptimizedRAGPipeline:
    async def query(self, question: str) -> str:
        # 1. 查询理解与改写
        rewritten_query = await self.query_processor.rewrite_query(question)
        
        # 2. 查询扩展
        query_variants = await self.query_processor.expand_query(rewritten_query)
        
        # 3. 多路召回
        all_candidates = []
        for variant in query_variants:
            results = await self.hybrid_retriever.search(variant, top_k=10)
            all_candidates.extend(results)
        
        # 4. 去重
        unique_candidates = self._deduplicate(all_candidates)
        
        # 5. 重排序
        reranked = await self.reranker.rerank(question, unique_candidates)
        
        # 6. 生成回答
        context = self._build_context(reranked[:5])
        answer = await self.llm.generate(
            self._build_prompt(question, context)
        )
        
        return answer
```

---

### 问题6：重排序

**面试官**：重排序（Reranking）为什么重要？有哪些实现方式？

**候选人**：重排序是提升检索质量的关键步骤。

**为什么需要重排序**：

```
Embedding模型（Bi-Encoder）:
  Query: [E_q]     Doc: [E_d]
         ↓              ↓
    计算相似度：cosine(E_q, E_d)
    
  优点：可以预计算文档embedding，检索快
  缺点：Query和Doc独立编码，交互信息损失

Cross-Encoder（重排序模型）:
  [CLS] Query [SEP] Doc [SEP]
              ↓
         联合编码
              ↓
        相关性分数
        
  优点：Query-Doc联合建模，精度高
  缺点：无法预计算，只能在线计算
```

**实现方式**：

**1. Cross-Encoder重排序**

```python
from sentence_transformers import CrossEncoder

class CrossEncoderReranker:
    def __init__(self, model_name: str = "cross-encoder/ms-marco-MiniLM-L-12-v2"):
        self.model = CrossEncoder(model_name)
    
    async def rerank(
        self,
        query: str,
        documents: list[Document],
        top_n: int = 5
    ) -> list[Document]:
        # 构建query-doc对
        pairs = [[query, doc.content] for doc in documents]
        
        # 计算相关性分数
        scores = self.model.predict(pairs)
        
        # 按分数排序
        doc_scores = list(zip(documents, scores))
        doc_scores.sort(key=lambda x: x[1], reverse=True)
        
        return [doc for doc, _ in doc_scores[:top_n]]
```

**2. LLM作为重排序器**

```python
class LLMReranker:
    def __init__(self, llm: LLM):
        self.llm = llm
    
    async def rerank(
        self,
        query: str,
        documents: list[Document],
        top_n: int = 5
    ) -> list[Document]:
        # 构建重排序prompt
        doc_list = "\n".join([
            f"[{i+1}] {doc.content[:500]}"  # 截断避免超长
            for i, doc in enumerate(documents)
        ])
        
        prompt = f"""
以下是一些文档片段，请根据与查询的相关性对它们进行排序。
返回最相关的{top_n}个文档的编号，用逗号分隔，最相关的在前。

查询：{query}

文档：
{doc_list}

最相关的{top_n}个文档编号："""
        
        response = await self.llm.generate(prompt, temperature=0)
        
        # 解析排序结果
        try:
            indices = [int(x.strip()) - 1 for x in response.split(",")]
            return [documents[i] for i in indices if 0 <= i < len(documents)]
        except:
            return documents[:top_n]
```

**3. Cohere Rerank API**

```python
import cohere

class CohereReranker:
    def __init__(self, api_key: str):
        self.client = cohere.Client(api_key)
    
    async def rerank(
        self,
        query: str,
        documents: list[Document],
        top_n: int = 5
    ) -> list[Document]:
        results = self.client.rerank(
            model="rerank-english-v2.0",
            query=query,
            documents=[doc.content for doc in documents],
            top_n=top_n
        )
        
        return [documents[r.index] for r in results]
```

**4. 多级重排序**

```python
class TwoStageReranker:
    """两阶段重排序：先快后精"""
    
    def __init__(
        self,
        fast_reranker: CrossEncoderReranker,  # 轻量级模型
        precise_reranker: LLMReranker,         # LLM精排
    ):
        self.fast_reranker = fast_reranker
        self.precise_reranker = precise_reranker
    
    async def rerank(
        self,
        query: str,
        documents: list[Document],
        top_n: int = 5
    ) -> list[Document]:
        # 第一阶段：Cross-Encoder快速筛选Top20
        stage1_results = await self.fast_reranker.rerank(query, documents, top_n=20)
        
        # 第二阶段：LLM精排Top5
        stage2_results = await self.precise_reranker.rerank(query, stage1_results, top_n=top_n)
        
        return stage2_results
```

---

## 第四部分：工程实践（10分钟）

### 问题7：RAG评估

**面试官**：如何评估RAG系统的质量？有哪些指标？

**候选人**：RAG评估需要从检索和生成两个阶段分别评估：

**检索阶段指标**：

```python
class RetrievalMetrics:
    @staticmethod
    def precision_at_k(retrieved: list[str], relevant: list[str], k: int) -> float:
        """前K个结果中相关文档的比例"""
        retrieved_k = retrieved[:k]
        relevant_count = sum(1 for doc in retrieved_k if doc in relevant)
        return relevant_count / k
    
    @staticmethod
    def recall_at_k(retrieved: list[str], relevant: list[str], k: int) -> float:
        """前K个结果召回了多少相关文档"""
        retrieved_k = retrieved[:k]
        relevant_count = sum(1 for doc in retrieved_k if doc in relevant)
        return relevant_count / len(relevant) if relevant else 0
    
    @staticmethod
    def mrr(retrieved: list[str], relevant: list[str]) -> float:
        """Mean Reciprocal Rank: 第一个相关结果的排名倒数"""
        for i, doc in enumerate(retrieved):
            if doc in relevant:
                return 1 / (i + 1)
        return 0
    
    @staticmethod
    def ndcg_at_k(retrieved: list[str], relevance_scores: dict[str, int], k: int) -> float:
        """Normalized Discounted Cumulative Gain"""
        dcg = sum(
            relevance_scores.get(doc, 0) / np.log2(i + 2)
            for i, doc in enumerate(retrieved[:k])
        )
        ideal_scores = sorted(relevance_scores.values(), reverse=True)[:k]
        idcg = sum(score / np.log2(i + 2) for i, score in enumerate(ideal_scores))
        return dcg / idcg if idcg > 0 else 0
```

**生成阶段指标**：

```python
class GenerationMetrics:
    def __init__(self, llm: LLM):
        self.llm = llm
    
    async def faithfulness(self, answer: str, context: str) -> float:
        """答案是否忠实于上下文（无幻觉）"""
        prompt = f"""
判断以下回答是否完全基于给定的上下文，没有添加上下文中没有的信息。

上下文：{context}

回答：{answer}

评分（0-1，1表示完全忠实）："""
        
        score = await self.llm.generate(prompt)
        return float(score)
    
    async def relevance(self, question: str, answer: str) -> float:
        """答案是否回答了问题"""
        prompt = f"""
判断以下回答是否充分回答了问题。

问题：{question}

回答：{answer}

评分（0-1，1表示完全回答）："""
        
        score = await self.llm.generate(prompt)
        return float(score)
    
    async def context_relevance(self, question: str, context: str) -> float:
        """检索的上下文是否与问题相关"""
        prompt = f"""
判断以下上下文与问题的相关程度。

问题：{question}

上下文：{context}

评分（0-1，1表示高度相关）："""
        
        score = await self.llm.generate(prompt)
        return float(score)
```

**端到端评估框架**：

```python
class RAGEvaluator:
    def __init__(self, rag_pipeline: RAGPipeline, llm: LLM):
        self.rag = rag_pipeline
        self.retrieval_metrics = RetrievalMetrics()
        self.generation_metrics = GenerationMetrics(llm)
    
    async def evaluate(self, test_set: list[dict]) -> dict:
        """
        test_set = [
            {
                "question": "什么是RAG?",
                "ground_truth_answer": "RAG是...",
                "relevant_doc_ids": ["doc1", "doc2"]
            },
            ...
        ]
        """
        results = {
            "retrieval": {"precision@5": [], "recall@5": [], "mrr": []},
            "generation": {"faithfulness": [], "relevance": [], "context_relevance": []}
        }
        
        for item in test_set:
            # 运行RAG
            answer, retrieved_docs, context = await self.rag.query_with_details(
                item["question"]
            )
            
            # 检索指标
            retrieved_ids = [doc.id for doc in retrieved_docs]
            results["retrieval"]["precision@5"].append(
                self.retrieval_metrics.precision_at_k(
                    retrieved_ids, item["relevant_doc_ids"], 5
                )
            )
            results["retrieval"]["recall@5"].append(
                self.retrieval_metrics.recall_at_k(
                    retrieved_ids, item["relevant_doc_ids"], 5
                )
            )
            results["retrieval"]["mrr"].append(
                self.retrieval_metrics.mrr(
                    retrieved_ids, item["relevant_doc_ids"]
                )
            )
            
            # 生成指标
            results["generation"]["faithfulness"].append(
                await self.generation_metrics.faithfulness(answer, context)
            )
            results["generation"]["relevance"].append(
                await self.generation_metrics.relevance(item["question"], answer)
            )
            results["generation"]["context_relevance"].append(
                await self.generation_metrics.context_relevance(item["question"], context)
            )
        
        # 计算平均值
        return {
            category: {metric: np.mean(scores) for metric, scores in metrics.items()}
            for category, metrics in results.items()
        }
```

---

## 结束（5分钟）

**面试官**：在你做过的RAG项目中，遇到的最大挑战是什么？如何解决的？

**候选人**：最大的挑战是处理"检索召回但答案不在其中"的情况。

**问题描述**：用户问"产品A的最新价格是多少"，系统召回了产品A的多篇文档，但这些文档都是技术规格，不包含价格信息。模型最终会幻觉出一个价格。

**解决方案**：

1. **召回相关性评分**：在生成前先评估召回文档与问题的匹配度
2. **答案可靠性评估**：让模型自评能否从给定上下文回答问题
3. **无答案检测**：如果置信度低，明确告知用户"知识库中未找到相关信息"
4. **分类问题类型**：识别出需要实时数据的问题（如价格、库存），路由到专门的API

这个优化上线后，"无中生有"的幻觉问题减少了80%。

**面试官**：很好，今天的面试就到这里。你有什么问题吗？

**候选人**：谢谢！我想了解：
1. 公司的知识库规模有多大？文档更新频率如何？
2. 目前RAG系统的主要痛点是什么？

---

## 面试评估

| 评估维度 | 评分 | 评语 |
|---------|------|------|
| RAG架构理解 | ⭐⭐⭐⭐⭐ | 对完整Pipeline理解透彻 |
| 向量数据库 | ⭐⭐⭐⭐⭐ | 掌握ANN算法原理和选型依据 |
| 检索优化 | ⭐⭐⭐⭐⭐ | 多路召回、重排序经验丰富 |
| 工程实践 | ⭐⭐⭐⭐ | 有完整的评估体系思路 |
| 问题解决 | ⭐⭐⭐⭐⭐ | 能深入分析问题并提出有效方案 |

**总体评价**：RAG领域专家级水平，有丰富的生产实践经验，强烈建议录用。
