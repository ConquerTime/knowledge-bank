# 面试模拟 5：AI技术深度 - AI Agent

> **面试类型**：技术深度面试  
> **时长**：60分钟  
> **面试官**：AI平台负责人  
> **考察重点**：Agent架构设计、工具调用、多Agent协作、工程实践

---

## 开场（3分钟）

**面试官**：你好，今天聊聊AI Agent。你对Agent有什么理解？做过什么相关项目？

**候选人**：您好！AI Agent是能够自主感知环境、制定计划并执行动作来完成目标的系统。与传统的问答式LLM应用不同，Agent具有自主性和目标导向性。

我在上一家公司主导开发了一个智能业务流程Agent，主要功能：
1. 自动处理客户工单，根据问题类型调用不同的工具（查询订单、退款、修改地址等）
2. 支持多步骤任务分解和执行
3. 具备记忆系统，能记住用户偏好和历史交互
4. 日均自动处理5000+工单，解决率85%

---

## 第一部分：Agent基础架构（15分钟）

### 问题1：Agent核心组件

**面试官**：请描述一下Agent的核心组件和工作原理。

**候选人**：Agent的核心架构包含四个主要组件：

```
┌─────────────────────────────────────────────────────────────────┐
│                        AI Agent 架构                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐     │
│  │   感知      │      │   规划      │      │   执行      │     │
│  │ Perception  │ ──→  │  Planning   │ ──→  │  Execution  │     │
│  └─────────────┘      └─────────────┘      └─────────────┘     │
│         │                   │                    │              │
│         └───────────────────┼────────────────────┘              │
│                             │                                   │
│                     ┌───────▼───────┐                          │
│                     │    记忆       │                          │
│                     │   Memory      │                          │
│                     └───────────────┘                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**1. 感知（Perception）**

```python
class Perception:
    """处理输入，理解用户意图和环境状态"""
    
    def __init__(self, llm: LLM):
        self.llm = llm
    
    async def perceive(self, user_input: str, context: dict) -> dict:
        prompt = f"""
分析用户输入，提取以下信息：
1. 用户意图（intent）
2. 关键实体（entities）
3. 情感倾向（sentiment）
4. 是否需要澄清（needs_clarification）

用户输入：{user_input}
历史上下文：{context}

以JSON格式输出分析结果。
"""
        
        response = await self.llm.generate(prompt, response_format={"type": "json_object"})
        return json.loads(response)
```

**2. 规划（Planning）**

```python
class Planner:
    """将目标分解为可执行的步骤"""
    
    def __init__(self, llm: LLM, available_tools: list[Tool]):
        self.llm = llm
        self.tools = available_tools
    
    async def plan(self, goal: str, context: dict) -> list[Step]:
        tools_desc = "\n".join([
            f"- {tool.name}: {tool.description}" 
            for tool in self.tools
        ])
        
        prompt = f"""
你是一个任务规划专家。请将以下目标分解为具体的执行步骤。

可用工具：
{tools_desc}

目标：{goal}
当前状态：{context}

输出格式（JSON数组）：
[
  {{"step": 1, "action": "工具名称", "params": {{}}, "reason": "原因"}},
  ...
]

执行计划：
"""
        
        response = await self.llm.generate(prompt, response_format={"type": "json_object"})
        steps = json.loads(response)
        return [Step(**s) for s in steps]
```

**3. 执行（Execution）**

```python
class Executor:
    """执行计划中的每个步骤"""
    
    def __init__(self, tools: dict[str, Tool]):
        self.tools = tools
    
    async def execute(self, step: Step) -> ExecutionResult:
        tool = self.tools.get(step.action)
        
        if not tool:
            return ExecutionResult(
                success=False,
                error=f"Unknown tool: {step.action}"
            )
        
        try:
            # 验证参数
            validated_params = tool.validate_params(step.params)
            
            # 执行工具
            result = await tool.execute(validated_params)
            
            return ExecutionResult(
                success=True,
                output=result,
                tool=step.action
            )
        except Exception as e:
            return ExecutionResult(
                success=False,
                error=str(e),
                tool=step.action
            )
```

**4. 记忆（Memory）**

```python
class Memory:
    """管理短期和长期记忆"""
    
    def __init__(self, vector_store: VectorStore, redis: Redis):
        self.vector_store = vector_store  # 长期记忆
        self.redis = redis                 # 短期记忆/会话状态
    
    async def remember_short_term(self, session_id: str, key: str, value: Any, ttl: int = 3600):
        """短期记忆：当前会话上下文"""
        await self.redis.setex(f"{session_id}:{key}", ttl, json.dumps(value))
    
    async def recall_short_term(self, session_id: str, key: str) -> Any:
        value = await self.redis.get(f"{session_id}:{key}")
        return json.loads(value) if value else None
    
    async def remember_long_term(self, content: str, metadata: dict):
        """长期记忆：持久化的知识和经验"""
        embedding = await self.embed(content)
        await self.vector_store.insert({
            "content": content,
            "embedding": embedding,
            "metadata": metadata,
            "timestamp": datetime.now()
        })
    
    async def recall_long_term(self, query: str, k: int = 5) -> list[dict]:
        """检索相关的长期记忆"""
        query_embedding = await self.embed(query)
        return await self.vector_store.search(query_embedding, top_k=k)
```

**完整的Agent循环**：

```python
class Agent:
    def __init__(
        self,
        perception: Perception,
        planner: Planner,
        executor: Executor,
        memory: Memory,
        llm: LLM
    ):
        self.perception = perception
        self.planner = planner
        self.executor = executor
        self.memory = memory
        self.llm = llm
        self.max_iterations = 10
    
    async def run(self, user_input: str, session_id: str) -> str:
        # 1. 加载会话上下文
        context = await self.memory.recall_short_term(session_id, "context") or {}
        
        # 2. 感知：理解用户意图
        perception_result = await self.perception.perceive(user_input, context)
        
        # 3. 检索相关记忆
        relevant_memories = await self.memory.recall_long_term(user_input)
        
        # 4. 规划：制定执行计划
        plan = await self.planner.plan(
            goal=perception_result["intent"],
            context={**context, "memories": relevant_memories}
        )
        
        # 5. 执行循环
        results = []
        for step in plan:
            if len(results) >= self.max_iterations:
                break
            
            result = await self.executor.execute(step)
            results.append(result)
            
            # 检查是否需要重新规划
            if not result.success:
                plan = await self._replan(step, result.error, context)
        
        # 6. 生成最终回复
        response = await self._generate_response(user_input, results, context)
        
        # 7. 更新记忆
        await self.memory.remember_short_term(session_id, "context", {
            **context,
            "last_input": user_input,
            "last_response": response
        })
        
        return response
```

---

### 问题2：ReAct模式

**面试官**：ReAct是什么？相比传统的Plan-then-Execute有什么优势？

**候选人**：ReAct（Reasoning + Acting）是一种交替进行推理和行动的Agent范式。

**传统 Plan-then-Execute**：

```
1. 一次性制定完整计划
2. 按顺序执行所有步骤
3. 问题：中间步骤失败时难以调整
```

**ReAct模式**：

```
Thought → Action → Observation → Thought → Action → Observation → ...
   ↑                                         │
   └─────────────────────────────────────────┘
        根据Observation调整下一步行动
```

**ReAct实现**：

```python
class ReActAgent:
    REACT_PROMPT = """
你是一个能够使用工具解决问题的助手。

可用工具：
{tools}

使用以下格式：
Thought: 思考当前情况和下一步行动
Action: 工具名称[参数]
Observation: 工具执行结果（由系统填充）
... (重复Thought/Action/Observation直到解决问题)
Thought: 我已经得到了答案
Final Answer: 最终回答

问题：{question}
"""

    def __init__(self, llm: LLM, tools: dict[str, Tool]):
        self.llm = llm
        self.tools = tools
        self.max_steps = 10
    
    async def run(self, question: str) -> str:
        tools_desc = "\n".join([
            f"- {name}: {tool.description}\n  参数: {tool.parameters}"
            for name, tool in self.tools.items()
        ])
        
        prompt = self.REACT_PROMPT.format(tools=tools_desc, question=question)
        
        for step in range(self.max_steps):
            # 生成下一个Thought和Action
            response = await self.llm.generate(prompt, stop=["Observation:"])
            prompt += response
            
            # 检查是否完成
            if "Final Answer:" in response:
                return self._extract_final_answer(response)
            
            # 提取并执行Action
            action = self._extract_action(response)
            if action:
                observation = await self._execute_action(action)
                prompt += f"\nObservation: {observation}\n"
            else:
                prompt += "\nObservation: No valid action found. Please try again.\n"
        
        return "达到最大步骤数，任务未完成"
    
    def _extract_action(self, text: str) -> tuple[str, dict] | None:
        """提取Action: tool_name[params]"""
        import re
        match = re.search(r'Action:\s*(\w+)\[(.*?)\]', text)
        if match:
            tool_name = match.group(1)
            params_str = match.group(2)
            try:
                params = json.loads(params_str) if params_str.strip() else {}
            except:
                params = {"query": params_str}  # 简单字符串参数
            return (tool_name, params)
        return None
    
    async def _execute_action(self, action: tuple[str, dict]) -> str:
        tool_name, params = action
        tool = self.tools.get(tool_name)
        
        if not tool:
            return f"错误：未知工具 {tool_name}"
        
        try:
            result = await tool.execute(params)
            return str(result)
        except Exception as e:
            return f"执行错误：{e}"
```

**ReAct的优势**：

| 方面 | Plan-then-Execute | ReAct |
|------|------------------|-------|
| 适应性 | 低，计划固定 | 高，动态调整 |
| 错误恢复 | 困难 | 自然支持 |
| 观察利用 | 无 | 充分利用中间结果 |
| Token效率 | 高（一次规划） | 较低（多次推理） |
| 可解释性 | 一般 | 强（思维过程可见） |

**适用场景**：
- ReAct：需要与环境交互、结果不确定的任务
- Plan-then-Execute：步骤明确、可预测的任务

---

## 第二部分：工具调用（15分钟）

### 问题3：Function Calling

**面试官**：如何设计一个健壮的工具调用系统？

**候选人**：工具调用系统需要考虑定义、执行、错误处理等多个方面。

**工具定义标准化**：

```python
from pydantic import BaseModel, Field
from typing import Any, Callable
from enum import Enum

class ParameterType(str, Enum):
    STRING = "string"
    NUMBER = "number"
    BOOLEAN = "boolean"
    OBJECT = "object"
    ARRAY = "array"

class Parameter(BaseModel):
    name: str
    type: ParameterType
    description: str
    required: bool = True
    default: Any = None
    enum: list[str] | None = None

class Tool(BaseModel):
    name: str
    description: str
    parameters: list[Parameter]
    execute_fn: Callable = Field(exclude=True)  # 不序列化
    
    def to_openai_format(self) -> dict:
        """转换为OpenAI Function格式"""
        properties = {}
        required = []
        
        for param in self.parameters:
            properties[param.name] = {
                "type": param.type.value,
                "description": param.description
            }
            if param.enum:
                properties[param.name]["enum"] = param.enum
            if param.required:
                required.append(param.name)
        
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": {
                    "type": "object",
                    "properties": properties,
                    "required": required
                }
            }
        }
    
    async def execute(self, params: dict) -> Any:
        """执行工具，带参数验证"""
        # 验证必需参数
        for param in self.parameters:
            if param.required and param.name not in params:
                raise ValueError(f"Missing required parameter: {param.name}")
        
        # 设置默认值
        for param in self.parameters:
            if param.name not in params and param.default is not None:
                params[param.name] = param.default
        
        return await self.execute_fn(**params)
```

**工具注册器**：

```python
class ToolRegistry:
    def __init__(self):
        self.tools: dict[str, Tool] = {}
    
    def register(
        self,
        name: str,
        description: str,
        parameters: list[Parameter]
    ):
        """装饰器方式注册工具"""
        def decorator(func: Callable):
            self.tools[name] = Tool(
                name=name,
                description=description,
                parameters=parameters,
                execute_fn=func
            )
            return func
        return decorator
    
    def get_all_tools_openai_format(self) -> list[dict]:
        return [tool.to_openai_format() for tool in self.tools.values()]

# 使用示例
registry = ToolRegistry()

@registry.register(
    name="search_orders",
    description="根据条件搜索订单",
    parameters=[
        Parameter(
            name="user_id",
            type=ParameterType.STRING,
            description="用户ID"
        ),
        Parameter(
            name="status",
            type=ParameterType.STRING,
            description="订单状态",
            required=False,
            enum=["pending", "processing", "shipped", "delivered", "cancelled"]
        ),
        Parameter(
            name="limit",
            type=ParameterType.NUMBER,
            description="返回数量限制",
            required=False,
            default=10
        )
    ]
)
async def search_orders(user_id: str, status: str = None, limit: int = 10) -> list[dict]:
    # 实际的订单查询逻辑
    return await order_service.search(user_id, status, limit)

@registry.register(
    name="process_refund",
    description="处理退款请求",
    parameters=[
        Parameter(
            name="order_id",
            type=ParameterType.STRING,
            description="订单ID"
        ),
        Parameter(
            name="reason",
            type=ParameterType.STRING,
            description="退款原因"
        ),
        Parameter(
            name="amount",
            type=ParameterType.NUMBER,
            description="退款金额（可选，默认全额退款）",
            required=False
        )
    ]
)
async def process_refund(order_id: str, reason: str, amount: float = None) -> dict:
    return await refund_service.process(order_id, reason, amount)
```

**带工具调用的Agent**：

```python
class ToolCallingAgent:
    def __init__(self, llm: LLM, registry: ToolRegistry):
        self.llm = llm
        self.registry = registry
    
    async def run(self, user_message: str) -> str:
        messages = [
            {"role": "system", "content": "你是一个有帮助的助手，可以使用工具来帮助用户。"},
            {"role": "user", "content": user_message}
        ]
        
        while True:
            # 调用LLM（带工具定义）
            response = await self.llm.chat(
                messages=messages,
                tools=self.registry.get_all_tools_openai_format(),
                tool_choice="auto"
            )
            
            # 检查是否有工具调用
            if response.tool_calls:
                # 执行所有工具调用
                tool_results = await self._execute_tool_calls(response.tool_calls)
                
                # 添加助手消息和工具结果到对话
                messages.append(response.to_message())
                for tool_call, result in zip(response.tool_calls, tool_results):
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "content": json.dumps(result, ensure_ascii=False)
                    })
            else:
                # 没有工具调用，返回最终回复
                return response.content
    
    async def _execute_tool_calls(self, tool_calls: list) -> list:
        results = []
        for call in tool_calls:
            tool = self.registry.tools.get(call.function.name)
            if tool:
                try:
                    params = json.loads(call.function.arguments)
                    result = await tool.execute(params)
                    results.append({"success": True, "data": result})
                except Exception as e:
                    results.append({"success": False, "error": str(e)})
            else:
                results.append({"success": False, "error": f"Unknown tool: {call.function.name}"})
        return results
```

---

### 问题4：工具调用的安全性

**面试官**：工具调用有什么安全风险？如何防范？

**候选人**：工具调用涉及实际的系统操作，安全风险很大。

**主要风险**：

1. **权限越界**：Agent可能调用用户无权执行的操作
2. **参数注入**：恶意用户可能通过输入操纵工具参数
3. **资源滥用**：无限制地调用可能耗尽系统资源
4. **敏感数据泄露**：工具返回的数据可能包含敏感信息

**防护措施**：

```python
from functools import wraps
from typing import TypedDict

class UserContext(TypedDict):
    user_id: str
    roles: list[str]
    permissions: list[str]

class SecureToolRegistry(ToolRegistry):
    
    def register_secure(
        self,
        name: str,
        description: str,
        parameters: list[Parameter],
        required_permissions: list[str] = None,
        rate_limit: int = None,  # 每分钟最大调用次数
        audit_log: bool = True
    ):
        """带安全控制的工具注册"""
        def decorator(func: Callable):
            @wraps(func)
            async def secure_wrapper(user_context: UserContext, **params):
                # 1. 权限检查
                if required_permissions:
                    if not self._check_permissions(user_context, required_permissions):
                        raise PermissionError(f"User lacks required permissions: {required_permissions}")
                
                # 2. 速率限制
                if rate_limit:
                    if not await self._check_rate_limit(user_context["user_id"], name, rate_limit):
                        raise RateLimitError(f"Rate limit exceeded for tool: {name}")
                
                # 3. 参数清洗
                sanitized_params = self._sanitize_params(params)
                
                # 4. 执行工具
                result = await func(**sanitized_params)
                
                # 5. 审计日志
                if audit_log:
                    await self._log_tool_call(user_context, name, sanitized_params, result)
                
                # 6. 结果脱敏
                sanitized_result = self._sanitize_output(result, user_context)
                
                return sanitized_result
            
            self.tools[name] = Tool(
                name=name,
                description=description,
                parameters=parameters,
                execute_fn=secure_wrapper
            )
            return func
        return decorator
    
    def _check_permissions(self, user_context: UserContext, required: list[str]) -> bool:
        """检查用户是否有所需权限"""
        return all(perm in user_context["permissions"] for perm in required)
    
    async def _check_rate_limit(self, user_id: str, tool_name: str, limit: int) -> bool:
        """检查速率限制"""
        key = f"rate_limit:{user_id}:{tool_name}"
        current = await self.redis.incr(key)
        if current == 1:
            await self.redis.expire(key, 60)  # 1分钟窗口
        return current <= limit
    
    def _sanitize_params(self, params: dict) -> dict:
        """清洗参数，防止注入"""
        sanitized = {}
        for key, value in params.items():
            if isinstance(value, str):
                # 移除潜在的SQL注入、命令注入等
                sanitized[key] = self._sanitize_string(value)
            else:
                sanitized[key] = value
        return sanitized
    
    def _sanitize_string(self, s: str) -> str:
        """字符串清洗"""
        # 移除危险字符和模式
        import re
        # 防止SQL注入
        s = re.sub(r"['\";]", "", s)
        # 防止命令注入
        s = re.sub(r"[|&;`$]", "", s)
        return s.strip()
    
    def _sanitize_output(self, result: Any, user_context: UserContext) -> Any:
        """输出脱敏"""
        if isinstance(result, dict):
            sanitized = {}
            for key, value in result.items():
                # 根据用户权限决定是否显示敏感字段
                if key in ["password", "token", "secret"]:
                    continue
                if key in ["phone", "email", "id_card"] and "view_pii" not in user_context["permissions"]:
                    sanitized[key] = self._mask_pii(value)
                else:
                    sanitized[key] = value
            return sanitized
        return result
    
    def _mask_pii(self, value: str) -> str:
        """脱敏处理"""
        if len(value) <= 4:
            return "****"
        return value[:2] + "*" * (len(value) - 4) + value[-2:]
    
    async def _log_tool_call(self, user_context: UserContext, tool_name: str, params: dict, result: Any):
        """审计日志"""
        log_entry = {
            "timestamp": datetime.now().isoformat(),
            "user_id": user_context["user_id"],
            "tool": tool_name,
            "params": params,
            "result_summary": str(result)[:500],  # 截断防止日志过大
        }
        await self.audit_logger.log(log_entry)
```

**确认机制（高危操作）**：

```python
class ConfirmableToolAgent(ToolCallingAgent):
    """需要人工确认的高危操作"""
    
    HIGH_RISK_TOOLS = ["process_refund", "delete_account", "modify_permissions"]
    
    async def run(self, user_message: str, user_context: UserContext) -> str:
        # ... 正常的Agent流程 ...
        
        if response.tool_calls:
            # 检查是否有高危操作
            high_risk_calls = [
                call for call in response.tool_calls 
                if call.function.name in self.HIGH_RISK_TOOLS
            ]
            
            if high_risk_calls:
                # 返回确认请求
                confirmation = await self._request_confirmation(high_risk_calls)
                if not confirmation.approved:
                    return "操作已取消。"
            
            # 继续执行
            results = await self._execute_tool_calls(response.tool_calls, user_context)
            # ...
    
    async def _request_confirmation(self, calls: list) -> ConfirmationResult:
        """请求用户确认"""
        actions = "\n".join([
            f"- {call.function.name}: {call.function.arguments}"
            for call in calls
        ])
        
        message = f"""
以下操作需要您的确认：

{actions}

请回复"确认"以继续，或"取消"以放弃操作。
"""
        # 通过某种方式获取用户确认（如WebSocket、等待用户下一条消息等）
        return await self.confirmation_service.request(message)
```

---

## 第三部分：多Agent系统（15分钟）

### 问题5：多Agent协作架构

**面试官**：如何设计一个多Agent协作系统？

**候选人**：多Agent系统让多个专门化的Agent协同工作，解决复杂问题。

**协作模式**：

```
1. 分层模式（Hierarchical）
   ┌───────────────┐
   │   主控Agent    │  ← 分配任务、协调
   └───────┬───────┘
     ┌─────┼─────┐
     ▼     ▼     ▼
   ┌───┐ ┌───┐ ┌───┐
   │A1 │ │A2 │ │A3 │  ← 专门化子Agent
   └───┘ └───┘ └───┘

2. 对等模式（Peer-to-Peer）
   ┌───┐     ┌───┐
   │A1 │←───→│A2 │
   └───┘     └───┘
     ↑    ╲    ↑
     │     ╲   │
     ▼      ╲  ▼
   ┌───┐     ┌───┐
   │A3 │←───→│A4 │
   └───┘     └───┘

3. 流水线模式（Pipeline）
   ┌───┐    ┌───┐    ┌───┐    ┌───┐
   │A1 │───→│A2 │───→│A3 │───→│A4 │
   └───┘    └───┘    └───┘    └───┘
```

**多Agent系统实现**：

```python
from abc import ABC, abstractmethod
from enum import Enum

class AgentRole(str, Enum):
    COORDINATOR = "coordinator"
    RESEARCHER = "researcher"
    WRITER = "writer"
    REVIEWER = "reviewer"
    EXECUTOR = "executor"

class Message(BaseModel):
    sender: str
    receiver: str
    content: Any
    message_type: str  # "task", "result", "feedback", "query"
    timestamp: datetime = Field(default_factory=datetime.now)

class BaseAgent(ABC):
    def __init__(self, name: str, role: AgentRole, llm: LLM):
        self.name = name
        self.role = role
        self.llm = llm
        self.inbox: asyncio.Queue = asyncio.Queue()
    
    @abstractmethod
    async def process_message(self, message: Message) -> Message | None:
        """处理收到的消息"""
        pass
    
    async def send(self, receiver: str, content: Any, message_type: str):
        message = Message(
            sender=self.name,
            receiver=receiver,
            content=content,
            message_type=message_type
        )
        await self.message_bus.publish(message)
    
    async def run(self):
        """Agent主循环"""
        while True:
            message = await self.inbox.get()
            response = await self.process_message(message)
            if response:
                await self.message_bus.publish(response)


class CoordinatorAgent(BaseAgent):
    """协调者Agent：分解任务、分配工作、整合结果"""
    
    def __init__(self, name: str, llm: LLM, team: list[BaseAgent]):
        super().__init__(name, AgentRole.COORDINATOR, llm)
        self.team = {agent.name: agent for agent in team}
    
    async def process_message(self, message: Message) -> Message | None:
        if message.message_type == "task":
            # 分解任务
            subtasks = await self._decompose_task(message.content)
            # 分配给团队成员
            for subtask in subtasks:
                assignee = await self._select_assignee(subtask)
                await self.send(assignee, subtask, "task")
            return None
        
        elif message.message_type == "result":
            # 收集结果
            await self._collect_result(message)
            # 检查是否所有子任务完成
            if await self._all_tasks_complete():
                final_result = await self._synthesize_results()
                return Message(
                    sender=self.name,
                    receiver="user",
                    content=final_result,
                    message_type="final_result"
                )
        
        return None
    
    async def _decompose_task(self, task: str) -> list[dict]:
        prompt = f"""
分解以下任务为子任务，每个子任务应该可以独立完成。

任务：{task}

团队成员及其能力：
{self._describe_team()}

输出格式：
[{{"subtask": "子任务描述", "required_role": "角色", "dependencies": ["依赖的子任务ID"]}}]
"""
        response = await self.llm.generate(prompt)
        return json.loads(response)
    
    async def _select_assignee(self, subtask: dict) -> str:
        """选择最适合的Agent"""
        required_role = subtask.get("required_role")
        for name, agent in self.team.items():
            if agent.role.value == required_role:
                return name
        # 默认分配给第一个可用Agent
        return list(self.team.keys())[0]


class ResearcherAgent(BaseAgent):
    """研究员Agent：信息检索和分析"""
    
    def __init__(self, name: str, llm: LLM, search_tool: Tool, rag: RAGPipeline):
        super().__init__(name, AgentRole.RESEARCHER, llm)
        self.search_tool = search_tool
        self.rag = rag
    
    async def process_message(self, message: Message) -> Message | None:
        if message.message_type == "task":
            # 执行研究任务
            research_result = await self._research(message.content)
            return Message(
                sender=self.name,
                receiver=message.sender,
                content=research_result,
                message_type="result"
            )
        return None
    
    async def _research(self, task: dict) -> dict:
        topic = task["subtask"]
        
        # 检索相关文档
        rag_results = await self.rag.query(topic)
        
        # 补充网络搜索
        search_results = await self.search_tool.execute({"query": topic})
        
        # 综合分析
        prompt = f"""
基于以下信息，为主题"{topic}"提供全面的研究报告。

知识库检索结果：
{rag_results}

网络搜索结果：
{search_results}

请提供：
1. 关键发现
2. 数据和证据
3. 来源引用
"""
        report = await self.llm.generate(prompt)
        return {"topic": topic, "report": report}


class WriterAgent(BaseAgent):
    """写作Agent：内容创作"""
    
    async def process_message(self, message: Message) -> Message | None:
        if message.message_type == "task":
            content = await self._write(message.content)
            return Message(
                sender=self.name,
                receiver=message.sender,
                content=content,
                message_type="result"
            )
        return None
    
    async def _write(self, task: dict) -> str:
        prompt = f"""
根据以下研究材料，撰写{task.get('format', '文章')}。

主题：{task['subtask']}
研究材料：{task.get('research', '无')}
要求：{task.get('requirements', '清晰、专业')}
"""
        return await self.llm.generate(prompt)


class ReviewerAgent(BaseAgent):
    """审核Agent：质量控制"""
    
    async def process_message(self, message: Message) -> Message | None:
        if message.message_type == "review_request":
            review = await self._review(message.content)
            return Message(
                sender=self.name,
                receiver=message.sender,
                content=review,
                message_type="feedback"
            )
        return None
    
    async def _review(self, content: str) -> dict:
        prompt = f"""
请审核以下内容，提供：
1. 总体评分（1-10）
2. 优点
3. 需要改进的地方
4. 具体修改建议

内容：
{content}
"""
        review = await self.llm.generate(prompt)
        return {"review": review, "passed": "评分" in review and int(re.search(r'(\d+)', review).group(1)) >= 7}
```

**消息总线**：

```python
class MessageBus:
    """Agent间通信的消息总线"""
    
    def __init__(self):
        self.agents: dict[str, BaseAgent] = {}
        self.message_history: list[Message] = []
    
    def register(self, agent: BaseAgent):
        self.agents[agent.name] = agent
        agent.message_bus = self
    
    async def publish(self, message: Message):
        """发布消息到目标Agent"""
        self.message_history.append(message)
        
        if message.receiver == "broadcast":
            # 广播给所有Agent
            for agent in self.agents.values():
                if agent.name != message.sender:
                    await agent.inbox.put(message)
        elif message.receiver in self.agents:
            await self.agents[message.receiver].inbox.put(message)
        else:
            print(f"Unknown receiver: {message.receiver}")
    
    async def run_all(self):
        """启动所有Agent"""
        tasks = [agent.run() for agent in self.agents.values()]
        await asyncio.gather(*tasks)
```

---

### 问题6：Agent的记忆系统

**面试官**：Agent的记忆系统如何设计？

**候选人**：Agent记忆系统分为多个层次，模拟人类的记忆结构。

```python
class MemorySystem:
    """分层记忆系统"""
    
    def __init__(
        self,
        redis: Redis,           # 工作记忆
        vector_store: VectorStore,  # 长期记忆
        llm: LLM                # 用于记忆总结
    ):
        self.redis = redis
        self.vector_store = vector_store
        self.llm = llm
    
    # === 工作记忆：当前任务的临时信息 ===
    
    async def set_working_memory(self, session_id: str, key: str, value: Any):
        """设置工作记忆（短期）"""
        await self.redis.setex(
            f"working:{session_id}:{key}",
            300,  # 5分钟过期
            json.dumps(value)
        )
    
    async def get_working_memory(self, session_id: str, key: str) -> Any:
        value = await self.redis.get(f"working:{session_id}:{key}")
        return json.loads(value) if value else None
    
    # === 短期记忆：当前会话的对话历史 ===
    
    async def add_to_conversation(self, session_id: str, message: dict):
        """添加对话到短期记忆"""
        key = f"conversation:{session_id}"
        await self.redis.rpush(key, json.dumps(message))
        await self.redis.expire(key, 3600)  # 1小时过期
        
        # 如果对话过长，触发总结和转移
        length = await self.redis.llen(key)
        if length > 20:
            await self._summarize_and_archive(session_id)
    
    async def get_conversation(self, session_id: str, limit: int = 10) -> list[dict]:
        """获取最近的对话"""
        key = f"conversation:{session_id}"
        messages = await self.redis.lrange(key, -limit, -1)
        return [json.loads(m) for m in messages]
    
    async def _summarize_and_archive(self, session_id: str):
        """总结旧对话并存入长期记忆"""
        key = f"conversation:{session_id}"
        
        # 获取前10条旧消息
        old_messages = await self.redis.lrange(key, 0, 9)
        
        if not old_messages:
            return
        
        # 总结对话
        messages_text = "\n".join([json.loads(m)["content"] for m in old_messages])
        summary = await self.llm.generate(f"""
请总结以下对话的关键信息，包括：
1. 讨论的主题
2. 做出的决定
3. 用户的偏好和需求

对话：
{messages_text}

总结：
""")
        
        # 存入长期记忆
        await self.add_long_term_memory(session_id, summary, {"type": "conversation_summary"})
        
        # 删除旧消息
        await self.redis.ltrim(key, 10, -1)
    
    # === 长期记忆：持久化的知识 ===
    
    async def add_long_term_memory(self, session_id: str, content: str, metadata: dict):
        """添加长期记忆"""
        embedding = await self._embed(content)
        await self.vector_store.insert({
            "id": str(uuid.uuid4()),
            "session_id": session_id,
            "content": content,
            "embedding": embedding,
            "metadata": metadata,
            "created_at": datetime.now()
        })
    
    async def recall_long_term(
        self,
        query: str,
        session_id: str = None,
        k: int = 5
    ) -> list[dict]:
        """检索相关的长期记忆"""
        query_embedding = await self._embed(query)
        
        filter_expr = f'session_id == "{session_id}"' if session_id else None
        
        results = await self.vector_store.search(
            embedding=query_embedding,
            top_k=k,
            filter=filter_expr
        )
        return results
    
    # === 情景记忆：特定事件和经历 ===
    
    async def add_episode(
        self,
        session_id: str,
        episode: dict  # {"event": str, "outcome": str, "lesson": str}
    ):
        """记录经历和学到的教训"""
        content = f"事件：{episode['event']}\n结果：{episode['outcome']}\n经验：{episode['lesson']}"
        await self.add_long_term_memory(
            session_id,
            content,
            {"type": "episode", **episode}
        )
    
    # === 程序性记忆：如何做事的知识 ===
    
    async def add_procedure(self, procedure: dict):
        """记录执行特定任务的方法"""
        content = f"任务：{procedure['task']}\n步骤：{procedure['steps']}"
        await self.add_long_term_memory(
            "global",
            content,
            {"type": "procedure", **procedure}
        )
    
    async def recall_procedure(self, task: str) -> list[dict]:
        """检索相关的执行方法"""
        return await self.recall_long_term(
            f"如何执行任务：{task}",
            session_id="global",
            k=3
        )
    
    # === 反思记忆：自我改进 ===
    
    async def reflect(self, session_id: str, recent_actions: list[dict]):
        """反思最近的行动，生成改进建议"""
        actions_text = json.dumps(recent_actions, ensure_ascii=False, indent=2)
        
        reflection = await self.llm.generate(f"""
分析以下最近的行动记录，反思：
1. 哪些做得好？为什么？
2. 哪些可以改进？如何改进？
3. 有什么规律或模式？

行动记录：
{actions_text}

反思总结：
""")
        
        await self.add_long_term_memory(
            session_id,
            reflection,
            {"type": "reflection"}
        )
```

---

## 结束（5分钟）

**面试官**：最后一个问题，Agent系统最大的挑战是什么？你是如何解决的？

**候选人**：最大的挑战是**Agent的可控性和可靠性**。

**具体问题**：
1. Agent可能陷入无限循环
2. 工具调用可能产生意外副作用
3. 多Agent协作时的死锁和活锁
4. 回答质量不稳定

**我们的解决方案**：

1. **执行边界**：设置最大步骤数、最大工具调用次数、总体超时时间
2. **安全沙箱**：高危操作需要人工审批
3. **降级机制**：Agent不确定时转人工处理
4. **监控体系**：完整的执行链路追踪和异常告警
5. **质量评估**：每次交互后评估回答质量，低于阈值触发复核

上线后Agent自主处理率85%，其中15%转人工主要是复杂新问题和高危操作，用户满意度4.6/5分。

**面试官**：很好，今天的面试就到这里。

**候选人**：感谢！我想了解公司目前的Agent产品形态是什么？是面向内部还是对外？

---

## 面试评估

| 评估维度 | 评分 | 评语 |
|---------|------|------|
| Agent架构 | ⭐⭐⭐⭐⭐ | 对核心组件理解深入 |
| 工具调用 | ⭐⭐⭐⭐⭐ | 安全意识强，设计完善 |
| 多Agent系统 | ⭐⭐⭐⭐ | 掌握多种协作模式 |
| 记忆系统 | ⭐⭐⭐⭐⭐ | 分层设计合理 |
| 工程落地 | ⭐⭐⭐⭐⭐ | 有丰富的生产经验 |

**总体评价**：Agent领域经验丰富，设计能力和工程能力俱佳，强烈建议录用。
