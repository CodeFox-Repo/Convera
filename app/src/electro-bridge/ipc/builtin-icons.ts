// Built-in SVG icons for system applications
// Provides fallback icons when native app icons cannot be found

export const BUILTIN_ICONS: { [key: string]: string } = {
  "System Settings": `data:image/svg+xml;base64,${Buffer.from(
    `
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="7" fill="#6B7280"/>
      <path d="M16 12a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" fill="white" stroke="white" stroke-width="0.5"/>
      <path d="M14.5 8.5h3l.5 2.5 2.1.8 2.1-1.4L24.5 12l-1.4 2.1.8 2.1 2.5.5v3l-2.5.5-.8 2.1 1.4 2.1L22 24.5l-2.1-1.4-2.1.8-.5 2.5h-3l-.5-2.5-2.1-.8L9.6 24.5 7.5 22l1.4-2.1-.8-2.1L5.6 17v-3l2.5-.5.8-2.1L7.5 10l2.1-2.1 2.1 1.4 2.1-.8.5-2.5z" stroke="white" stroke-width="1.5" fill="none"/>
    </svg>
  `,
  ).toString("base64")}`,

  "System Preferences": `data:image/svg+xml;base64,${Buffer.from(
    `
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="7" fill="#6B7280"/>
      <path d="M16 12a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" fill="white" stroke="white" stroke-width="0.5"/>
      <path d="M14.5 8.5h3l.5 2.5 2.1.8 2.1-1.4L24.5 12l-1.4 2.1.8 2.1 2.5.5v3l-2.5.5-.8 2.1 1.4 2.1L22 24.5l-2.1-1.4-2.1.8-.5 2.5h-3l-.5-2.5-2.1-.8L9.6 24.5 7.5 22l1.4-2.1-.8-2.1L5.6 17v-3l2.5-.5.8-2.1L7.5 10l2.1-2.1 2.1 1.4 2.1-.8.5-2.5z" stroke="white" stroke-width="1.5" fill="none"/>
    </svg>
  `,
  ).toString("base64")}`,

  Terminal: `data:image/svg+xml;base64,${Buffer.from(
    `
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="7" fill="#1F2937"/>
      <path d="M8 12l4 3-4 3" stroke="#10B981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      <path d="M14 18h6" stroke="#10B981" stroke-width="2" stroke-linecap="round"/>
    </svg>
  `,
  ).toString("base64")}`,

  "Activity Monitor": `data:image/svg+xml;base64,${Buffer.from(
    `
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="7" fill="#10B981"/>
      <rect x="6" y="20" width="3" height="6" fill="white"/>
      <rect x="11" y="16" width="3" height="10" fill="white"/>
      <rect x="16" y="12" width="3" height="14" fill="white"/>
      <rect x="21" y="8" width="3" height="18" fill="white"/>
    </svg>
  `,
  ).toString("base64")}`,

  Console: `data:image/svg+xml;base64,${Buffer.from(
    `
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="7" fill="#374151"/>
      <rect x="6" y="10" width="20" height="12" rx="2" fill="#1F2937"/>
      <circle cx="9" cy="13" r="1" fill="#EF4444"/>
      <circle cx="12" cy="13" r="1" fill="#F59E0B"/>
      <circle cx="15" cy="13" r="1" fill="#10B981"/>
      <rect x="8" y="16" width="8" height="1" fill="#9CA3AF"/>
      <rect x="8" y="18" width="12" height="1" fill="#9CA3AF"/>
    </svg>
  `,
  ).toString("base64")}`,

  Finder: `data:image/svg+xml;base64,${Buffer.from(
    `
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="7" fill="#007AFF"/>
      <path d="M8 10c0-1.1.9-2 2-2h12c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H10c-1.1 0-2-.9-2-2V10z" fill="white"/>
      <path d="M12 14h8M12 16h6M12 18h4" stroke="#007AFF" stroke-width="1.5" stroke-linecap="round"/>
      <circle cx="20" cy="12" r="1.5" fill="#007AFF"/>
    </svg>
  `,
  ).toString("base64")}`,

  Calendar: `data:image/svg+xml;base64,${Buffer.from(
    `
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="7" fill="#FF3B30"/>
      <rect x="6" y="8" width="20" height="16" rx="2" fill="white"/>
      <rect x="6" y="8" width="20" height="4" rx="2" fill="#FF3B30"/>
      <rect x="10" y="6" width="1.5" height="4" fill="#FF3B30"/>
      <rect x="20.5" y="6" width="1.5" height="4" fill="#FF3B30"/>
      <text x="16" y="20" text-anchor="middle" fill="#FF3B30" font-family="system-ui" font-size="8" font-weight="bold">15</text>
    </svg>
  `,
  ).toString("base64")}`,

  Mail: `data:image/svg+xml;base64,${Buffer.from(
    `
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="7" fill="#007AFF"/>
      <rect x="6" y="10" width="20" height="12" rx="2" fill="white"/>
      <path d="M6 12l10 6 10-6" stroke="#007AFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    </svg>
  `,
  ).toString("base64")}`,

  Messages: `data:image/svg+xml;base64,${Buffer.from(
    `
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="7" fill="#00C853"/>
      <circle cx="16" cy="14" r="8" fill="white"/>
      <path d="M16 22l-3-2h-1c-1.1 0-2-.9-2-2v-6c0-1.1.9-2 2-2h8c1.1 0 2 .9 2 2v6c0 1.1-.9 2-2 2h-1l-3 2z" fill="#00C853"/>
      <circle cx="13" cy="14" r="1" fill="white"/>
      <circle cx="16" cy="14" r="1" fill="white"/>
      <circle cx="19" cy="14" r="1" fill="white"/>
    </svg>
  `,
  ).toString("base64")}`,

  Notes: `data:image/svg+xml;base64,${Buffer.from(
    `
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="7" fill="#FFCC02"/>
      <rect x="6" y="6" width="20" height="20" rx="2" fill="white"/>
      <rect x="9" y="12" width="14" height="1" fill="#FFCC02"/>
      <rect x="9" y="15" width="10" height="1" fill="#FFCC02"/>
      <rect x="9" y="18" width="12" height="1" fill="#FFCC02"/>
    </svg>
  `,
  ).toString("base64")}`,

  Calculator: `data:image/svg+xml;base64,${Buffer.from(
    `
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="7" fill="#1C1C1E"/>
      <rect x="6" y="6" width="20" height="20" rx="2" fill="#2C2C2E"/>
      <rect x="8" y="8" width="16" height="4" rx="1" fill="#48484A"/>
      <circle cx="10" cy="16" r="1.5" fill="#FF9F0A"/>
      <circle cx="14" cy="16" r="1.5" fill="#FF9F0A"/>
      <circle cx="18" cy="16" r="1.5" fill="#FF9F0A"/>
      <circle cx="22" cy="16" r="1.5" fill="#FF9F0A"/>
      <circle cx="10" cy="20" r="1.5" fill="#FF9F0A"/>
      <circle cx="14" cy="20" r="1.5" fill="#FF9F0A"/>
      <circle cx="18" cy="20" r="1.5" fill="#FF9F0A"/>
      <circle cx="22" cy="20" r="1.5" fill="#FF9F0A"/>
    </svg>
  `,
  ).toString("base64")}`,

  Contacts: `data:image/svg+xml;base64,${Buffer.from(
    `
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="7" fill="#007AFF"/>
      <circle cx="16" cy="12" r="4" fill="white"/>
      <path d="M8 24c0-4.4 3.6-8 8-8s8 3.6 8 8" stroke="white" stroke-width="2" stroke-linecap="round" fill="none"/>
    </svg>
  `,
  ).toString("base64")}`,

  Reminders: `data:image/svg+xml;base64,${Buffer.from(
    `
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="7" fill="#FF3B30"/>
      <rect x="6" y="8" width="20" height="16" rx="2" fill="white"/>
      <circle cx="10" cy="14" r="1.5" fill="#FF3B30"/>
      <rect x="13" y="13" width="8" height="1" fill="#FF3B30"/>
      <circle cx="10" cy="18" r="1.5" fill="#FF3B30"/>
      <rect x="13" y="17" width="6" height="1" fill="#FF3B30"/>
      <circle cx="10" cy="22" r="1.5" fill="#FF3B30"/>
      <rect x="13" y="21" width="4" height="1" fill="#FF3B30"/>
    </svg>
  `,
  ).toString("base64")}`,
};
