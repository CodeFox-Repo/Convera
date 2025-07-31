# Client-Side Tool Development Guide

This document provides a comprehensive guide on how to develop a complete client-side tool in FoxyChat, from tool implementation to UI rendering.

## Table of Contents
1. [Tool Architecture Overview](#tool-architecture-overview)
2. [Step 1: Implement the Tool](#step-1-implement-the-tool)
3. [Step 2: Register the Tool](#step-2-register-the-tool)
4. [Step 3: Implement Custom UI Component](#step-3-implement-custom-ui-component)
5. [Step 4: UI Style Guide](#step-4-ui-style-guide)
6. [Step 5: Type Safety](#step-5-type-safety)
7. [Complete Example: execute-command](#complete-example-execute-command)
8. [Best Practices](#best-practices)

## Tool Architecture Overview

FoxyChat's tool system is organized into several layers:

```
┌─────────────────────────────────────────┐
│             Frontend UI Layer            │
│  ┌─────────────────────────────────────┐ │
│  │     Custom Render Components        │ │
│  │    (execute-command.tsx)            │ │
│  └─────────────────────────────────────┘ │
│  ┌─────────────────────────────────────┐ │
│  │     Default Render Component        │ │
│  │    (command-content.tsx)            │ │
│  └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│           Tool Registration Layer        │
│  - tools/index.ts (export tools)        │
│  - mcp/hub.ts (register to system)      │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│          Tool Implementation Layer       │
│  - tools/execute-command.ts             │
│  - tools/web-fetch.ts                   │
└─────────────────────────────────────────┘
```

## Step 1: Implement the Tool

### 1.1 Create Tool File

Create a tool file in the `app/src/electron/tools/` directory:

```typescript
// app/src/electron/tools/your-tool.ts
import { tool } from "ai";
import { z } from "zod";

export const yourTool = tool({
  name: "your-tool-name", // Important: use kebab-case naming
  description: "Tool description that AI uses to decide when to use this tool",
  parameters: z.object({
    // Define tool parameters
    param1: z.string().describe("Description of parameter 1"),
    param2: z.number().optional().describe("Optional parameter 2"),
  }),
  execute: async ({ param1, param2 }) => {
    try {
      // Implement tool logic
      const result = await yourToolLogic(param1, param2);
      
      return {
        success: true,
        message: `Operation successful: ${result}`,
        data: result, // Optional additional data
      };
    } catch (error) {
      return {
        success: false,
        message: `Operation failed: ${error.message}`,
        error: error.message,
      };
    }
  },
});
```

### 1.2 Tool Naming Conventions

- **Tool Name**: Use kebab-case (e.g., `execute-command`, `web-fetch`)
- **File Name**: Use kebab-case (e.g., `execute-command.ts`)
- **Export Name**: Use camelCase (e.g., `executeCommand`, `webFetch`)

## Step 2: Register the Tool

### 2.1 Export in tools/index.ts

```typescript
// app/src/electron/tools/index.ts
import { executeCommand } from "./execute-command";
import { yourTool } from "./your-tool";

export const builtinTools = {
  executeCommand,
  yourTool,
};
```

### 2.2 Register in mcp/hub.ts

Add tool handling in the `mcpToolCall` method:

```typescript
// app/src/electron/mcp/hub.ts
async mcpToolCall(toolName: string, args: Record<string, unknown>): Promise<unknown> {
  // Check for builtin tools
  if (toolName === "execute-command") {
    // Handle execute-command
  } else if (toolName === "your-tool-name") {
    // Handle your tool
    try {
      const param1 = args.param1 as string;
      const param2 = args.param2 as number;
      
      return await yourTool.execute(
        { param1, param2 },
        { toolCallId: `builtin-${toolName}-${Date.now()}`, messages: [] }
      );
    } catch (error) {
      return `Tool execution failed: ${error.message}`;
    }
  }
  
  // Continue checking MCP server tools...
}
```

Also add to `getBuiltinTools` method to include the tool in system listings.

## Step 3: Implement Custom UI Component

### 3.1 Create Tool Renderer Component

Create in `app/src/renderer/components/chat/tools/` directory:

```typescript
// app/src/renderer/components/chat/tools/your-tool.tsx
import { Loader2 } from "lucide-react";
import React, { memo } from "react";
import { ToolInvocation } from "../types";
import { Markdown } from "../../common/markdown";

export interface YourToolRendererProps {
  toolInvocation: ToolInvocation;
}

export const YourToolRenderer = memo(({ toolInvocation }: YourToolRendererProps) => {
  let isCompleted = false;
  let result = "";

  // Extract parameters
  const param1 = String(toolInvocation.args?.param1 || "");

  // Check if completed
  if (toolInvocation.state === "result" && "result" in toolInvocation) {
    isCompleted = true;
    const toolResult = toolInvocation.result as any;
    
    if (typeof toolResult === "string") {
      result = toolResult;
    } else if (toolResult && typeof toolResult === "object") {
      result = toolResult.message || JSON.stringify(toolResult, null, 2);
    }
  }

  return (
    <div className="space-y-3">
      {/* Tool Status */}
      <div className="flex items-center gap-2 text-xs text-foreground/60 font-medium">
        <span>🔧 Your tool is running "{param1}"</span>
        {!isCompleted && <Loader2 className="h-3 w-3 animate-spin" />}
      </div>

      {/* Results */}
      {isCompleted && result && (
        <div className="space-y-1">
          <div className="text-xs text-foreground/60 font-medium">Result:</div>
          <div className="text-sm text-foreground pl-4">
            <Markdown>{\`\`\`\n${result}\n\`\`\`}</Markdown>
          </div>
        </div>
      )}
    </div>
  );
});

YourToolRenderer.displayName = "YourToolRenderer";
```

### 3.2 Register UI Component

Add mapping in `tools/index.tsx`:

```typescript
// app/src/renderer/components/chat/tools/index.tsx
import { YourToolRenderer } from "./your-tool";

export const TOOL_COMPONENTS = {
  "execute-command": ExecuteCommandRenderer,
  "your-tool-name": YourToolRenderer, // Add your tool
} as const;
```

## Step 4: UI Style Guide

### 4.1 Basic Structure

All custom tool renderers should follow this structure:

```typescript
<div className="space-y-3">
  {/* Tool Status Row */}
  <div className="flex items-center gap-2 text-xs text-foreground/60 font-medium">
    <span>{icon} {descriptive text}</span>
    {!isCompleted && <Loader2 className="h-3 w-3 animate-spin" />}
  </div>

  {/* Results Display Area */}
  {isCompleted && (
    <div className="space-y-1">
      <div className="text-xs text-foreground/60 font-medium">Result label:</div>
      <div className="content-area">
        {/* Content */}
      </div>
    </div>
  )}
</div>
```

### 4.2 Color Scheme

- **Primary Text**: `text-foreground`
- **Secondary Text**: `text-foreground/60`
- **Hint Text**: `text-foreground/50`
- **Borders**: `border-foreground/10`
- **Backgrounds**: `bg-foreground/5`

### 4.3 Icon Usage

- **Command Execution**: 💻 or 🔧
- **Network Requests**: 🔍 or 🌐
- **File Operations**: 📁 or 📄
- **Data Processing**: ⚙️ or 🔄

### 4.4 Code Block Display

For displaying code or structured data:

```typescript
// Use new Markdown component (built-in copy functionality)
<Markdown>{\`\`\`${language}\n${code}\n\`\`\`}</Markdown>

// Or use standalone CodeBlock component
<CodeBlock 
  code={code} 
  language={language} 
  title="Custom Title"
  showCopyButton={true} 
/>
```

## Step 5: Type Safety

### 5.1 Use Unified Type System

Import types from `chat/types.ts`:

```typescript
import { ToolInvocation, UIMessage } from "../types";
```

### 5.2 Avoid Duplicate Type Definitions

Don't redefine existing types. Use types provided by AI SDK directly.

## Complete Example: execute-command

Reference the complete implementation of the `execute-command` tool:

### Tool Implementation
- File: `app/src/electron/tools/execute-command.ts`
- Function: Execute shell commands
- Parameters: `command` (string), `timeout` (number)

### UI Component
- File: `app/src/renderer/components/chat/tools/execute-command.tsx`
- Features: Terminal-style display, command and output in same code block

### Visual Effect
```
💻 Executing command [spinning icon]

┌─────────────────────────────────────┐
│ Terminal                      Copy  │
├─────────────────────────────────────┤
│ $ echo hello world                  │
│ hello world                         │
└─────────────────────────────────────┘
```

## Best Practices

### 1. Error Handling
- Always return structured result objects
- Include `success` field to indicate operation status
- Provide clear error messages

### 2. Parameter Validation
- Use Zod for parameter validation
- Provide clear parameter descriptions
- Set reasonable defaults for optional parameters

### 3. UI Consistency
- Follow unified color and spacing guidelines
- Use appropriate loading state indicators
- Maintain consistency with overall design

### 4. Performance Considerations
- Use `memo` to wrap components
- Avoid unnecessary re-renders
- Handle large data displays appropriately

### 5. Accessibility
- Provide appropriate `aria-label` attributes
- Use semantic HTML structure
- Ensure keyboard navigation works

---

By following this guide, you can quickly develop feature-complete, visually appealing client-side tools. Always think from the user experience perspective when designing and implementing tools.