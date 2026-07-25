# Error Handling

> How errors are handled in this project.

---

## Overview

- 全局异常过滤器：`AllExceptionsFilter`（`packages/backend/src/common/filters/`）
- 输入校验：NestJS `ValidationPipe`（`whitelist: true, forbidNonWhitelisted: true, transform: true`）
- 错误响应格式：JSON `{ message, statusCode, error }`

---

## Error Types

### Prisma 错误 → HTTP 状态码

| Prisma 错误 | HTTP 状态码 | 说明 |
|---|---|---|
| `PrismaClientKnownRequestError` P2002 | 409 | 唯一约束冲突（如重复邮箱） |
| `PrismaClientKnownRequestError` P2025 | 404 | 记录不存在 |
| 其他 Prisma 错误 | 500 | 内部服务器错误 |

### 认证错误

| 场景 | HTTP 状态码 |
|---|---|
| 无 token | 401 |
| token 过期/无效 | 401 |
| 邮箱或密码错误 | 401 |
| 邮箱已注册 | 409 |
| 越权访问他人资源 | 404 |

---

## Error Handling Patterns

### 全局异常过滤器

```typescript
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    // PrismaClientKnownRequestError → 映射到对应 HTTP 状态码
    // HttpException → 直接使用
    // 其他 → 500 Internal Server Error
  }
}
```

### 输入校验

DTO 使用 `class-validator` 装饰器：

```typescript
export class RegisterDto {
  @IsEmail()
  email: string;

  @MinLength(8)
  password: string;
}
```

---

## API Error Responses

```json
{
  "message": "Task not found",
  "statusCode": 404,
  "error": "Not Found"
}
```

---

## Common Mistakes

### TaskQueryDto 交叉类型导致 ValidationPipe 失效

**Symptom**：`?view=invalid` 返回 200 而非 400，查询参数验证被跳过

**Cause**：Controller 的 `@Query()` 使用了交叉类型 `TaskQueryDto & { parentId?: string }`。TypeScript 对交叉类型生成的 `design:paramtypes` 元数据为 `Object`，NestJS ValidationPipe 无法识别目标类型。

**Fix**：`@Query()` 类型必须用单一 DTO class，所有可选字段定义在该 class 内。Query string 到 boolean 的转换用 `@Transform` 装饰器处理：

```typescript
// Correct
@Query() query: TaskQueryDto  // 单一 class

// Wrong
@Query() query: TaskQueryDto & { parentId?: string }  // 交叉类型，元数据丢失
```