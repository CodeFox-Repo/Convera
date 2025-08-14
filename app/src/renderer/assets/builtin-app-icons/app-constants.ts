// Common application names and fallback lists
// Used for preloading and fallback when system scanning fails

export const SYSTEM_APPS = [
  "Finder",
  "System Preferences", 
  "System Settings",
  "Activity Monitor",
  "Terminal",
  "Console",
  "Keychain Access",
  "Migration Assistant",
  "Boot Camp Assistant",
];

export const BROWSERS = [
  "Safari",
  "Google Chrome",
  "Chrome", 
  "Firefox",
  "Arc",
  "Microsoft Edge",
  "Edge",
  "Opera",
  "Brave Browser",
];

export const OFFICE_APPS = [
  "Microsoft Word",
  "Microsoft Excel", 
  "Microsoft PowerPoint",
  "Microsoft Outlook",
  "Pages",
  "Numbers",
  "Keynote",
  "LibreOffice",
  "OpenOffice",
];

export const DEV_TOOLS = [
  "Visual Studio Code",
  "Code",
  "Xcode", 
  "IntelliJ IDEA",
  "PyCharm",
  "WebStorm",
  "Sublime Text",
  "Atom",
  "Vim",
  "Emacs",
  "iTerm",
  "iTerm2",
  "Terminal",
];

export const DESIGN_TOOLS = [
  "Adobe Photoshop",
  "Photoshop",
  "Adobe Illustrator", 
  "Illustrator",
  "Adobe After Effects",
  "After Effects",
  "Adobe Premiere Pro",
  "Premiere Pro",
  "Sketch",
  "Figma",
  "Canva",
  "Affinity Designer",
  "Affinity Photo", 
  "Pixelmator Pro",
  "GIMP",
];

export const COMMUNICATION_APPS = [
  "Slack",
  "Discord",
  "Microsoft Teams",
  "Teams",
  "Zoom",
  "Skype", 
  "WhatsApp",
  "Telegram",
  "Signal",
  "WeChat",
];

export const PRODUCTIVITY_APPS = [
  "Notion",
  "Obsidian",
  "Evernote",
  "OneNote",
  "Bear",
  "Ulysses",
  "Typora",
  "Markdown Editor",
  "TaskPaper", 
  "Things 3",
  "Todoist",
  "Any.do",
];

export const MEDIA_APPS = [
  "Music",
  "TV",
  "Photos",
  "QuickTime Player",
  "VLC",
  "IINA",
  "Plex",
  "Spotify",
  "Apple Music",
  "SoundCloud",
  "YouTube Music",
];

export const UTILITY_APPS = [
  "1Password",
  "Bitwarden",
  "CleanMyMac",
  "CleanMyMac X",
  "The Unarchiver",
  "Keka",
  "AppCleaner",
  "Disk Utility",
  "Preview",
  "TextEdit",
  "Notes",
  "Calculator", 
  "Calendar",
  "Contacts",
  "Reminders",
  "Mail",
  "FaceTime",
  "Messages",
];

export const LAUNCHER_TOOLS = [
  "Raycast",
  "Alfred",
  "LaunchBar",
  "Spotlight",
  "PopClip",
  "BetterTouchTool",
  "Karabiner-Elements",
  "Rectangle",
  "Magnet",
];

export const CLOUD_STORAGE = [
  "Dropbox",
  "Google Drive",
  "OneDrive", 
  "iCloud",
  "Box",
  "Sync.com",
  "pCloud",
];

// Combined fallback app list for system scanning failures
export const FALLBACK_APP_LIST = [
  ...SYSTEM_APPS,
  ...BROWSERS,
  ...OFFICE_APPS,
  ...DEV_TOOLS,
  ...DESIGN_TOOLS,
  ...COMMUNICATION_APPS,
  ...PRODUCTIVITY_APPS,
  ...MEDIA_APPS,
  ...UTILITY_APPS,
  ...LAUNCHER_TOOLS,
  ...CLOUD_STORAGE,
];

// Apps to filter out from app mention results
export const FILTERED_APPS = [
  "osascript",
  "System Events",
  "loginwindow", 
  "WindowServer",
  "Dock",
  "Finder Helper",
  "SystemUIServer",
  "ControlCenter",
  "Spotlight",
  "Electron",
  "FoxyChat", 
  "foxfoxy",
];