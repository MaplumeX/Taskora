# Logging Guidelines

> How logging is done in this project.

---

## Overview

- 日志库：NestJS 内置 `Logger`（`@nestjs/common`），不引入额外日志框架
- 日志范围刻意收窄：仅在应用生命周期和全局异常处记录，**业务层不写日志**
- 业务错误通过抛 `HttpException` 表达，由全局异常过滤器统一处理，不散落 `try/catch + logger`

---

## Log Levels

NestJS `Logger` 支持的方法及本项目使用约定：

| 方法 | 级别 | 本项目使用场景 |
|------|------|----------------|
| `Logger.log()` | info | 应用启动成功（`main.ts` 启动行） |
| `Logger.error()` | error | 全局异常过滤器中未处理的异常、Prisma 非 P2002/P2025 错误 |
| `Logger.warn()` | warn | 当前未使用（预留） |
| `Logger.debug()` | debug | 当前未使用（预留） |
| `Logger.verbose()` | verbose | 当前未使用（预留） |

---

## 实际使用位置

目前日志仅出现在两处，保持一致即可：

### 1. 启动日志（main.ts）

```typescript
// packages/backend/src/main.ts
import { Logger } from '@nestjs/common';
// ...
Logger.log(`Server running on http://localhost:${port}`, 'Bootstrap');
```

- 用静态调用 `Logger.log(message, context)`
- 上下文字符串用大驼峰名称（`'Bootstrap'`）

### 2. 异常过滤器（all-exceptions.filter.ts）

```typescript
// packages/backend/src/common/filters/all-exceptions.filter.ts
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    // ...
    // Prisma 已知错误（非 P2002/P2025）
    this.logger.error(`Prisma error: ${exception.code}`, exception.stack);
    // 其他未处理异常
    this.logger.error('Unhandled exception', exception instanceof Error ? exception.stack : String(exception));
  }
}
```

- 实例化 `new Logger(ClassName.name)`，上下文为当前类名
- `error(msg, stack?)` 第二参数传 stack trace

---

## Logging Conventions

- **实例 vs 静态**：在类内使用实例化 `private readonly logger = new Logger(ClassName.name)`；在非类上下文（如 `main.ts`）用静态 `Logger.log()`
- **上下文命名**：传递类名 `ClassName.name`，便于日志按来源筛选
- **错误堆栈**：`logger.error(message, stack)`，始终传 `error.stack`（若是 `Error`）

---

## What to Log

- 应用启动事件（端口监听）
- 全局异常过滤器捕获的未处理异常和数据库错误（P2002/P2025 之外）

---

## What NOT to Log

- **敏感信息**：密码、token、passwordHash、用户邮箱明文 —— 永不记录
- **业务流程日志**：service 层不写 "create task"、"update task" 之类的进度日志；NestJS 路由层和 Prisma 自身已足够
- **请求体/响应体**：不含 PII 的请求才可记录，当前项目不记录请求体
- **HttpException**：可预期错误（404、401、409）由过滤器直接返回，不写日志

---

## Common Mistakes

### service 层到处加 console.log / logger.log

**Symptom**：业务日志充斥，排查时信噪比低

**Cause**：把日志当调试工具，未区分开发期 `console.log` 与生产期日志

**Fix**：业务错误抛 `NotFoundException` / `ConflictException` 等，由 `AllExceptionsFilter` 统一处理。开发期调试用断点或临时 `console.log`，提交前删除。

### 记录完整请求体

**Symptom**：日志中出现用户密码明文

**Fix**：永不记录 `@Body()` 参数。若需记录请求元信息，只记 method + path，不记 body。