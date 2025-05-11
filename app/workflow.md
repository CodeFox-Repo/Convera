## ChatFox Interaction Workflow

```mermaid
%%{init: {'theme': 'neutral', 'themeVariables': { 'primaryColor': '#f0f0f0', 'primaryTextColor': '#333', 'primaryBorderColor': '#ccc', 'lineColor': '#666', 'secondaryColor': '#e6e6e6', 'tertiaryColor': '#fff' }}}%%
sequenceDiagram
    participant User
    participant ActiveApp as Active Application
    participant FoxyChat as FoxyChat

    User->>ActiveApp: Working with application
    User->>FoxyChat: Press Control+Shift+Space to activate
    activate FoxyChat
    FoxyChat->>ActiveApp: Get current application context
    FoxyChat-->>User: Display chat interface
    User->>FoxyChat: Enter command and press Enter
    FoxyChat->>ActiveApp: Execute operation on active app
    ActiveApp-->>User: Operation results
    FoxyChat-->>User: Display results
    User->>FoxyChat: Press Control+Shift+Space to hide
    deactivate FoxyChat
    User->>ActiveApp: Continue working
```

## Workflow Description

1. **Activation Flow**:

   - User works with active application
   - Presses global hotkey (Control+Shift+Space)
   - ChatFox window appears and gains focus

2. **Command Processing Flow**:

   - User enters command and presses Enter
   - ChatFox sends command and context to server
   - Server uses MCP to find and execute appropriate tools

3. **Execution Flow**:

   - MCP tools directly control active application
   - Operation results are provided back to user
   - User can hide ChatFox with hotkey to continue working

4. **Integration Benefits**:
   - No need to switch application context
   - Natural language control of active applications
   - Unified tool interface through MCP

```

```
