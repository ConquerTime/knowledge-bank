# Python 服务器开发与阿里云 ACK 容器化部署：从零到生产的完整实践

> 本文面向有一定后端基础的工程师，系统讲解如何使用 Python（FastAPI）构建生产级 API 服务，并通过 Docker 容器化后部署到阿里云 ACK（Alibaba Cloud Container Service for Kubernetes）。涵盖本地开发、镜像构建、CI/CD 流水线、Kubernetes 资源编排、服务暴露与监控告警的全链路实践。

---

## 0. 全局视角：我们要做什么？

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           完整部署流程                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌────────┐ │
│  │ 本地开发  │ -> │ 容器化构建 │ -> │ 推送镜像  │ -> │ K8s 编排  │ -> │ 服务暴露│ │
│  │ FastAPI  │    │Dockerfile│    │   ACR    │    │   ACK    │    │Ingress │ │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘    └────────┘ │
│                                                                             │
│  开发环境          CI 构建           镜像仓库         容器编排        流量入口   │
└─────────────────────────────────────────────────────────────────────────────┘
```

**核心概念映射：**

| 传统部署 | 容器化部署 | 说明 |
|---------|-----------|------|
| 服务器 | Pod | 运行应用的最小单元 |
| 进程管理（systemd） | Deployment | 管理 Pod 副本与滚动更新 |
| Nginx 负载均衡 | Service + Ingress | 服务发现与流量分发 |
| 手动部署 | CI/CD Pipeline | 自动化构建与发布 |

---

## 1. Python 服务开发：FastAPI 生产级实践

### 1.1 项目结构设计

```
python-server/
├── app/
│   ├── __init__.py
│   ├── main.py              # 应用入口
│   ├── api/
│   │   ├── __init__.py
│   │   ├── v1/
│   │   │   ├── __init__.py
│   │   │   ├── endpoints/
│   │   │   │   ├── health.py
│   │   │   │   └── users.py
│   │   │   └── router.py
│   ├── core/
│   │   ├── config.py        # 配置管理
│   │   ├── logging.py       # 日志配置
│   │   └── exceptions.py    # 异常处理
│   ├── models/
│   │   └── user.py
│   ├── schemas/
│   │   └── user.py          # Pydantic 模型
│   └── services/
│       └── user_service.py
├── tests/
│   ├── conftest.py
│   └── test_api/
├── Dockerfile
├── docker-compose.yml
├── pyproject.toml           # 依赖管理
├── alembic.ini              # 数据库迁移
└── k8s/                     # Kubernetes 配置
    ├── deployment.yaml
    ├── service.yaml
    ├── ingress.yaml
    ├── configmap.yaml
    └── secret.yaml
```

### 1.2 核心代码实现

**配置管理（app/core/config.py）**

```python
from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Optional

class Settings(BaseSettings):
    """
    应用配置，支持环境变量覆盖
    在 K8s 中通过 ConfigMap/Secret 注入
    """
    # 应用配置
    app_name: str = "python-api-server"
    app_env: str = "development"  # development | staging | production
    debug: bool = False

    # 服务配置
    host: str = "0.0.0.0"
    port: int = 8000
    workers: int = 4

    # 数据库配置
    database_url: str = "postgresql://user:pass@localhost:5432/db"
    db_pool_size: int = 10
    db_max_overflow: int = 20

    # Redis 配置
    redis_url: Optional[str] = None

    # 日志配置
    log_level: str = "INFO"
    log_format: str = "json"  # json | text

    # 安全配置
    secret_key: str = "change-me-in-production"
    access_token_expire_minutes: int = 30

    # 可观测性
    enable_metrics: bool = True
    enable_tracing: bool = False

    class Config:
        env_file = ".env"
        case_sensitive = False

@lru_cache()
def get_settings() -> Settings:
    """单例模式获取配置"""
    return Settings()
```

**应用入口（app/main.py）**

```python
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
import time
import uuid

from app.core.config import get_settings
from app.core.logging import setup_logging
from app.api.v1.router import api_router

settings = get_settings()

# 配置日志
setup_logging(settings.log_level, settings.log_format)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时执行
    logger.info(f"Starting {settings.app_name} in {settings.app_env} mode")
    # 初始化数据库连接池、Redis 等
    yield
    # 关闭时执行
    logger.info("Shutting down application")
    # 清理资源

app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    docs_url="/docs" if settings.debug else None,  # 生产环境关闭文档
    redoc_url=None,
    lifespan=lifespan,
)

# CORS 中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if settings.debug else ["https://your-domain.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 请求追踪中间件
@app.middleware("http")
async def add_request_context(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    start_time = time.time()

    # 注入请求上下文
    request.state.request_id = request_id

    response = await call_next(request)

    # 记录请求日志
    process_time = time.time() - start_time
    logger.info(
        "Request completed",
        extra={
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "status_code": response.status_code,
            "duration_ms": round(process_time * 1000, 2),
        }
    )

    response.headers["X-Request-ID"] = request_id
    response.headers["X-Process-Time"] = str(process_time)
    return response

# 全局异常处理
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception(f"Unhandled exception: {exc}")
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal Server Error",
            "request_id": getattr(request.state, "request_id", "unknown"),
        }
    )

# Prometheus 指标
if settings.enable_metrics:
    Instrumentator().instrument(app).expose(app, endpoint="/metrics")

# 注册路由
app.include_router(api_router, prefix="/api/v1")

# 健康检查端点（K8s 探针使用）
@app.get("/health/live")
async def liveness():
    """存活探针：应用是否在运行"""
    return {"status": "alive"}

@app.get("/health/ready")
async def readiness():
    """就绪探针：应用是否可以接收流量"""
    # 检查依赖服务（数据库、Redis 等）
    return {"status": "ready"}
```

**结构化日志配置（app/core/logging.py）**

```python
import logging
import sys
import json
from datetime import datetime

class JsonFormatter(logging.Formatter):
    """JSON 格式化器，便于日志收集与分析"""

    def format(self, record):
        log_data = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        # 添加额外字段
        if hasattr(record, "request_id"):
            log_data["request_id"] = record.request_id
        if hasattr(record, "duration_ms"):
            log_data["duration_ms"] = record.duration_ms

        # 异常信息
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_data)

def setup_logging(level: str, format_type: str):
    """配置日志"""
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, level.upper()))

    handler = logging.StreamHandler(sys.stdout)

    if format_type == "json":
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(
            logging.Formatter(
                "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
            )
        )

    root_logger.handlers = [handler]
```

**健康检查端点（app/api/v1/endpoints/health.py）**

```python
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from redis import Redis

router = APIRouter()

@router.get("/health/detailed")
async def detailed_health_check(
    # db: AsyncSession = Depends(get_db),
    # redis: Redis = Depends(get_redis),
):
    """详细健康检查，用于调试"""
    checks = {
        "database": "healthy",
        "redis": "healthy",
        "disk": "healthy",
    }

    # 数据库检查
    # try:
    #     await db.execute("SELECT 1")
    # except Exception as e:
    #     checks["database"] = f"unhealthy: {str(e)}"

    all_healthy = all(v == "healthy" for v in checks.values())

    return {
        "status": "healthy" if all_healthy else "degraded",
        "checks": checks,
    }
```

### 1.3 依赖管理（pyproject.toml）

```toml
[project]
name = "python-api-server"
version = "1.0.0"
description = "Production-ready Python API Server"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.109.0",
    "uvicorn[standard]>=0.27.0",
    "gunicorn>=21.2.0",
    "pydantic>=2.5.0",
    "pydantic-settings>=2.1.0",
    "sqlalchemy>=2.0.0",
    "asyncpg>=0.29.0",
    "redis>=5.0.0",
    "prometheus-fastapi-instrumentator>=6.1.0",
    "python-json-logger>=2.0.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=7.4.0",
    "pytest-asyncio>=0.23.0",
    "pytest-cov>=4.1.0",
    "httpx>=0.26.0",
    "ruff>=0.1.0",
    "mypy>=1.8.0",
]

[tool.ruff]
line-length = 100
target-version = "py311"

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
```

---

## 2. Docker 容器化：构建生产级镜像

### 2.1 多阶段构建 Dockerfile

```dockerfile
# ============================================
# Stage 1: 构建阶段
# ============================================
FROM python:3.11-slim as builder

# 设置环境变量
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /build

# 安装构建依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# 复制依赖文件
COPY pyproject.toml ./

# 创建虚拟环境并安装依赖
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

RUN pip install --upgrade pip && \
    pip install .

# ============================================
# Stage 2: 运行阶段
# ============================================
FROM python:3.11-slim as runtime

# 创建非 root 用户（安全最佳实践）
RUN groupadd --gid 1000 appgroup && \
    useradd --uid 1000 --gid appgroup --shell /bin/bash --create-home appuser

# 设置环境变量
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONFAULTHANDLER=1 \
    PATH="/opt/venv/bin:$PATH" \
    APP_HOME=/app

WORKDIR $APP_HOME

# 从构建阶段复制虚拟环境
COPY --from=builder /opt/venv /opt/venv

# 复制应用代码
COPY --chown=appuser:appgroup ./app ./app

# 切换到非 root 用户
USER appuser

# 暴露端口
EXPOSE 8000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health/live')" || exit 1

# 启动命令（使用 gunicorn + uvicorn workers）
CMD ["gunicorn", "app.main:app", \
     "--bind", "0.0.0.0:8000", \
     "--workers", "4", \
     "--worker-class", "uvicorn.workers.UvicornWorker", \
     "--access-logfile", "-", \
     "--error-logfile", "-", \
     "--capture-output", \
     "--enable-stdio-inheritance"]
```

### 2.2 本地开发 docker-compose.yml

```yaml
version: '3.8'

services:
  api:
    build:
      context: .
      dockerfile: Dockerfile
      target: runtime
    ports:
      - "8000:8000"
    environment:
      - APP_ENV=development
      - DEBUG=true
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/appdb
      - REDIS_URL=redis://redis:6379/0
      - LOG_LEVEL=DEBUG
      - LOG_FORMAT=text
    volumes:
      - ./app:/app/app:ro  # 开发时挂载代码
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_started
    networks:
      - app-network

  db:
    image: postgres:15-alpine
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=appdb
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - app-network

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    networks:
      - app-network

volumes:
  postgres_data:
  redis_data:

networks:
  app-network:
    driver: bridge
```

### 2.3 镜像优化要点

```
┌─────────────────────────────────────────────────────────────────┐
│                    镜像优化策略                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. 多阶段构建                                                   │
│     └─ 构建阶段的编译工具不会进入最终镜像                           │
│                                                                 │
│  2. 基础镜像选择                                                  │
│     ├─ python:3.11-slim (140MB) vs python:3.11 (900MB)          │
│     └─ 生产环境优先选择 slim/alpine 版本                           │
│                                                                 │
│  3. 层缓存优化                                                   │
│     ├─ 依赖文件单独复制（pyproject.toml）                          │
│     └─ 代码变更不会重新安装依赖                                    │
│                                                                 │
│  4. 安全最佳实践                                                  │
│     ├─ 非 root 用户运行                                          │
│     ├─ 只复制必要文件                                             │
│     └─ 不包含密钥/凭证                                            │
│                                                                 │
│  5. 最终镜像大小                                                  │
│     └─ 目标：< 200MB                                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. 阿里云 ACR：镜像仓库配置

### 3.1 创建镜像仓库

```bash
# 安装阿里云 CLI（如果未安装）
# brew install aliyun-cli  # macOS
# 或从官网下载

# 配置阿里云 CLI
aliyun configure

# 创建命名空间
aliyun cr CreateNamespace --NamespaceName my-project

# 创建镜像仓库
aliyun cr CreateRepository \
  --RepoNamespace my-project \
  --RepoName python-api-server \
  --RepoType PRIVATE \
  --Summary "Python API Server"
```

### 3.2 推送镜像到 ACR

```bash
# 登录 ACR（华东1-杭州为例）
docker login --username=<your-username> registry.cn-hangzhou.aliyuncs.com

# 构建镜像
docker build -t python-api-server:v1.0.0 .

# 打标签
docker tag python-api-server:v1.0.0 \
  registry.cn-hangzhou.aliyuncs.com/my-project/python-api-server:v1.0.0

# 推送镜像
docker push registry.cn-hangzhou.aliyuncs.com/my-project/python-api-server:v1.0.0

# 同时推送 latest 标签
docker tag python-api-server:v1.0.0 \
  registry.cn-hangzhou.aliyuncs.com/my-project/python-api-server:latest
docker push registry.cn-hangzhou.aliyuncs.com/my-project/python-api-server:latest
```

### 3.3 配置镜像拉取凭证（K8s Secret）

```bash
# 在 ACK 集群中创建 Secret
kubectl create secret docker-registry acr-secret \
  --docker-server=registry.cn-hangzhou.aliyuncs.com \
  --docker-username=<your-username> \
  --docker-password=<your-password> \
  --namespace=default
```

---

## 4. 阿里云 ACK：Kubernetes 集群配置

### 4.1 集群规划

```
┌─────────────────────────────────────────────────────────────────┐
│                    ACK 集群架构                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    VPC (10.0.0.0/16)                     │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │   │
│  │  │ 可用区 A    │  │ 可用区 B    │  │ 可用区 C    │      │   │
│  │  │ 10.0.1.0/24 │  │ 10.0.2.0/24 │  │ 10.0.3.0/24 │      │   │
│  │  │             │  │             │  │             │      │   │
│  │  │ ┌─────────┐ │  │ ┌─────────┐ │  │ ┌─────────┐ │      │   │
│  │  │ │ Node 1  │ │  │ │ Node 2  │ │  │ │ Node 3  │ │      │   │
│  │  │ │ 4C8G    │ │  │ │ 4C8G    │ │  │ │ 4C8G    │ │      │   │
│  │  │ └─────────┘ │  │ └─────────┘ │  │ └─────────┘ │      │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  推荐配置：                                                      │
│  - 托管版 ACK（无需管理 Master）                                  │
│  - 3 节点起步（跨可用区高可用）                                    │
│  - 节点规格：4C8G 或 8C16G                                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 连接 ACK 集群

```bash
# 方式一：通过阿里云控制台下载 kubeconfig
# 容器服务 -> 集群 -> 集群信息 -> 连接信息

# 方式二：通过 CLI 获取
aliyun cs DescribeClusterUserKubeconfig --ClusterId <cluster-id>

# 配置 kubectl
export KUBECONFIG=~/.kube/config-ack

# 验证连接
kubectl get nodes
kubectl cluster-info
```

---

## 5. Kubernetes 资源编排

### 5.1 Namespace 与资源配额

```yaml
# k8s/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: python-api
  labels:
    name: python-api
    env: production
---
# 资源配额限制
apiVersion: v1
kind: ResourceQuota
metadata:
  name: python-api-quota
  namespace: python-api
spec:
  hard:
    requests.cpu: "8"
    requests.memory: 16Gi
    limits.cpu: "16"
    limits.memory: 32Gi
    pods: "20"
```

### 5.2 ConfigMap 配置

```yaml
# k8s/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: python-api-config
  namespace: python-api
data:
  APP_ENV: "production"
  APP_NAME: "python-api-server"
  LOG_LEVEL: "INFO"
  LOG_FORMAT: "json"
  WORKERS: "4"
  ENABLE_METRICS: "true"
  # 数据库连接池配置
  DB_POOL_SIZE: "10"
  DB_MAX_OVERFLOW: "20"
```

### 5.3 Secret 敏感配置

```yaml
# k8s/secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: python-api-secret
  namespace: python-api
type: Opaque
stringData:
  DATABASE_URL: "postgresql://user:password@rds-xxx.mysql.rds.aliyuncs.com:5432/appdb"
  REDIS_URL: "redis://:password@r-xxx.redis.rds.aliyuncs.com:6379/0"
  SECRET_KEY: "your-super-secret-key-change-in-production"
```

> **安全提示**：生产环境建议使用阿里云 KMS 管理敏感信息，而非直接存储在 Secret 中。

### 5.4 Deployment 部署

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: python-api
  namespace: python-api
  labels:
    app: python-api
    version: v1
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1        # 滚动更新时最多超出期望副本数
      maxUnavailable: 0  # 滚动更新时最多不可用副本数
  selector:
    matchLabels:
      app: python-api
  template:
    metadata:
      labels:
        app: python-api
        version: v1
      annotations:
        # 强制滚动更新（配置变更时）
        configmap-hash: "{{ .Values.configmapHash }}"
    spec:
      # 镜像拉取凭证
      imagePullSecrets:
        - name: acr-secret

      # 服务账号
      serviceAccountName: default

      # 安全上下文
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        fsGroup: 1000

      # 反亲和性：Pod 分散到不同节点
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
            - weight: 100
              podAffinityTerm:
                labelSelector:
                  matchExpressions:
                    - key: app
                      operator: In
                      values:
                        - python-api
                topologyKey: kubernetes.io/hostname

      containers:
        - name: python-api
          image: registry.cn-hangzhou.aliyuncs.com/my-project/python-api-server:v1.0.0
          imagePullPolicy: Always

          ports:
            - name: http
              containerPort: 8000
              protocol: TCP

          # 环境变量（从 ConfigMap）
          envFrom:
            - configMapRef:
                name: python-api-config

          # 环境变量（从 Secret）
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: python-api-secret
                  key: DATABASE_URL
            - name: REDIS_URL
              valueFrom:
                secretKeyRef:
                  name: python-api-secret
                  key: REDIS_URL
            - name: SECRET_KEY
              valueFrom:
                secretKeyRef:
                  name: python-api-secret
                  key: SECRET_KEY

          # 资源限制
          resources:
            requests:
              cpu: "250m"
              memory: "512Mi"
            limits:
              cpu: "1000m"
              memory: "1Gi"

          # 存活探针
          livenessProbe:
            httpGet:
              path: /health/live
              port: http
            initialDelaySeconds: 10
            periodSeconds: 15
            timeoutSeconds: 5
            failureThreshold: 3

          # 就绪探针
          readinessProbe:
            httpGet:
              path: /health/ready
              port: http
            initialDelaySeconds: 5
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 3

          # 启动探针（慢启动应用）
          startupProbe:
            httpGet:
              path: /health/live
              port: http
            initialDelaySeconds: 5
            periodSeconds: 5
            failureThreshold: 30  # 5 * 30 = 150s 最大启动时间

          # 安全上下文
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop:
                - ALL

          # 只读文件系统需要的临时目录
          volumeMounts:
            - name: tmp
              mountPath: /tmp

      volumes:
        - name: tmp
          emptyDir: {}

      # 优雅终止时间
      terminationGracePeriodSeconds: 30
```

### 5.5 Service 服务

```yaml
# k8s/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: python-api
  namespace: python-api
  labels:
    app: python-api
spec:
  type: ClusterIP
  ports:
    - name: http
      port: 80
      targetPort: http
      protocol: TCP
  selector:
    app: python-api
```

### 5.6 Ingress 流量入口

```yaml
# k8s/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: python-api
  namespace: python-api
  annotations:
    # 阿里云 ALB Ingress Controller
    alb.ingress.kubernetes.io/address-type: internet
    alb.ingress.kubernetes.io/vswitch-ids: "vsw-xxx,vsw-yyy"
    alb.ingress.kubernetes.io/ssl-certificate-id: "xxx-cn-hangzhou"
    alb.ingress.kubernetes.io/ssl-redirect: "true"

    # 或使用 Nginx Ingress Controller
    # kubernetes.io/ingress.class: nginx
    # nginx.ingress.kubernetes.io/ssl-redirect: "true"
    # nginx.ingress.kubernetes.io/proxy-body-size: "10m"
spec:
  ingressClassName: alb  # 或 nginx
  tls:
    - hosts:
        - api.your-domain.com
      secretName: tls-secret  # 如果不使用阿里云证书
  rules:
    - host: api.your-domain.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: python-api
                port:
                  number: 80
```

### 5.7 HPA 自动扩缩容

```yaml
# k8s/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: python-api-hpa
  namespace: python-api
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: python-api
  minReplicas: 3
  maxReplicas: 10
  metrics:
    # CPU 使用率
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    # 内存使用率
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300  # 缩容稳定窗口
      policies:
        - type: Percent
          value: 10
          periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
        - type: Percent
          value: 100
          periodSeconds: 15
        - type: Pods
          value: 4
          periodSeconds: 15
      selectPolicy: Max
```

---

## 6. CI/CD 流水线：自动化部署

### 6.1 GitHub Actions 配置

```yaml
# .github/workflows/deploy.yml
name: Build and Deploy to ACK

on:
  push:
    branches: [main]
    tags: ['v*']
  pull_request:
    branches: [main]

env:
  REGISTRY: registry.cn-hangzhou.aliyuncs.com
  IMAGE_NAME: my-project/python-api-server
  ACK_CLUSTER_ID: ${{ secrets.ACK_CLUSTER_ID }}

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: |
          pip install -e ".[dev]"

      - name: Lint
        run: ruff check .

      - name: Type check
        run: mypy app

      - name: Test
        run: pytest --cov=app --cov-report=xml

      - name: Upload coverage
        uses: codecov/codecov-action@v3

  build:
    needs: test
    runs-on: ubuntu-latest
    outputs:
      image_tag: ${{ steps.meta.outputs.version }}
    steps:
      - uses: actions/checkout@v4

      - name: Docker meta
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=ref,event=branch
            type=ref,event=pr
            type=semver,pattern={{version}}
            type=sha,prefix=

      - name: Login to ACR
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ secrets.ACR_USERNAME }}
          password: ${{ secrets.ACR_PASSWORD }}

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: ${{ github.event_name != 'pull_request' }}
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=registry,ref=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:buildcache
          cache-to: type=registry,ref=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:buildcache,mode=max

  deploy:
    needs: build
    if: github.ref == 'refs/heads/main' || startsWith(github.ref, 'refs/tags/v')
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4

      - name: Set up aliyun CLI
        uses: aliyun/acr-login@v1
        with:
          region-id: cn-hangzhou
          access-key-id: ${{ secrets.ALIYUN_ACCESS_KEY_ID }}
          access-key-secret: ${{ secrets.ALIYUN_ACCESS_KEY_SECRET }}

      - name: Set up kubectl
        uses: aliyun/ack-set-context@v1
        with:
          access-key-id: ${{ secrets.ALIYUN_ACCESS_KEY_ID }}
          access-key-secret: ${{ secrets.ALIYUN_ACCESS_KEY_SECRET }}
          cluster-id: ${{ env.ACK_CLUSTER_ID }}

      - name: Deploy to ACK
        run: |
          # 更新镜像版本
          IMAGE_TAG="${{ needs.build.outputs.image_tag }}"
          kubectl set image deployment/python-api \
            python-api=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${IMAGE_TAG} \
            -n python-api

          # 等待部署完成
          kubectl rollout status deployment/python-api -n python-api --timeout=300s

      - name: Verify deployment
        run: |
          kubectl get pods -n python-api -l app=python-api
          kubectl get svc -n python-api
```

### 6.2 部署脚本

```bash
#!/bin/bash
# scripts/deploy.sh

set -e

NAMESPACE="python-api"
IMAGE_TAG=${1:-"latest"}
REGISTRY="registry.cn-hangzhou.aliyuncs.com/my-project/python-api-server"

echo "Deploying python-api-server:${IMAGE_TAG}"

# 应用配置
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.yaml

# 部署应用
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml
kubectl apply -f k8s/hpa.yaml

# 更新镜像
kubectl set image deployment/python-api \
  python-api=${REGISTRY}:${IMAGE_TAG} \
  -n ${NAMESPACE}

# 等待部署完成
kubectl rollout status deployment/python-api -n ${NAMESPACE} --timeout=300s

echo "Deployment completed!"
kubectl get pods -n ${NAMESPACE} -l app=python-api
```

---

## 7. 可观测性：监控、日志、告警

### 7.1 Prometheus 监控配置

```yaml
# k8s/servicemonitor.yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: python-api
  namespace: python-api
  labels:
    release: prometheus  # 匹配 Prometheus Operator 选择器
spec:
  selector:
    matchLabels:
      app: python-api
  endpoints:
    - port: http
      path: /metrics
      interval: 15s
  namespaceSelector:
    matchNames:
      - python-api
```

### 7.2 Grafana Dashboard 示例指标

```promql
# 请求速率
rate(http_requests_total{namespace="python-api"}[5m])

# P99 延迟
histogram_quantile(0.99,
  rate(http_request_duration_seconds_bucket{namespace="python-api"}[5m])
)

# 错误率
sum(rate(http_requests_total{namespace="python-api", status=~"5.."}[5m]))
/
sum(rate(http_requests_total{namespace="python-api"}[5m]))

# CPU 使用率
sum(rate(container_cpu_usage_seconds_total{namespace="python-api"}[5m]))
by (pod)

# 内存使用
sum(container_memory_working_set_bytes{namespace="python-api"})
by (pod)
```

### 7.3 日志收集（阿里云 SLS）

```yaml
# k8s/logtail-config.yaml
apiVersion: log.alibabacloud.com/v1alpha1
kind: AliyunLogConfig
metadata:
  name: python-api-logs
  namespace: python-api
spec:
  project: your-sls-project
  logstore: python-api-logs
  machineGroups:
    - k8s-group-xxx
  logtailConfig:
    configName: python-api-stdout
    inputType: plugin
    inputDetail:
      plugin:
        inputs:
          - type: service_docker_stdout
            detail:
              Stdout: true
              Stderr: true
              IncludeLabel:
                io.kubernetes.container.name: python-api
              ExcludeLabel:
                io.kubernetes.pod.namespace: kube-system
```

### 7.4 告警规则

```yaml
# k8s/alertrules.yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: python-api-alerts
  namespace: python-api
spec:
  groups:
    - name: python-api.rules
      rules:
        # 高错误率告警
        - alert: HighErrorRate
          expr: |
            sum(rate(http_requests_total{namespace="python-api", status=~"5.."}[5m]))
            /
            sum(rate(http_requests_total{namespace="python-api"}[5m])) > 0.05
          for: 5m
          labels:
            severity: critical
          annotations:
            summary: "High error rate in python-api"
            description: "Error rate is {{ $value | humanizePercentage }}"

        # 高延迟告警
        - alert: HighLatency
          expr: |
            histogram_quantile(0.99,
              rate(http_request_duration_seconds_bucket{namespace="python-api"}[5m])
            ) > 1
          for: 5m
          labels:
            severity: warning
          annotations:
            summary: "High latency in python-api"
            description: "P99 latency is {{ $value }}s"

        # Pod 重启告警
        - alert: PodRestarting
          expr: |
            increase(kube_pod_container_status_restarts_total{namespace="python-api"}[1h]) > 3
          labels:
            severity: warning
          annotations:
            summary: "Pod {{ $labels.pod }} restarting frequently"
```

---

## 8. 生产环境检查清单

### 8.1 部署前检查

```
┌─────────────────────────────────────────────────────────────────┐
│                    生产部署检查清单                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  □ 代码质量                                                      │
│    ├─ □ 单元测试覆盖率 > 80%                                     │
│    ├─ □ 集成测试通过                                             │
│    ├─ □ 代码审查完成                                             │
│    └─ □ 安全扫描无高危漏洞                                        │
│                                                                 │
│  □ 镜像安全                                                      │
│    ├─ □ 使用非 root 用户                                         │
│    ├─ □ 镜像漏洞扫描通过                                          │
│    ├─ □ 只包含必要依赖                                           │
│    └─ □ 敏感信息未硬编码                                          │
│                                                                 │
│  □ K8s 配置                                                     │
│    ├─ □ 资源限制（requests/limits）已设置                         │
│    ├─ □ 健康检查探针已配置                                        │
│    ├─ □ Pod 反亲和性已配置                                        │
│    ├─ □ HPA 自动扩缩容已配置                                      │
│    └─ □ PDB（Pod Disruption Budget）已配置                       │
│                                                                 │
│  □ 可观测性                                                      │
│    ├─ □ 结构化日志输出                                           │
│    ├─ □ Metrics 端点暴露                                         │
│    ├─ □ 关键告警规则配置                                          │
│    └─ □ Dashboard 准备就绪                                        │
│                                                                 │
│  □ 运维准备                                                      │
│    ├─ □ 回滚流程文档化                                           │
│    ├─ □ 故障处理 Runbook                                         │
│    └─ □ On-call 联系人确认                                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 8.2 常用运维命令

```bash
# 查看 Pod 状态
kubectl get pods -n python-api -o wide

# 查看 Pod 日志
kubectl logs -f deployment/python-api -n python-api

# 查看前一个容器日志（崩溃排查）
kubectl logs -p <pod-name> -n python-api

# 进入容器调试
kubectl exec -it <pod-name> -n python-api -- /bin/sh

# 查看资源使用
kubectl top pods -n python-api

# 查看 HPA 状态
kubectl get hpa -n python-api

# 手动扩缩容
kubectl scale deployment/python-api --replicas=5 -n python-api

# 回滚到上一版本
kubectl rollout undo deployment/python-api -n python-api

# 查看部署历史
kubectl rollout history deployment/python-api -n python-api

# 重启 Deployment（无需修改配置）
kubectl rollout restart deployment/python-api -n python-api
```

---

## 9. 成本优化建议

### 9.1 资源优化

| 优化项 | 建议 | 预期节省 |
|-------|------|---------|
| 节点规格 | 使用抢占式实例（非核心业务） | 50-70% |
| 资源请求 | 根据实际使用调整 requests | 20-30% |
| HPA 配置 | 设置合理的 min/max replicas | 按需扩缩 |
| 镜像大小 | 使用多阶段构建减小镜像 | 减少拉取时间 |

### 9.2 推荐的节点池配置

```yaml
# 核心业务节点池
- name: core-pool
  instanceType: ecs.g6.xlarge  # 4C16G
  minSize: 2
  maxSize: 10
  labels:
    workload-type: core

# 弹性节点池（抢占式实例）
- name: spot-pool
  instanceType: ecs.g6.xlarge
  spotStrategy: SpotWithPriceLimit
  spotPriceLimit: 0.5  # 按需价格的 50%
  minSize: 0
  maxSize: 20
  labels:
    workload-type: spot
  taints:
    - key: spot
      value: "true"
      effect: NoSchedule
```

---

## 10. 总结与最佳实践

### 10.1 关键要点回顾

1. **代码层面**：
   - 使用 Pydantic 进行配置管理，支持环境变量覆盖
   - 结构化 JSON 日志，便于日志收集与分析
   - 健康检查端点分离（liveness vs readiness）

2. **容器化**：
   - 多阶段构建减小镜像体积
   - 非 root 用户运行提升安全性
   - 合理的 HEALTHCHECK 配置

3. **Kubernetes 编排**：
   - 资源限制防止单 Pod 影响整个节点
   - Pod 反亲和性确保高可用
   - HPA 实现弹性伸缩

4. **可观测性**：
   - Prometheus 指标 + Grafana 可视化
   - 阿里云 SLS 日志收集
   - 关键业务告警规则

### 10.2 进阶主题

- **服务网格**：使用 ASM（阿里云服务网格）实现流量管理、熔断、链路追踪
- **GitOps**：使用 ArgoCD 实现声明式部署
- **多集群**：跨地域部署与流量调度
- **Serverless**：使用阿里云 SAE 简化运维

---

## 相关链接

- [FastAPI 官方文档](https://fastapi.tiangolo.com/)
- [阿里云 ACK 文档](https://help.aliyun.com/product/85222.html)
- [Kubernetes 官方文档](https://kubernetes.io/docs/)
- [Prometheus 监控](https://prometheus.io/docs/)
