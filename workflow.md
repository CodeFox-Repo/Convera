## ChatFox Interaction Workflow

```mermaid
%%{init: {'theme': 'neutral', 'themeVariables': { 'primaryColor': '#f0f0f0', 'primaryTextColor': '#333', 'primaryBorderColor': '#ccc', 'lineColor': '#666', 'secondaryColor': '#e6e6e6', 'tertiaryColor': '#fff' }}}%%
sequenceDiagram
    participant User
    participant ActiveApp as Active Application
    participant FoxyFox as FoxyFox

    User->>ActiveApp: Working with application
    User->>FoxyFox: Press Control+Shift+Enter to activate
    activate FoxyFox
    FoxyFox->>ActiveApp: Get current application context
    FoxyFox-->>User: Display chat interface
    User->>FoxyFox: Enter command and press Enter
    FoxyFox->>ActiveApp: Execute operation on active app
    ActiveApp-->>User: Operation results
    FoxyFox-->>User: Display results
    User->>FoxyFox: Press Control+Shift+Enter to hide
    deactivate FoxyFox
    User->>ActiveApp: Continue working
```

## Workflow Description

1. **Activation Flow**:

   - User works with active application
   - Presses global hotkey (Control+Shift+Enter)
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
