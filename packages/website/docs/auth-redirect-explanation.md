# 认证重定向机制说明文档

## 概述
在 Better Auth UI 的 `AuthCard` 组件中，有两个关键的重定向参数：`callbackURL` 和 `redirectTo`。它们分别用于不同的认证场景。

## 参数说明

### 1. `callbackURL` - OAuth 回调地址
- **用途**: 专门用于第三方 OAuth 认证（如 GitHub、Google 登录）
- **工作原理**: 
  - 当用户点击 "使用 GitHub 登录" 时，会跳转到 GitHub 的授权页面
  - GitHub 授权完成后，会回调到我们的后端 API (`/api/auth/callback/github`)
  - 后端处理完成后，需要知道将用户重定向到哪里，这就是 `callbackURL` 的作用
- **URL 格式**: 必须是完整的 URL（包含协议和域名）
  - 生产环境: `https://foxychat.net/`
  - 开发环境: `http://localhost:8080/`

### 2. `redirectTo` - 普通登录重定向
- **用途**: 用于传统的邮箱/密码登录
- **工作原理**:
  - 用户输入邮箱密码后，前端直接调用 API 进行认证
  - 认证成功后，前端使用 JavaScript 进行页面跳转
  - 这个跳转是在前端完成的，所以可以使用相对路径
- **URL 格式**: 使用相对路径即可
  - 例如: `/`, `/dashboard`, `/settings`

## 代码实现

```tsx
// src/components/auth/AuthPage.tsx
export default function AuthPage() {
  const { pathname = "sign-in" } = useParams({ from: "/auth/$pathname" });
  const search = useSearch({ from: "/auth/$pathname" });

  // 获取重定向路径（从 URL 参数或使用默认值）
  const redirectPath = search.redirect || "/";
  
  // OAuth 需要完整 URL（因为要跨域回调）
  const oauthCallbackURL = process.env.NODE_ENV === "production" 
    ? `https://foxychat.net${redirectPath}`
    : `http://localhost:8080${redirectPath}`;
  
  // 普通登录使用相对路径（前端内部跳转）
  const regularRedirectURL = redirectPath;

  return (
    <AuthCard
      pathname={pathname}
      callbackURL={oauthCallbackURL}      // OAuth 登录后的回调地址
      redirectTo={regularRedirectURL}      // 普通登录后的重定向地址
      socialLayout="vertical"
      // ... 其他属性
    />
  );
}
```

## 认证流程对比

### OAuth 登录流程（使用 callbackURL）
```
1. 用户点击 "GitHub 登录"
2. 前端构建 OAuth URL: 
   https://github.com/login/oauth/authorize?client_id=xxx&redirect_uri=https://api.foxychat.net/api/auth/callback/github
3. 用户在 GitHub 授权
4. GitHub 重定向到: https://api.foxychat.net/api/auth/callback/github?code=xxx
5. 后端处理认证，创建 session
6. 后端重定向到 callbackURL: https://foxychat.net/dashboard
7. 用户到达最终页面
```

### 普通登录流程（使用 redirectTo）
```
1. 用户输入邮箱密码
2. 前端调用 API: POST /api/auth/sign-in/email
3. 后端验证，返回 session
4. 前端收到成功响应
5. 前端使用 JavaScript 跳转: window.location.href = redirectTo
6. 用户到达最终页面
```

## 常见问题

### Q: 为什么 OAuth 不能用相对路径？
A: OAuth 涉及跨域重定向。GitHub/Google 的服务器需要知道完整的回调地址，而相对路径在跨域场景下无法工作。

### Q: 为什么普通登录不用完整 URL？
A: 普通登录是前端直接与后端 API 通信，登录成功后的跳转发生在前端，使用相对路径更灵活且避免硬编码域名。

### Q: 如果配置错误会发生什么？
- **callbackURL 使用相对路径**: OAuth 登录后会重定向到 API 域名下的路径，如 `https://api.foxychat.net/dashboard`
- **redirectTo 使用完整 URL**: 可能导致 URL 被当作相对路径处理，产生类似 `/auth/sign-in/http://localhost:8080` 的错误地址

## 环境配置

### 前端环境变量
```env
# 开发环境
NODE_ENV=development

# 生产环境
NODE_ENV=production
```

### 后端环境变量
```env
# API 基础地址（OAuth 回调使用）
BETTER_AUTH_URL=https://api.foxychat.net

# 前端地址（用于邮件链接等）
FRONTEND_URL=https://foxychat.net

# OAuth 配置
GITHUB_CLIENT_ID=xxx
GITHUB_CLIENT_SECRET=xxx
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
```

## 调试技巧

1. **检查 Network 面板**: 查看 OAuth 重定向链中的每个请求
2. **查看 Cookie**: 确保 session cookie 正确设置（注意 domain 和 sameSite 属性）
3. **日志输出**: 在关键位置添加 console.log 查看实际的 URL 值
4. **测试不同场景**:
   - 直接访问登录页
   - 从受保护页面重定向到登录页
   - OAuth 登录
   - 普通登录
   - 带 redirect 参数的登录

## 更新历史

- 2024-01-09: 初始文档创建
- 修复了 OAuth 登录重定向到 API 域名的问题
- 修复了普通登录 URL 拼接错误的问题