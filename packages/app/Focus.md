# Project Focus: foxchat

**Current Goal:** Project directory structure and information

**Project Context:**
Type: Language: typescript
Target Users: Users of foxchat
Main Functionality: Project directory structure and information
Key Requirements:

- Type: React Project
- Language: typescript
- Framework: docker
- File and directory tracking
- Automatic updates

**Development Guidelines:**

- Keep code modular and reusable
- Follow best practices for the project type
- Maintain clean separation of concerns

# 📁 Project Structure

├─ 📄 forge.config.ts (67 lines) - TypeScript source file
├─ 📄 forge.env.d.ts (1 lines) - TypeScript source file
├─ 📄 playwright.config.ts (23 lines) - TypeScript source file
├─ 📄 tailwind.config.js (92 lines) - JavaScript file for client-side functionality
├─ 📄 vite.main.config.ts (10 lines) - TypeScript source file
├─ 📄 vite.preload.config.ts (4 lines) - TypeScript source file
├─ 📄 vitest.config.ts (26 lines) - TypeScript source file
└─ 📁 src
├─ 📄 App.tsx (33 lines) - React component with TypeScript
├─ 📄 main.ts (402 lines) - TypeScript source file
├─ 📄 preload.ts (6 lines) - TypeScript source file
├─ 📄 renderer.ts (1 lines) - TypeScript source file
├─ 📄 types.d.ts (5 lines) - TypeScript source file
├─ 📁 components
│ ├─ 📄 DragWindowRegion.tsx (94 lines) - React component with TypeScript
│ ├─ 📄 LangToggle.tsx (28 lines) - React component with TypeScript
│ ├─ 📄 ToggleTheme.tsx (12 lines) - React component with TypeScript
│ ├─ 📁 chat
│ │ ├─ 📄 ChatContent.tsx (571 lines) - React component with TypeScript
│ │ ├─ 📄 ChatInput.tsx (212 lines) - React component with TypeScript
│ │ └─ 📄 index.tsx (471 lines) - React component with TypeScript
│ └─ 📁 ui
│ ├─ 📄 accordion.tsx (64 lines) - React component with TypeScript
│ ├─ 📄 alert-dialog.tsx (157 lines) - React component with TypeScript
│ ├─ 📄 alert.tsx (66 lines) - React component with TypeScript
│ ├─ 📄 aspect-ratio.tsx (9 lines) - React component with TypeScript
│ ├─ 📄 avatar.tsx (53 lines) - React component with TypeScript
│ ├─ 📄 badge.tsx (46 lines) - React component with TypeScript
│ ├─ 📄 breadcrumb.tsx (109 lines) - React component with TypeScript
│ ├─ 📄 button.tsx (59 lines) - React component with TypeScript
│ ├─ 📄 calendar.tsx (73 lines) - React component with TypeScript
│ ├─ 📄 card.tsx (92 lines) - React component with TypeScript
│ ├─ 📄 carousel.tsx (241 lines) - React component with TypeScript
│ ├─ 📄 chart.tsx (351 lines) - React component with TypeScript
│ ├─ 📄 checkbox.tsx (32 lines) - React component with TypeScript
│ ├─ 📄 collapsible.tsx (31 lines) - React component with TypeScript
│ ├─ 📄 command.tsx (177 lines) - React component with TypeScript
│ ├─ 📄 context-menu.tsx (252 lines) - React component with TypeScript
│ ├─ 📄 dialog.tsx (133 lines) - React component with TypeScript
│ ├─ 📄 drag-layer.tsx (27 lines) - React component with TypeScript
│ ├─ 📄 drawer.tsx (130 lines) - React component with TypeScript
│ ├─ 📄 dropdown-menu.tsx (257 lines) - React component with TypeScript
│ ├─ 📄 form.tsx (165 lines) - React component with TypeScript
│ ├─ 📄 hover-card.tsx (42 lines) - React component with TypeScript
│ ├─ 📄 input-otp.tsx (77 lines) - React component with TypeScript
│ ├─ 📄 input.tsx (21 lines) - React component with TypeScript
│ ├─ 📄 label.tsx (24 lines) - React component with TypeScript
│ ├─ 📄 menubar.tsx (274 lines) - React component with TypeScript
│ ├─ 📄 navigation-menu.tsx (168 lines) - React component with TypeScript
│ ├─ 📄 pagination.tsx (127 lines) - React component with TypeScript
│ ├─ 📄 popover.tsx (48 lines) - React component with TypeScript
│ ├─ 📄 progress.tsx (29 lines) - React component with TypeScript
│ ├─ 📄 radio-group.tsx (45 lines) - React component with TypeScript
│ ├─ 📄 resizable.tsx (54 lines) - React component with TypeScript
│ ├─ 📄 scroll-area.tsx (58 lines) - React component with TypeScript
│ ├─ 📄 select.tsx (183 lines) - React component with TypeScript
│ ├─ 📄 separator.tsx (28 lines) - React component with TypeScript
│ ├─ 📄 sheet.tsx (137 lines) - React component with TypeScript
│ ├─ 📄 sidebar.tsx (726 lines) - React component with TypeScript
│ ├─ 📄 skeleton.tsx (13 lines) - React component with TypeScript
│ ├─ 📄 slider.tsx (63 lines) - React component with TypeScript
│ ├─ 📄 sonner.tsx (23 lines) - React component with TypeScript
│ ├─ 📄 switch.tsx (31 lines) - React component with TypeScript
│ ├─ 📄 table.tsx (114 lines) - React component with TypeScript
│ ├─ 📄 tabs.tsx (66 lines) - React component with TypeScript
│ ├─ 📄 textarea.tsx (18 lines) - React component with TypeScript
│ ├─ 📄 toggle-group.tsx (73 lines) - React component with TypeScript
│ ├─ 📄 toggle.tsx (45 lines) - React component with TypeScript
│ └─ 📄 tooltip.tsx (59 lines) - React component with TypeScript
├─ 📁 helpers
│ ├─ 📄 chatServer.ts (13 lines) - TypeScript source file
│ ├─ 📄 language_helpers.ts (19 lines) - TypeScript source file
│ ├─ 📄 theme_helpers.ts (109 lines) - TypeScript source file
│ ├─ 📁 ipc
│ │ ├─ 📄 channels.ts (66 lines) - TypeScript source file
│ │ ├─ 📄 ipc-handlers.ts (129 lines) - TypeScript source file
│ │ └─ 📄 listeners-register.ts (139 lines) - TypeScript source file
│ └─ 📁 windows
│ ├─ 📄 window-position.ts (118 lines) - TypeScript source file
│ ├─ 📄 window-styles.ts (62 lines) - TypeScript source file
│ └─ 📄 window_helpers.ts (23 lines) - TypeScript source file
├─ 📁 hooks
│ └─ 📄 use-mobile.ts (25 lines) - TypeScript source file
├─ 📁 layouts
│ └─ 📄 BaseLayout.tsx (18 lines) - React component with TypeScript
├─ 📁 localization
│ ├─ 📄 i18n.ts (16 lines) - TypeScript source file
│ ├─ 📄 langs.ts (9 lines) - TypeScript source file
│ └─ 📄 language.ts (5 lines) - TypeScript source file
├─ 📁 pages
│ ├─ 📄 HomePage.tsx (6 lines) - React component with TypeScript
│ └─ 📄 SettingsPage.tsx (789 lines) - React component with TypeScript
├─ 📁 routes
│ ├─ 📄 \_\_root.tsx (25 lines) - React component with TypeScript
│ ├─ 📄 router.tsx (23 lines) - React component with TypeScript
│ └─ 📄 routes.tsx (37 lines) - React component with TypeScript
├─ 📁 server
│ ├─ 📄 chatServer.ts (435 lines) - TypeScript source file
│ ├─ 📄 startServer.ts (9 lines) - TypeScript source file
│ └─ 📁 mcp
│ ├─ 📄 config-manager.ts (149 lines) - TypeScript source file
│ ├─ 📄 index.ts (126 lines) - TypeScript source file
│ ├─ 📄 mcp-client.ts (125 lines) - TypeScript source file
│ ├─ 📄 mcp-registry.ts (298 lines) - TypeScript source file
│ ├─ 📄 server-manager.ts (246 lines) - TypeScript source file
│ └─ 📄 types.ts (69 lines) - TypeScript source file
├─ 📁 standalone
│ └─ 📄 SettingsWindow.tsx (32 lines) - React component with TypeScript
├─ 📁 tests
│ ├─ 📁 e2e
│ │ └─ 📄 example.test.ts (51 lines) - TypeScript source file
│ └─ 📁 unit
│ ├─ 📄 ToggleTheme.test.tsx (27 lines) - React component with TypeScript
│ ├─ 📄 setup.ts (1 lines) - TypeScript source file
│ └─ 📄 sum.test.ts (14 lines) - TypeScript source file
├─ 📁 types
│ ├─ 📄 electron.d.ts (32 lines) - TypeScript source file
│ ├─ 📄 settings.ts (56 lines) - TypeScript source file
│ └─ 📄 theme-mode.ts (1 lines) - TypeScript source file
└─ 📁 utils
├─ 📄 keyboard.ts (124 lines) - TypeScript source file
├─ 📄 settings.ts (293 lines) - TypeScript source file
└─ 📄 tailwind.ts (6 lines) - TypeScript source file

# 🔍 Key Files with Methods

`src/routes/__root.tsx` (25 lines)
Functions:

- Root
- createRootRoute
- initGlobalShortcut
- useGlobalShortcuts

`src/components/ui/accordion.tsx` (64 lines)
Functions:

- Accordion
- AccordionContent
- AccordionItem
- AccordionTrigger

`src/components/ui/alert-dialog.tsx` (157 lines)
Functions:

- AlertDialog
- AlertDialogAction
- AlertDialogCancel
- AlertDialogContent
- AlertDialogDescription
- AlertDialogFooter
- AlertDialogHeader
- AlertDialogOverlay
- AlertDialogPortal
- AlertDialogTitle
- AlertDialogTrigger

`src/components/ui/alert.tsx` (66 lines)
Functions:

- Alert
- AlertDescription
- AlertTitle

`src/App.tsx` (33 lines)
Functions:

- App
- render
- syncThemeWithLocal
- updateAppLanguage
- useTranslation

`src/components/ui/aspect-ratio.tsx` (9 lines)
Functions:

- AspectRatio

`src/components/ui/avatar.tsx` (53 lines)
Functions:

- Avatar
- AvatarFallback
- AvatarImage

`src/components/ui/badge.tsx` (46 lines)
Functions:

- Badge

`src/layouts/BaseLayout.tsx` (18 lines)
Functions:

- BaseLayout

`src/components/ui/breadcrumb.tsx` (109 lines)
Functions:

- Breadcrumb
- BreadcrumbEllipsis
- BreadcrumbItem
- BreadcrumbLink
- BreadcrumbList
- BreadcrumbPage
- BreadcrumbSeparator

`src/components/ui/button.tsx` (59 lines)
Functions:

- Button

`src/components/ui/calendar.tsx` (73 lines)
Functions:

- Calendar

`src/components/ui/card.tsx` (92 lines)
Functions:

- Card
- CardAction
- CardContent
- CardDescription
- CardFooter
- CardHeader
- CardTitle

`src/components/ui/carousel.tsx` (241 lines)
Functions:

- Carousel
- CarouselContent
- CarouselItem
- CarouselNext
- CarouselPrevious
- useCarousel

`src/helpers/ipc/channels.ts` (66 lines)
Functions:

- toggleSettingsWindow

`src/components/ui/chart.tsx` (351 lines)
Functions:

- ChartContainer
- ChartLegendContent
- ChartStyle
- ChartTooltipContent
- getPayloadConfigFromPayload
- useChart

`src/components/chat/ChatContent.tsx` (571 lines)
Functions:

- ChatContent
- Markdown
- ToolCall
- clearTimeout
- handleCopyContent
- handleEditCancel
- handleEditSave
- handleEditStart
- handleRegenerateWithLoading
- hasPendingToolCalls
- log
- onEditMessage
- onRegenerateMessage
- renderLoadingIndicator
- renderMessageContent
- renderToolCall
- renderToolCalls
- renderToolLoadingIndicator
- replace
- scrollIntoView
- setCopiedMessageId
- setEditedContent
- setEditingMessageId
- setHasReceivedFirstToken
- setIsRegenerating
- setPreviousMessageCount
- stringify
- updateScrollToBottom
- useState
- writeText

`src/components/chat/ChatInput.tsx` (212 lines)
Functions:

- clearInterval
- error
- fetchPreviousApp
- focus
- formatAppName
- getPreviousApp
- handleKeyDown
- preventDefault
- replace
- setPreviousApp

`src/server/chatServer.ts` (435 lines)
Functions:

- Error
- MCPConfigManager
- String
- createOpenRouter
- end
- error
- express
- fetch
- getAllServerConfigs
- getAllServerStatus
- getMCPRegistry
- getMCPToolsForChat
- getOpenRouterClient
- getReader
- initializeMCP
- join
- json
- listAllTools
- log
- processStream
- read
- setHeader
- startChatServer
- text
- toDataStreamResponse
- updateServerConfig
- warn
- write

`src/helpers/chatServer.ts` (13 lines)
Functions:

- initializeChatServer
- log
- startChatServer

`src/components/ui/checkbox.tsx` (32 lines)
Functions:

- Checkbox

`src/components/ui/collapsible.tsx` (31 lines)
Functions:

- Collapsible
- CollapsibleContent
- CollapsibleTrigger

`src/components/ui/command.tsx` (177 lines)
Functions:

- Command
- CommandDialog
- CommandEmpty
- CommandGroup
- CommandInput
- CommandItem
- CommandList
- CommandSeparator
- CommandShortcut

`src/server/mcp/config-manager.ts` (149 lines)
Functions:

- addServerConfig
- constructor
- error
- exportToJson
- getAllServerConfigs
- getConfig
- getServerConfig
- importFromJson
- join
- loadConfig
- parse
- readFileSync
- removeServerConfig
- saveConfig
- stringify
- updateServerConfig

`src/components/ui/context-menu.tsx` (252 lines)
Functions:

- ContextMenu
- ContextMenuCheckboxItem
- ContextMenuContent
- ContextMenuGroup
- ContextMenuItem
- ContextMenuLabel
- ContextMenuPortal
- ContextMenuRadioGroup
- ContextMenuRadioItem
- ContextMenuSeparator
- ContextMenuShortcut
- ContextMenuSub
- ContextMenuSubContent
- ContextMenuSubTrigger
- ContextMenuTrigger

`src/components/ui/dialog.tsx` (133 lines)
Functions:

- Dialog
- DialogClose
- DialogContent
- DialogDescription
- DialogFooter
- DialogHeader
- DialogOverlay
- DialogPortal
- DialogTitle
- DialogTrigger

`src/components/ui/drag-layer.tsx` (27 lines)
Functions:

- DragLayer

`src/components/DragWindowRegion.tsx` (94 lines)
Functions:

- DragWindowRegion
- WindowButtons

`src/components/ui/drawer.tsx` (130 lines)
Functions:

- Drawer
- DrawerClose
- DrawerContent
- DrawerDescription
- DrawerFooter
- DrawerHeader
- DrawerOverlay
- DrawerPortal
- DrawerTitle
- DrawerTrigger

`src/components/ui/dropdown-menu.tsx` (257 lines)
Functions:

- DropdownMenu
- DropdownMenuCheckboxItem
- DropdownMenuContent
- DropdownMenuGroup
- DropdownMenuItem
- DropdownMenuLabel
- DropdownMenuPortal
- DropdownMenuRadioGroup
- DropdownMenuRadioItem
- DropdownMenuSeparator
- DropdownMenuShortcut
- DropdownMenuSub
- DropdownMenuSubContent
- DropdownMenuSubTrigger
- DropdownMenuTrigger

`src/tests/e2e/example.test.ts` (51 lines)
Functions:

- error
- findLatestBuild
- firstWindow
- getByTestId
- launch
- log
- parseElectronApp
- pop
- textContent
- toBe
- waitForSelector

`src/components/ui/form.tsx` (165 lines)
Functions:

- FormControl
- FormDescription
- FormItem
- FormLabel
- FormMessage
- String
- useFormField

`src/pages/HomePage.tsx` (6 lines)
Functions:

- HomePage

`src/components/ui/hover-card.tsx` (42 lines)
Functions:

- HoverCard
- HoverCardContent
- HoverCardTrigger

`src/localization/i18n.ts` (16 lines)
Functions:

- init

`src/server/mcp/index.ts` (126 lines)
Functions:

- error
- execute
- exportMCPConfig
- exportToJson
- getInstance
- getMCPRegistry
- getMCPToolsForChat
- importFromJson
- importMCPConfig
- initializeMCP
- listAllMCPTools
- listAllTools
- log
- runMCPTool
- runTool
- startAllEnabled
- startMCPServers
- stopAll
- stopMCPServers

`src/components/chat/index.tsx` (471 lines)
Functions:

- Chat
- aiHandleSubmit
- clearTimeout
- closeWindow
- error
- focus
- getSettings
- handleAddAttachment
- handleEditMessage
- handleExit
- handleInputChange
- handleInputChangeAdapter
- handleMouseEnter
- handleMouseLeave
- handleNewHistory
- handleRegenerateResponse
- handleReset
- handleSendMessage
- handleToggleTranslation
- handleVoiceInput
- log
- reload
- resizeWindow
- scrollIntoView
- setMessages
- setMounted
- setShowControls
- splice
- useChat
- useState

`src/components/ui/input-otp.tsx` (77 lines)
Functions:

- InputOTP
- InputOTPGroup
- InputOTPSeparator
- InputOTPSlot

`src/components/ui/input.tsx` (21 lines)
Functions:

- Input

`src/helpers/ipc/ipc-handlers.ts` (129 lines)
Functions:

- close
- closeSettingsWindow
- closeWindow
- createSettingsWindow
- getCurrentShortcut
- getCurrentTheme
- getPreviousApp
- hide
- initGlobalShortcut
- maximize
- maximizeWindow
- minimize
- minimizeWindow
- registerGlobalShortcuts
- resizeWindow
- resizeWindowAndMaintainPosition
- setDarkTheme
- setLightTheme
- setPreviousApp
- setSystemTheme
- toggleSettingsWindow
- toggleTheme
- unmaximize
- updateGlobalShortcut

`src/utils/keyboard.ts` (124 lines)
Functions:

- addEventListener
- error
- getSettings
- handleKeyDown
- invoke
- log
- matchesShortcut
- parseShortcut
- preventDefault
- removeEventListener
- toggleSettingsWindow
- useGlobalShortcuts

`src/components/ui/label.tsx` (24 lines)
Functions:

- Label

`src/components/LangToggle.tsx` (28 lines)
Functions:

- LangToggle
- onValueChange
- setAppLanguage
- useTranslation

`src/helpers/language_helpers.ts` (19 lines)
Functions:

- changeLanguage
- getItem
- setAppLanguage
- setItem
- updateAppLanguage

`src/helpers/ipc/listeners-register.ts` (139 lines)
Functions:

- callback
- closeSettingsWindow
- closeWindow
- createElectronAPI
- getCurrentTheme
- getPreviousApp
- handler
- initGlobalShortcut
- invoke
- log
- maximizeWindow
- minimizeWindow
- on
- registerListeners
- removeListener
- resizeWindow
- setDarkTheme
- setLightTheme
- setSystemTheme
- toggleSettingsWindow
- toggleTheme
- updateGlobalShortcut

`src/main.ts` (402 lines)
Functions:

- BrowserWindow
- createMainWindow
- createSettingsWindow
- error
- executeJavaScript
- focus
- getCurrentShortcut
- getPreviousApp
- getPrimaryDisplay
- hide
- initializeChatServer
- injectWindowStyles
- installExtension
- installExtensions
- join
- loadFile
- loadURL
- log
- navigate
- openDevTools
- positionWindowAtCenterBottom
- preventDefault
- quit
- registerGlobalShortcuts
- registerListeners
- restore
- round
- send
- setBackgroundColor
- setMenu
- setMenuBarVisibility
- setWindowButtonVisibility
- show
- startAppFocusTracking
- then
- unregisterAll

`src/server/mcp/mcp-client.ts` (125 lines)
Functions:

- Error
- checkConnection
- constructor
- error
- listTools
- resolveContext
- runTool
- slice
- text
- warn

`src/server/mcp/mcp-registry.ts` (298 lines)
Functions:

- Error
- MCPConfigManager
- MCPRegistry
- Map
- ServerManager
- String
- addServerConfig
- clear
- constructor
- delete
- emit
- error
- exportToJson
- findToolByName
- getAllServerConfigs
- getAllServerStatus
- getClient
- getInstance
- getServerConfig
- getServerStatus
- getStatus
- importFromJson
- initializeServers
- listAllTools
- push
- registerServer
- removeServerConfig
- runTool
- runToolByName
- start
- startAllEnabled
- startServer
- stop
- stopAll
- stopServer
- super
- unregisterServer
- updateTools

`src/components/ui/menubar.tsx` (274 lines)
Functions:

- Menubar
- MenubarCheckboxItem
- MenubarContent
- MenubarGroup
- MenubarItem
- MenubarLabel
- MenubarMenu
- MenubarPortal
- MenubarRadioGroup
- MenubarRadioItem
- MenubarSeparator
- MenubarShortcut
- MenubarSub
- MenubarSubContent
- MenubarSubTrigger
- MenubarTrigger

`src/components/ui/navigation-menu.tsx` (168 lines)
Functions:

- NavigationMenu
- NavigationMenuContent
- NavigationMenuIndicator
- NavigationMenuItem
- NavigationMenuLink
- NavigationMenuList
- NavigationMenuTrigger
- NavigationMenuViewport

`src/components/ui/pagination.tsx` (127 lines)
Functions:

- Pagination
- PaginationContent
- PaginationEllipsis
- PaginationItem
- PaginationLink
- PaginationNext
- PaginationPrevious

`playwright.config.ts` (23 lines)
Functions:

- defineConfig

`src/components/ui/popover.tsx` (48 lines)
Functions:

- Popover
- PopoverAnchor
- PopoverContent
- PopoverTrigger

`src/components/ui/progress.tsx` (29 lines)
Functions:

- Progress

`src/components/ui/radio-group.tsx` (45 lines)
Functions:

- RadioGroup
- RadioGroupItem

`src/components/ui/resizable.tsx` (54 lines)
Functions:

- ResizableHandle
- ResizablePanel
- ResizablePanelGroup

`src/routes/router.tsx` (23 lines)
Functions:

- createMemoryHistory
- createRouter

`src/routes/routes.tsx` (37 lines)
Functions:

- addChildren

`src/components/ui/scroll-area.tsx` (58 lines)
Functions:

- ScrollArea
- ScrollBar

`src/components/ui/select.tsx` (183 lines)
Functions:

- Select
- SelectContent
- SelectGroup
- SelectItem
- SelectLabel
- SelectScrollDownButton
- SelectScrollUpButton
- SelectSeparator
- SelectTrigger
- SelectValue

`src/components/ui/separator.tsx` (28 lines)
Functions:

- Separator

`src/server/mcp/server-manager.ts` (246 lines)
Functions:

- Error
- MCPClient
- String
- checkConnection
- clearTimeout
- constructor
- error
- getClient
- getStatus
- isRunning
- kill
- listTools
- resolve
- spawn
- start
- startLocalServer
- stop
- toString
- updateTools

`src/utils/settings.ts` (293 lines)
Functions:

- error
- getItem
- getMergedConfig
- getSettings
- initGlobalShortcut
- log
- push
- removeShortcut
- require
- resetShortcutsToDefault
- saveSettings
- updateMcpServerSettings
- updateMcpToolSettings
- updateOpenAISettings
- updateShortcut

`src/pages/SettingsPage.tsx` (789 lines)
Functions:

- Error
- SettingsPage
- addEventListener
- error
- fetch
- fetchMcpConfigurations
- fetchMcpMarketplace
- fetchTheme
- focus
- formatShortcut
- getCurrentTheme
- handleClickOutside
- handleCloseSettings
- handleInstallMcpTool
- handleMcpConfigChange
- handleOpenAIChange
- handleResetShortcuts
- handleSaveMcpConfig
- handleToggleTheme
- join
- json
- log
- preventDefault
- push
- removeEventListener
- resetShortcutsToDefault
- setActiveShortcut
- setCurrentTheme
- setLoadingMarketplace
- setLoadingMcpConfigs
- setMcpMarketItems
- setMcpServerConfigs
- setRecordingShortcut
- setSettings
- startRecording
- stopPropagation
- success
- toUpperCase
- toggleTheme
- updateOpenAISettings
- updateShortcut

`src/standalone/SettingsWindow.tsx` (32 lines)
Functions:

- SettingsApp
- getElementById
- render
- syncThemeWithLocal
- updateAppLanguage
- useTranslation

`src/components/ui/sheet.tsx` (137 lines)
Functions:

- Sheet
- SheetClose
- SheetContent
- SheetDescription
- SheetFooter
- SheetHeader
- SheetOverlay
- SheetPortal
- SheetTitle
- SheetTrigger

`src/components/ui/sidebar.tsx` (726 lines)
Functions:

- Sidebar
- SidebarContent
- SidebarFooter
- SidebarGroup
- SidebarGroupAction
- SidebarGroupContent
- SidebarGroupLabel
- SidebarHeader
- SidebarInput
- SidebarInset
- SidebarMenu
- SidebarMenuAction
- SidebarMenuBadge
- SidebarMenuButton
- SidebarMenuItem
- SidebarMenuSkeleton
- SidebarMenuSub
- SidebarMenuSubButton
- SidebarMenuSubItem
- SidebarProvider
- SidebarRail
- SidebarSeparator
- SidebarTrigger
- handleKeyDown
- useSidebar
- value

`src/components/ui/skeleton.tsx` (13 lines)
Functions:

- Skeleton

`src/components/ui/slider.tsx` (63 lines)
Functions:

- Slider

`src/components/ui/sonner.tsx` (23 lines)
Functions:

- Toaster

`src/server/startServer.ts` (9 lines)
Functions:

- startChatServer

`src/tests/unit/sum.test.ts` (14 lines)
Functions:

- sum
- toBe

`src/components/ui/switch.tsx` (31 lines)
Functions:

- Switch

`src/components/ui/table.tsx` (114 lines)
Functions:

- Table
- TableBody
- TableCaption
- TableCell
- TableFooter
- TableHead
- TableHeader
- TableRow

`src/components/ui/tabs.tsx` (66 lines)
Functions:

- Tabs
- TabsContent
- TabsList
- TabsTrigger

`src/utils/tailwind.ts` (6 lines)
Functions:

- cn

`src/components/ui/textarea.tsx` (18 lines)
Functions:

- Textarea

`src/helpers/theme_helpers.ts` (109 lines)
Functions:

- add
- error
- getCurrentTheme
- now
- remove
- returns
- setItem
- setTheme
- setThemeDark
- setThemeLight
- setThemeSystem
- syncThemeWithLocal
- toggleTheme
- updateDocumentTheme

`src/components/ui/toggle-group.tsx` (73 lines)
Functions:

- ToggleGroup
- ToggleGroupItem

`src/components/ui/toggle.tsx` (45 lines)
Functions:

- Toggle

`src/tests/unit/ToggleTheme.test.tsx` (27 lines)
Functions:

- getByRole
- querySelector
- render
- toBeInTheDocument
- toContain

`src/components/ToggleTheme.tsx` (12 lines)
Functions:

- ToggleTheme

`src/components/ui/tooltip.tsx` (59 lines)
Functions:

- Tooltip
- TooltipContent
- TooltipProvider
- TooltipTrigger

`src/hooks/use-mobile.ts` (25 lines)
Functions:

- addEventListener
- onChange
- removeEventListener
- setIsMobile
- useIsMobile

`vite.preload.config.ts` (4 lines)
Functions:

- defineConfig

`src/helpers/windows/window-position.ts` (118 lines)
Functions:

- centerWindowHorizontally
- error
- getBounds
- getPosition
- getPrimaryDisplay
- getSize
- log
- positionWindowAtCenterBottom
- resizeWindowAndMaintainPosition
- round
- setBounds
- setPosition
- warn

`src/helpers/windows/window-styles.ts` (62 lines)
Functions:

- injectWindowStyles
- insertCSS

`src/helpers/windows/window_helpers.ts` (23 lines)
Functions:

- closeWindow
- error
- maximizeWindow
- minimizeWindow

# 📊 Project Overview

**Files:** 103 | **Lines:** 10,853

## 📁 File Distribution

- .js: 1 files (92 lines)
- .ts: 40 files (3,313 lines)
- .tsx: 62 files (7,448 lines)

_Updated: April 12, 2025 at 03:29 PM_
