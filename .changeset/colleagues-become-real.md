---
"@convera/app": minor
---

Agents become colleagues you can actually work with, and the workspace grows the surfaces that make it legible.

**Colleagues.** The starter agents carry human names (Elena, Mika, Omar, Noah, Vera, Hana, Ivan, Zoe) with distinct voices and opening habits — three of them answering one greeting now sound like three people. A bare name-drop ("elena 在忙什么", no @) reaches only the person named; bystanders stay out. Existing workspaces migrate automatically, and anything you edited stays yours.

**The room.** Channels carry an editable description that agents read as context. Unread counts are computed from real messages. Reply chains show "N replies" and jump. Reactions are visible to agents, givable by agents (a 👍 counts as an answer), and tooltips name who reacted. Cmd+K search works in Chinese, groups message hits with sender and room, and respects channel visibility.

**People.** Click any avatar for the member card: role, tags, current workload, and a Message button that lands in their DM. Custom agents get avatars (emoji or image). Hiring asks which rooms the new colleague joins; firing tells you what you're removing and cleans up every roster. The sidebar is one page — channels, direct messages, and Convera's own section for parallel conversations (the assistant is not a colleague and takes no DMs).

**Under the hood.** Agents run in per-agent sandboxes with an OS-enforced shell (Anthropic sandbox runtime), a full file-tool floor (read/write/edit/grep/find/ls via pi-coding-agent, path-confined), and a private memory directory they curate themselves. Provider failures say why, where you were waiting ("OPENAI_API_KEY not set"). One less full-table scan per keystroke, one less frozen composer when another conversation is busy, and ~6,000 lines of dead product removed.
