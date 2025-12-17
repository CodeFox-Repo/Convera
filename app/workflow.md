## Convera Interaction Workflow (testing)

```mermaid
%%{init: {'theme': 'neutral', 'themeVariables': { 'primaryColor': '#f0f0f0', 'primaryTextColor': '#333', 'primaryBorderColor': '#ccc', 'lineColor': '#666', 'secondaryColor': '#e6e6e6', 'tertiaryColor': '#fff' }}}%%
sequenceDiagram
    participant User
    participant ActiveApp as Active Application
    participant Convera as Convera

    User->>ActiveApp: Working with application
    User->>Convera: Press Control+Shift+Space to activate
    activate Convera
    Convera->>ActiveApp: Get current application context
    Convera-->>User: Display chat interface
    User->>Convera: Enter command and press Enter
    Convera->>ActiveApp: Execute operation on active app
    ActiveApp-->>User: Operation results
    Convera-->>User: Display results
    User->>Convera: Press Control+Shift+Space to hide
    deactivate Convera
    User->>ActiveApp: Continue working
```

## Workflow Description

1. **Activation Flow**:
   - User works with active application
   - Presses global hotkey (Control+Shift+Space)
   - Convera window appears and gains focus

2. **Command Processing Flow**:
   - User enters command and presses Enter
   - Convera sends command and context to server
   - Server uses MCP to find and execute appropriate tools

3. **Execution Flow**:
   - MCP tools directly control active application
   - Operation results are provided back to user
   - User can hide Convera with hotkey to continue working

4. **Integration Benefits**:
   - No need to switch application context
   - Natural language control of active applications
   - Unified tool interface through MCP

```

```
