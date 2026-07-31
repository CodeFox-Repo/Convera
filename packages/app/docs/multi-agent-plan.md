# Multi-agent workspace — 方案

目标:从「一个人对一个助手」变成「一个频道里,人和多个 agent 一起干活」。参考 Honeycomb 那套
Slack-like 的信息架构和图标/排版语言,但配色、字体、圆角全部走我们自己的 theme token。

---

## 1. 为什么这不是「加个功能」

现在的模型是单线的:

```
Conversation ──agentId──> Agent        一条会话绑定一个 agent
Message      ──role────> user|assistant  发言者只有两种
```

Honeycomb 那套是这样:

```
Workspace ──> Group ──> Channel ──> Message ──senderId──> Human | Agent
                                       └──> mentions[]  (@Fizz 触发某个 agent 回复)
```

差别不在 UI,在于**「发言者」从一个二元 role 变成了一个实体**。这一条决定了下面所有事:
消息要显示头像和名字、`@Fizz` 要能定向唤起、多个 agent 能在同一条线程里交替发言、
侧栏要能按组归类频道。

### 1.1 一条频道 = N 条并行的私有会话

关键认识:**每个 agent 有自己的 conversation,不是共享一条。** 频道里看到的那条时间线是
「公共记录」,但每个 agent 手里握着的是**它自己视角的那一份**。

```
公共频道 #flight-path(用户看到的)
   Maya: 这个交接太快了
   Fizz: 好的,三拍方案……
   Honey: 我来补最后一版

每个 agent 私有的会话(发给 provider 的)
   ┌ Fizz 的 ────────────────────┐  ┌ Honey 的 ───────────────────┐
   │ system: <Fizz 的 prompt>     │  │ system: <Honey 的 prompt>    │
   │ user:      Maya: 这个交接…   │  │ user:      Maya: 这个交接…   │
   │ assistant: 好的,三拍方案…   │  │ user:      Fizz: 好的,三拍… │
   │ user:      Honey: 我来补…    │  │ assistant: 我来补最后一版    │
   └──────────────────────────────┘  └──────────────────────────────┘
        ↑ 自己说的是 assistant            ↑ 同一句话,在不同视角里 role 不同
```

**role 的方向不能搞反。** 对某个 agent:

| 频道里的发言 | 发给 **Fizz** 时 | 发给 **Honey** 时 |
|---|---|---|
| Fizz 自己说的 | `assistant`(它自己的输出) | `user`,前缀 `Fizz: ` |
| Honey 说的 | `user`,前缀 `Honey: ` | `assistant`(它自己的输出) |
| 人类 Maya 说的 | `user`,前缀 `Maya Chen: ` | `user`,前缀 `Maya Chen: ` |

**自己说过的话必须是 `assistant`**。反过来(自己是 `user`)会让模型以为它的历史发言是别人说的,
于是开始续写别人的话——这不是命名问题,是会真的坏掉。

### 1.2 为什么是「投影」而不是「各存一份」

Provider 是**无状态**的:`ClaudeCodeAdapter` / `CodexCliAdapter` 每次 `startChat` 都接收完整
`messages` 数组,没有 sessionId、没有 resume(见 `src/electron/ai/providers/`)。所以
「每个 agent 的会话」不是远端的一个句柄,而是**我们本地组装出来的一个数组**。

于是有两种存法:

| | 各存一份(物化) | 单一记录 + 投影 |
|---|---|---|
| 存储 | 每个 agent 一份 message 副本,N 个 agent = N 倍 | 一份公共记录 |
| 改历史(编辑/重生成/分支) | 要同步 N 份,不同步就分叉 | 改一处 |
| 加新 agent 进频道 | 它没有历史,看不见之前的对话 | 立刻拥有完整上下文 |
| 一致性风险 | 高 | 无 |

选**单一记录 + 投影**:消息只存一份(带 `senderId`),发请求时按目标 agent 现算它的视角。
「每个 agent 有自己的会话」这个语义完全保留 —— 只是那条会话是**算出来的,不是存出来的**。

一个纯函数搞定,好测:

```ts
projectFor(agentMemberId, messages, members) → LocalAIMessage[]
```

Provider 侧零改动,IPC 校验器零改动(它只认 `system|user|assistant`,投影结果正好只有这三种)。

### 1.3 每个 agent 的 systemPrompt

`LocalAIChatRequest.agent` 是 `{id?, systemPrompt?}`,本来就是**每次请求传**的
(`src/shared/types/local-ai.ts`)。所以唤起哪个 agent 就传哪个的 prompt —— 现有结构直接够用,
不用改 IPC。

投影时还要在 systemPrompt 后面追加一段**频道情境**,否则 agent 不知道自己是谁、旁边有谁:

```
<agent 自己的 systemPrompt>

You are "Fizz" in the channel #flight-path.
Other participants: Maya Chen (human), Jordan Brooks (human), Honey (agent).
Messages from others are prefixed with the speaker's name. Your own replies are
not prefixed. Mention someone with @Name to bring them in.
```

没有这段,agent 会把 `Maya Chen: ` 这个前缀当成正文的一部分,也不知道 `@Honey` 是可用的动作。

### 1.4 Agent 是持久实体,不是一段 prompt

一个 agent 要能**出现在多个讨论组、同时和不同的人 1:1**,并且在所有这些场合里是**同一个它** ——
同一套技能、同一份记忆、同一个人设。所以 agent 不能是「频道的一个属性」,必须是独立实体,
频道和 DM 只是它**出现的场所**。

```
Agent (Fizz) ──┬─→ #flight-path   (和 Maya、Jordan、Honey)
               ├─→ #design        (和 Camille)
               └─→ DM with Maya   (1:1)
                    ↑ 三个场所,同一个 Fizz:同一份 SOUL.md、同一批 skill、同一个 sandbox
```

**记忆必须分两层**,否则要么串味要么失忆:

| 层 | 存在哪 | 跨场所 | 用途 |
|---|---|---|---|
| **身份记忆** | `<sandbox>/SOUL.md` + `memory/` | ✅ 共享 | 我是谁、我的偏好、我学到的通则 |
| **场所记忆** | 各频道自己的 message 记录 | ❌ 隔离 | 这个频道聊到哪了 |

Fizz 在 #design 学到的通用教训应该带到 #flight-path;但 #design 的具体对话**不该**泄漏到
#flight-path —— 那是别人的频道,可能还是私有的。这条边界是隐私要求,不只是设计品味。

#### Sandbox 布局

每个 agent 一个目录(本地,`app.getPath("userData")` 下):

```
agents/<agentId>/
  SOUL.md          人设、语气、边界 —— 每次请求都注入 systemPrompt
  memory/
    MEMORY.md      索引(仿 Claude Code 的记忆结构,你已经在用这套)
    *.md           一条一个事实
  skills/
    <name>/SKILL.md  可被唤起的能力
  workspace/       它的可写工作区(产物、草稿、临时文件)
```

**地基已经存在,不用新建机制:**

- `LocalAIChatRequest.options.cwd` 已在 IPC 契约里,且已被校验(`MAX_CWD_CHARS`)
- `codex-cli.ts:128` 已经有 `writableRoots: cwd ? [cwd] : []` —— **传 cwd 就等于限定了可写根**
- `claude-code.ts:80` 已经把 `cwd` 透传给 SDK

所以「给 agent 一个沙箱」= 建目录 + 唤起时传 `options.cwd = agents/<id>/workspace`。
现有代码零改动。

#### Agent 的工具集 = 一个聊天 App 该有的能力

Agent 不只是「回一段文字」,它是频道里的参与者,所以要给它参与者的动作:

| 工具 | 作用 | 边界 |
|---|---|---|
| `send_message(channelId, text)` | 在某个频道发言 | 只能发到**它是成员**的频道 |
| `edit_message(messageId, text)` | 编辑消息 | 只能编辑**自己发的** |
| `react(messageId, emoji)` | 加表情 | — |
| `read_channel(channelId, limit)` | 读频道历史 | 只能读它是成员的频道 |
| `list_members(channelId)` | 看有谁在 | — |
| `read_file` / `write_file` / `list_dir` | 读写自己的 sandbox | 强制 `resolveInSandbox`(§1.5) |
| `remember(fact)` | 写一条记忆到 `memory/` | 落在自己 sandbox 内 |

**这些工具走现有的 `AgentTool` 机制**(`src/electron/ai/agent-tools.ts`),和 MCP 工具同一条
通路,包括已有的审批交互(`requestInteraction`)。不需要新机制。

三条必须守住的边界(每条一个测试):

1. **发言身份不可伪造** —— `send_message` 的 `senderId` 由**我们**填成该 agent 的 memberId,
   不接受模型指定。否则 Fizz 能冒充 Maya 说话。
2. **频道成员制** —— agent 只能读写它是成员的频道。这是 §1.4 「场所记忆隔离」的执行点。
3. **编辑只限自己** —— `edit_message` 校验 `message.senderId === 调用者`。

> ⚠️ `send_message` 让 agent 能主动发消息,**这会和链式唤起叠加**:agent A 发消息到频道 →
> 触发频道里的 agent B → B 再发 → …… §3 的 3 跳上限必须覆盖「工具发起的消息」,
> 不能只覆盖 `@mention`,否则绕过上限无限循环。

#### Skill 与 memory 怎么进模型

先用**最省的做法**,不上检索:

1. `SOUL.md` 全文注入 systemPrompt(人设必须每次在场)
2. `memory/MEMORY.md` 的索引行注入(一行一条,便宜)
3. `skills/*/SKILL.md` 只注入 name + description 清单
4. 正文按需读 —— agent 想看全文时用文件工具去读(cwd 已经指向它的沙箱)

这和 Claude Code 自己的做法一致:索引常驻,正文按需。真需要语义检索再说,那是后话。

> ⚠️ **安全边界**:给 agent 文件工具就等于给了它读写能力。`writableRoots` 限制的是**写**,
> 读没有天然边界 —— 一个 agent 能不能读到另一个 agent 的 sandbox,需要显式挡。
> 建议:文件工具的路径解析强制落在该 agent 自己的 `agents/<id>/` 内,越界直接拒绝,
> 并写一条测试锁住。这条不做的话,「每个 agent 有自己的 sandbox」只是目录分开了,不是隔离。

---

## 1.5 Provider 抽象与 sandbox 归属(地基决策)

### 现状:两个 provider 的隔离强度不一样

| | `codex-cli` | `claude-code` |
|---|---|---|
| sandbox | `sandboxPolicy: { workspaceWrite, writableRoots, networkAccess: false }`(`codex-cli.ts:126`) | **无** —— 只传了 `cwd`(`claude-code.ts:80`) |
| 强制层 | OS 级,越界被内核拒 | 无强制 |

**这是当前最该修的地基裂缝**:同一个 agent 换个 provider,安全边界就变了。而且 `cwd` 只是
「工作目录」,不是「牢笼」—— 传了 cwd 不等于限制了范围。

### 「走 API 自己实现 sandbox」为什么是反的

直觉是「不走它们的 harness 就没有 sandbox issue」,但实际相反:

- **CLI 路线**:沙箱由 codex 的 OS 级机制强制。模型想写 `../../.ssh/id_rsa`,**内核**拒绝。
- **裸 API 路线**:模型返回 `{tool:"write_file", path:"../../.ssh/id_rsa"}`,**执行的是我们的代码**。
  路径规范化、symlink 逃逸、TOCTOU 竞态、硬链接 —— 全部我们自己扛,而且写错了没人兜底。

走 API 不是**消除**了沙箱问题,是把它从 OS **接管到我们手里**。除非我们打算认真实现 OS 级隔离
(macOS Seatbelt / Linux namespace),否则自研沙箱只会更弱。

另外走裸 API 还会丢掉:CLI 的订阅额度(用户已登录的 Claude/Codex 账号,不需要单独 API key)、
上游对工具协议的持续维护。

### 结论:抽象一层 sandbox,但不自己实现隔离

`LocalAiProviderAdapter` 已经是抽象层了(`provider-adapter.ts`),缺的是**沙箱是它契约的一部分**。
把 sandbox 从「各 adapter 各自处理」提升成**适配器必须履约的能力**:

```ts
export interface AgentSandbox {
  /** agent 的根目录,一切路径必须落在其内 */
  root: string;
  /** 可写子目录(通常是 <root>/workspace) */
  writableRoots: string[];
  networkAccess: boolean;
}

export interface LocalAiProviderAdapter {
  readonly id: LocalAiProviderId;
  /** 该 adapter 能把沙箱下推到进程/OS 级,而不是仅靠我们自觉 */
  readonly enforcesSandbox: boolean;
  createModel(
    request, status,
    context: { tools; requestInteraction; sandbox: AgentSandbox },  // ← 新增
  ): Promise<LanguageModel>;
}
```

然后**双层设防**,两层都要有:

1. **下推层**:adapter 把 `sandbox` 翻译成各自的原生机制。
   - `codex-cli` → `sandboxPolicy.writableRoots`(已有,接上即可)
   - `claude-code` → Agent SDK 的权限配置;**若做不到就 `enforcesSandbox = false`**,由第 2 层兜底
2. **强制层(我们自己的,永远在)**:所有文件工具的路径解析统一走一个
   `resolveInSandbox(sandbox, path)` —— `realpath` 之后必须仍在 `root` 内,否则拒绝。
   这一层不依赖 provider,**即使 provider 完全不设防也安全**。

> 为什么两层都要:第 1 层是纵深防御(provider 自己拦最好),第 2 层是我们的兜底
> (`claude-code` 现在就没有第 1 层)。只做第 1 层 → 换 provider 就漏;只做第 2 层 →
> 我们代码有 bug 就漏。这两层加起来才叫地基。

`resolveInSandbox` 必须处理:`..` 逃逸、符号链接(`realpath` 后再判断,不能只做字符串前缀)、
路径大小写(macOS 默认大小写不敏感)。这三条各写一条测试。

### 关于 CPA / 走本地模型

`LocalAiProviderAdapter` 是现成的扩展点 —— 加一个 OpenAI 兼容的 adapter(指向本地
CPA/Ollama/vLLM)只是新增一个文件,不用改 runtime、IPC 或 renderer。**建议现在就把 sandbox
写进 adapter 契约**,这样将来加的 adapter 天然被约束,而不是「先加进来,以后再补隔离」。

但**不建议现在就把 CLI 换掉**:订阅额度和 OS 级沙箱都是实打实的好处。正确顺序是
**先把契约做对,再让 adapter 变多**。

---

---

## 2. 数据模型

Dexie 现在是 `version(1)`(`src/renderer/libs/db/database.ts`)。加 `version(2)` + upgrade,
**不破坏现有数据**。

### 2.1 新表

```ts
interface Workspace {          // 顶层,先固定一个 "personal",为将来多工作区留位
  id: string;
  name: string;
  createdAt: Date;
}

interface Group {              // 侧栏里的 "The Hive" / "Product" / "Launch Swarm"
  id: string;
  workspaceId: string;
  name: string;
  icon: string | null;         // emoji 或 lucide 名
  sortOrder: number;
}

interface Channel {            // 原 Conversation 的超集
  id: string;
  workspaceId: string;
  groupId: string | null;      // null = 未分组(现有会话迁移到这里)
  name: string | null;         // null 时回落到自动标题,和现在行为一致
  kind: "channel" | "dm" | "thread";
  isPrivate: boolean;          // 侧栏显示 🔒 而不是 #
  memberIds: string[];         // 人 + agent 混合,决定谁能被 @
  defaultAgentId: string | null; // 不 @ 任何人时由谁回复
  metadata: Conversation["metadata"];  // archived / starred / branchedFrom 原样保留
  createdAt: Date;
  updatedAt: Date;
}

interface Member {             // 人和 agent 的统一身份
  id: string;
  workspaceId: string;
  kind: "human" | "agent";
  name: string;
  avatar: string | null;       // emoji / dataURL
  agentId: string | null;      // kind==="agent" 时指向现有 agents 表
  status: "idle" | "working" | "offline";  // 底部状态栏用
}
```

现有 `Agent` 表加沙箱字段(全部可选,老 agent 不迁移也能用):

```ts
interface Agent {
  // ... 现有字段不动
  sandboxPath?: string;   // agents/<id>,缺省时首次唤起惰性创建
  soul?: string;          // SOUL.md 的缓存;真相源是磁盘文件
}
```

**`Member` 和 `Agent` 是多对一**:一个 Agent(Fizz)在多个 workspace/频道里出现,
但**只有一个 sandbox**。所以 sandbox 挂在 `Agent` 上,不是 `Member` 上 —— 这正是
「同一个 Fizz 出现在不同讨论组」的实现方式。

### 2.2 现有表的改动

`Message` 加三个可选字段,**全部可选**,老数据不迁移也能读:

```ts
interface Message {
  // ... 现有字段不动
  channelId?: string;      // 新写入用这个;读取时 conversationId ?? channelId
  senderId?: string;       // 指向 Member.id;缺省时按 role 推断
  mentions?: string[];     // Member.id[],决定唤起谁
  reactions?: Record<string, string[]>;  // emoji -> memberId[]
  threadParentId?: string; // 线程回复
}
```

`Conversation` 不删。`Channel` 是它的超集,迁移时一条会话变一个 `kind: "channel"`、
`groupId: null` 的 channel。**保留 `conversations` 表是刻意的** —— 一旦发现问题可以回退,
而且现有 `chat-store` 的读路径不用一次性全改。

### 2.3 迁移

```ts
this.version(2).stores({
  workspaces: "id",
  groups: "id, workspaceId, sortOrder",
  channels: "id, workspaceId, groupId, updatedAt, [metadata.starred]",
  members: "id, workspaceId, kind",
  // 现有表保持不变
}).upgrade(async (tx) => {
  // 1. 建 personal workspace
  // 2. 每条 conversation → 一个 channel(groupId: null)
  // 3. 建两个 member:本人(human)、每个已有 agent 各一个(agent)
  // 4. 历史 message 不回填 senderId —— 读取时按 role 推断,零成本
});
```

---

## 3. 唤起逻辑(核心)

新文件 `src/renderer/libs/agent-routing.ts`:

```
用户发一条消息
  ├─ 解析 @mentions → Member.id[]
  ├─ 有 mention  → 依次唤起每个被 @ 的 agent
  └─ 没有 mention → 唤起 channel.defaultAgentId(没有就不唤起,纯人类频道)

每个被唤起的 agent:
  ├─ projectFor(agentMemberId, messages, members)   ← §1.1 的视角投影
  ├─ buildSystemPrompt(agent)                       ← SOUL.md + 记忆索引 + skill 清单 + 频道情境
  ├─ startChat({
  │     agent: { id, systemPrompt },
  │     options: { cwd: `${sandboxPath}/workspace` }  ← §1.4 沙箱
  │   })
  └─ 回复落库时 senderId = 该 agent 的 memberId
```

**agent 之间能互相 @**(截图里 Fizz 结尾 `@Honey over to you`)。这是链式唤起,必须设上限:

- 单条用户消息触发的链最多 **3 跳**
- 同一个 agent 在一条链里最多被唤起 **1 次**(防 A→B→A 死循环)
- 超限时静默停止,并在 UI 上标一条 `chain limit reached`

没有这个上限,两个 agent 互相 @ 会无限烧 token。这是我在这个方案里唯一强烈建议不要砍的东西。

---

## 4. UI

### 4.1 布局(照搬 Honeycomb 的信息架构,不照搬颜色)

```
┌──────────────┬────────────────────────────────────────┐
│ Search  ⌘K   │  # flight-path            👥9  🎧  ⚙  │
│ Inbox        ├────────────────────────────────────────┤
│ Agents       │                                        │
│              │  ── NEW ──────────────────             │
│ 🐝 The Hive  │  [av] Maya Chen  3:25 PM               │
│  # announce  │       消息正文                          │
│  # general   │       😀2  💬1                          │
│              │                                        │
│ 🔧 Product   │  [av] Fizz  3:25 PM                    │
│  # design    │       markdown 正文(现有渲染不变)      │
│  # flight ●  │       @Honey over to you                │
│  # mobile    │                                        │
│              ├────────────────────────────────────────┤
│ DMs          │  Message #flight-path                  │
│  Jordan   1  │  @ 📎 😀 AA                        ↑   │
│──────────────┤                                        │
│ [av] 本人     │  🐝 Honey: Working                     │
└──────────────┴────────────────────────────────────────┘
```

组件拆解(新增,不改现有 chat 渲染):

| 文件 | 职责 |
|---|---|
| `sidebar/WorkspaceSidebar.tsx` | 替换现在的会话列表;组 → 频道两层 |
| `sidebar/GroupSection.tsx` | 可折叠的组,`#` / `🔒` 前缀,未读圆点 |
| `chat/message/MessageRow.tsx` | 头像 + 名字 + 时间 + 正文 + reactions(取代现在的气泡) |
| `chat/message/MentionChip.tsx` | `@Fizz` 那个带 bot 图标的 chip |
| `chat/input/MentionAutocomplete.tsx` | 输入 `@` 弹成员列表 |
| `chat/AgentStatusBar.tsx` | 底部 `Honey: Working` |
| `chat/ChannelHeader.tsx` | `# name` + 成员数 |

### 4.2 设计语言映射(借鉴形式,用我们的 token)

Honeycomb 的**结构**值得抄,**配色不抄** —— 我们已经有一套暖色 theme
(`src/renderer/theme.css`:`--background: rgb(250 249 245)` 奶油底、
`--primary: rgb(176 83 47)` 陶土橙、`--sidebar: rgb(245 243 236)`)。它和截图那套暖调本来就是同族,
直接用我们的即可。

| 截图里的元素 | 我们用什么 |
|---|---|
| 侧栏底色(浅黄绿) | `bg-sidebar` — 已经是比主区略深的暖灰,同样的层次关系 |
| 选中频道高亮 | `bg-sidebar-accent` + `text-sidebar-accent-foreground` |
| 未读圆点 | `bg-primary`(陶土橙),不是截图的蓝 |
| `@Fizz` chip | `bg-muted` + `text-foreground`,bot 图标 `text-muted-foreground` |
| agent 头像 | 圆角方(`rounded-md`),人类头像用圆(`rounded-full`)——**用形状区分人和 agent,不靠颜色**,色盲可用 |
| 分隔线 / 边框 | `border-border` |
| 频道名 `#` 前缀 | `text-muted-foreground`,名字本身 `text-foreground` |
| 正文字体 | `--font-sans`(Inter,已有);代码 `--font-mono`(JetBrains Mono) |
| 圆角 | `--radius: 0.5rem`,已有 |

字号沿用现有 Tailwind scale:频道名 `text-sm`,消息正文 `text-sm`,时间戳 `text-xs
text-muted-foreground`,组标题 `text-xs font-medium text-muted-foreground uppercase`。

**遵守项目铁律**:除 `base-layout.tsx` 外不加 `bg-background`;侧栏用 `bg-sidebar` 是既有 token,
不算违规。

---

## 5. 分期(每期都可独立发布 / 回退)

### Phase 0 — 地基(先做,后面全都依赖它)
- `AgentSandbox` 进 `LocalAiProviderAdapter` 契约 + `enforcesSandbox` 标志
- `resolveInSandbox()` + 测试(`..` / symlink / 大小写)
- 把 `codex-cli` 现有的 `writableRoots` 接到新契约上
- **补上 `claude-code` 缺失的沙箱约束**(或显式标记 `enforcesSandbox: false`)
- 验收:两个 provider 的隔离强度一致;越界访问在两条路径上都被拒

> 这一期没有任何 UI 变化,但它决定了后面三期的安全底线。**先做这个**,
> 因为 Phase 3 给 agent 开文件工具的那一刻,这层不在就是个洞。

### Phase 1 — 身份(不改布局)
- `members` 表 + 迁移;`Message.senderId`
- `MessageRow`:头像 + 名字 + 时间戳,取代现在的气泡
- **人 = 圆头像,agent = 方头像**
- 验收:现有会话照常工作,消息带上了发言者

### Phase 2 — 视角投影 + @mention 唤起(核心价值)
- `projectFor()` + 单测(**先写测试**,role 方向搞反是最容易犯也最难发现的错)
- `MentionAutocomplete`、`MentionChip`
- 链式唤起 + 3 跳上限
- `AgentStatusBar`
- 验收:一个频道里 @ 不同 agent 能各自回复;每个 agent 只把自己说的话当 `assistant`;
  agent 能互相接力且不会无限循环

### Phase 3 — SOUL / memory / skills / 工具(让 agent 成为持久实体)
- `agents/<id>/` 目录脚手架 + 惰性创建
- `buildSystemPrompt()`:SOUL.md 全文 + 记忆索引 + skill 清单 + 频道情境
- 唤起时传 `options.cwd` + `sandbox`(P0 的契约)
- **聊天工具集**:`send_message` / `edit_message` / `react` / `read_channel`(§1.4)
  - 身份不可伪造、频道成员制、编辑只限自己 —— 各一条测试
  - 工具发起的消息也计入 3 跳上限
- **文件工具**:`read_file` / `write_file` / `list_dir` / `remember`,全部过 `resolveInSandbox`
- Agent 设置页:编辑 SOUL.md、看记忆、看 skill
- 验收:同一个 agent 在两个频道里保有同一套人设和记忆;A 读不到 B 的 sandbox;
  agent 能自己发消息、编辑自己的消息,但改不了别人的

### Phase 4 — 频道与分组(信息架构)
- `channels` / `groups` 表 + 迁移
- `WorkspaceSidebar` 替换现有列表
- DM(`kind: "dm"`,和 agent 1:1)
- 频道设置(成员、默认 agent、私有)
- 验收:侧栏呈现 组 → 频道,老会话落在「未分组」

### Phase 5 — 协作细节
- reactions、线程、未读标记、`NEW` 分隔线

**建议顺序 1 → 2 → 3**。侧栏(Phase 4)最显眼但价值最低,它只是重新排列;真正让产品变样的是
「@ 得到不同的 agent」(P2)和「agent 有自己的灵魂和记忆」(P3)。

> **Phase 3 的一个前置判断**:现在 `ClaudeCodeAdapter` 是 `tools: []` —— 文本聊天不带文件工具
> (`claude-code.ts:26`)。要让 agent 真的读写自己的 sandbox,得给它文件工具。这是一次能力扩张,
> 不是配置项:开之前得先把 §1.4 的路径边界做掉。做 P3 时我会先单独确认这一步。

---

## 6. 风险

| 风险 | 处理 |
|---|---|
| **投影 role 搞反** → agent 续写别人的话 | Phase 2 先写测试;这是最隐蔽的 bug,表现为「agent 人格错乱」而不是报错 |
| 链式唤起烧 token | 硬上限 3 跳 + 同 agent 不重入 |
| **agent 读到别的 agent 的 sandbox** | **Phase 0** 的 `resolveInSandbox` 兜底;`writableRoots` 只管写不管读 |
| **两个 provider 隔离强度不一致** | Phase 0 统一契约;`claude-code` 目前**完全没有** sandbox policy |
| **agent 冒充别人发言** | `send_message` 的 senderId 由我们填,不接受模型指定 |
| **工具发消息绕过链式上限** | 3 跳上限覆盖「所有新消息」,不只是 @mention |
| 长频道投影后超上下文 | 投影时按 token 预算截断,保留最近 N 条 + system;P2 先做简单截断 |
| Dexie 迁移弄坏历史 | 新表旁挂,`conversations` 不动,可回退 |
| 一次改太多 | 分 5 期,每期能独立发 |
| 侧栏重做碰到很多现有组件 | 排到 Phase 4,前三期完全不碰布局 |

---

## 7. 需要你拍板的

### 已确认

- ✅ **1:1 = 和不同的 agent 1:1**(单机 local-first,没有协作后端)
- ✅ **工具全开** —— agent 要有一个聊天 App 参与者该有的能力:发消息、编辑消息、读频道、
  读写自己的 sandbox(§1.4 工具表)
- ✅ **sandbox 抽象一层,但不自研隔离** —— 契约进 adapter,双层设防(§1.5)
- ✅ **继续走 CLI,不换裸 API** —— 保留订阅额度和 OS 级沙箱;adapter 层留好 CPA/本地模型的扩展点

### 还需要你拍板

1. **agent 之间能否看到彼此**:我默认**能**(频道情境列出同频道成员,否则 `@Honey` 无从谈起),
   但**记忆隔离**。这个默认对吗?

2. **agent 主动发言要不要审批**:`send_message` 让 agent 能不经你同意就在频道里发言。
   两个选项 —— (a) 直接发,靠 3 跳上限兜底;(b) 首次发言要你确认,之后该频道免审批。
   我倾向 (a),因为这是它作为参与者的基本能力,但 (b) 更稳。

3. **Phase 0 现在做吗**:它没有任何 UI 产出,但它是 Phase 3 开工具的前提。
   我建议**先做**——否则开工具那天要么等它,要么带着洞上线。
