# CodeFox MCP

CodeFox MCP 是一个简单的 Model Context Protocol 实现，提供项目初始化功能。参考 VSCode MCP 的实现，但只专注于项目初始化工具。

## 功能特性

- **项目初始化**: 通过复制模板到指定目录来初始化新项目

## 安装

```bash
# 安装依赖
cd mcps/codefox-mcp
npm install
```

## 构建

```bash
npm run build
```

## 使用方法

### 启动服务器

```bash
# 直接启动
npm run start
```

## 开发

支持使用 watch 模式进行开发：

```bash
npm run watch
```

## 架构

MCP 服务器通过 Model Context Protocol 与 AI 客户端通信，提供项目初始化功能。使用 stdio 作为传输层，可以轻松集成到 AI 服务中。

### 工具功能

| 工具名称 | 描述 |
|---------|------|
| initProjectTool | 通过复制模板初始化新项目 | 