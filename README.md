# FoxChat

FoxChat is a lightweight chat application with convenient keyboard shortcuts for quick access.

## Installation & Setup

```bash
# Install dependencies
yarn

# Start the development server
yarn start

# Build the application
yarn build

# Package the application
yarn package
```

## Keyboard Shortcuts

### Quick Launch

- Press `Control+Space` to activate FoxChat from anywhere on your system
- If FoxChat is already visible and focused, pressing `Control+Space` will hide it
- When the app appears, the chat input will be automatically focused

### Settings

- Press `Command+.` to open the Settings window
- In Settings, you can customize keyboard shortcuts under the "Keyboard Shortcuts" tab
- Click on any shortcut to record a new key combination

### Customization

You can change the global activation shortcut in the Settings:
1. Open Settings (`Command+.`)
2. Go to "Keyboard Shortcuts" tab
3. Click on "Activate App" and press your preferred key combination
4. The new shortcut will take effect immediately

Your shortcuts are saved automatically and will persist between application restarts.

## Model Context Protocol (MCP) Integration

FoxChat will utilize the Model Context Protocol (MCP) for enhanced AI capabilities and integration with various services. We are implementing:

- [MCP Registry Client](https://github.com/mastra-ai/mastra/blob/main/explorations/mcp-registry-client/README.md) - For discovering, configuring, and managing MCP servers
- [MCP Server Registry](https://github.com/orgs/modelcontextprotocol/discussions/159) - For standardized access to MCP servers and tooling

These integrations will allow FoxChat to discover and use a wide variety of AI services through a standardized protocol, enhancing functionality without requiring custom implementation for each service.

## 路线图

### 基础功能
- [x] 多模型支持：连接不同的LLM服务
- [x] 聊天界面与消息历史
- [ ] 会话管理：分组、导出/导入
- [ ] 上下文记忆：长期和短期记忆管理
- [ ] 多模态支持：文本、图像、音频输入/输出

### MCP核心功能
- [x] 模型控制协议：AI服务的统一接口
- [ ] 无缝模型切换：针对不同任务
- [x] 支持通过MCP使用本地模型：无需直接集成Ollama、LM Studio等

### Agent系统
- [ ] 工具框架：统一的工具定义和调用接口
- [ ] 核心工具集：
  - [ ] 文件操作
  - [x] 网络搜索
  - [x] 代码执行
  - [ ] 系统操作
- [ ] 工具权限控制和安全边界

### 用户自定义Agent
- [ ] 不同场景的Agent模板系统
- [ ] 导入机制：
  - [ ] JSON/YAML定义文件
  - [ ] 自然语言描述转换
  - [ ] 从示例对话中学习
- [ ] 可视化编辑器：构建Agent逻辑

### 桌面集成
- [x] 全局快捷键：快速访问
- [x] 系统主题集成
- [x] 系统托盘存在
- [ ] 文件系统访问
- [ ] 屏幕截图和OCR
- [ ] 离线功能：基本对话和本地知识库查询

### 隐私与安全
- [x] 本地数据存储：对话历史
- [ ] 用户控制发送至模型的数据
- [ ] 工具执行沙盒
- [ ] 敏感数据的端到端加密

## Getting Started

[Installation and usage instructions here]