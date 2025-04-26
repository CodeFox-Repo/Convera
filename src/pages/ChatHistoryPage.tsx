import React, { useState } from "react";
import { Search, Trash2, MessageSquare, ArrowLeft, X } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

// Enhanced mock data for chat history with detailed messages
const mockChatHistory = [
  {
    id: "chat1",
    title: "Project Planning Discussion",
    date: "Today, 2:30 PM",
    preview: "Let's outline the key milestones for Q3...",
    created_at: "2023-10-22T14:30:00Z",
    updated_at: "2023-10-22T15:45:00Z",
    model: "gpt-4",
    messages: [
      {
        id: "msg1",
        role: "user",
        content: "Let's outline the key milestones for Q3 of our project.",
        timestamp: "2023-10-22T14:30:00Z"
      },
      {
        id: "msg2",
        role: "assistant",
        content: "I'd be happy to help you outline key milestones for Q3. Here's a proposed structure:\n\n1. **July**\n   - Complete initial user research\n   - Finalize design specifications\n   - Set up development environments\n\n2. **August**\n   - Develop core functionality\n   - Begin internal testing\n   - Draft documentation\n\n3. **September**\n   - Conduct user acceptance testing\n   - Fix identified bugs\n   - Prepare for product launch\n\nWould you like to adjust any of these milestones or add more specific tasks to each month?",
        timestamp: "2023-10-22T14:30:45Z"
      },
      {
        id: "msg3",
        role: "user",
        content: "This looks good. For August, let's add 'Integrate with backend APIs' as another milestone.",
        timestamp: "2023-10-22T14:32:10Z"
      },
      {
        id: "msg4",
        role: "assistant",
        content: "Great addition! Here's the updated Q3 milestone plan:\n\n1. **July**\n   - Complete initial user research\n   - Finalize design specifications\n   - Set up development environments\n\n2. **August**\n   - Develop core functionality\n   - **Integrate with backend APIs**\n   - Begin internal testing\n   - Draft documentation\n\n3. **September**\n   - Conduct user acceptance testing\n   - Fix identified bugs\n   - Prepare for product launch\n\nIs there anything else you'd like to adjust or add?",
        timestamp: "2023-10-22T14:33:00Z"
      }
    ]
  },
  {
    id: "chat2",
    title: "API Integration Help",
    date: "Yesterday, 11:15 AM",
    preview: "How do I authenticate with the new endpoint?",
    created_at: "2023-10-21T11:15:00Z",
    updated_at: "2023-10-21T11:35:00Z",
    model: "gpt-4",
    messages: [
      {
        id: "msg1",
        role: "user",
        content: "How do I authenticate with the new endpoint? I'm getting 401 errors.",
        timestamp: "2023-10-21T11:15:00Z"
      },
      {
        id: "msg2",
        role: "assistant",
        content: "I'll help you troubleshoot the authentication issues with the new endpoint. 401 errors indicate unauthorized access.\n\nHere are the steps to properly authenticate:\n\n1. **Obtain API key**: Make sure you've generated a valid API key from the developer dashboard.\n\n2. **Set the Authorization header**: \n   ```\n   Authorization: Bearer YOUR_API_KEY\n   ```\n\n3. **Check token expiration**: Ensure your token hasn't expired. Tokens typically last 24 hours.\n\n4. **Verify correct endpoint**: Double-check you're using the correct environment (prod vs. dev).\n\nCould you share the code snippet you're using to make the request?",
        timestamp: "2023-10-21T11:16:30Z"
      },
      {
        id: "msg3",
        role: "user",
        content: "Here's my code:\n```js\nfetch('https://api.example.com/data', {\n  method: 'GET',\n  headers: {\n    'Content-Type': 'application/json',\n    'Auth-Token': apiKey\n  }\n})\n```",
        timestamp: "2023-10-21T11:20:00Z"
      },
      {
        id: "msg4",
        role: "assistant",
        content: "I see the issue in your code. You're using `'Auth-Token'` as the header name, but according to the standard authentication flow I mentioned, you should be using the `'Authorization'` header with a Bearer token format.\n\nTry modifying your code like this:\n\n```js\nfetch('https://api.example.com/data', {\n  method: 'GET',\n  headers: {\n    'Content-Type': 'application/json',\n    'Authorization': `Bearer ${apiKey}`\n  }\n})\n```\n\nThis format follows the OAuth 2.0 Bearer Token usage specification. Let me know if this resolves your 401 error!",
        timestamp: "2023-10-21T11:21:45Z"
      },
      {
        id: "msg5",
        role: "user",
        content: "That worked! Thanks for the help.",
        timestamp: "2023-10-21T11:35:00Z"
      },
      {
        id: "msg6",
        role: "assistant",
        content: "Excellent! I'm glad that fixed the authentication issue. The `Authorization: Bearer` header format is standard across many APIs that implement OAuth 2.0 token-based authentication.\n\nTo summarize what we fixed:\n1. Changed the header name from `Auth-Token` to `Authorization`\n2. Formatted the token value as `Bearer ${apiKey}`\n\nIf you have any other API integration questions, feel free to ask. Happy coding!",
        timestamp: "2023-10-21T11:36:30Z"
      }
    ]
  },
  {
    id: "chat3",
    title: "Bug Report: Mobile Navbar",
    date: "Oct 21, 2023",
    preview: "The navbar is not displaying correctly on iPhone...",
    created_at: "2023-10-21T09:10:00Z",
    updated_at: "2023-10-21T10:30:00Z",
    model: "gpt-3.5-turbo",
    messages: [
      {
        id: "msg1",
        role: "user",
        content: "The navbar is not displaying correctly on iPhone 13. The dropdown menu appears off-screen on the right side. Here's a screenshot: [screenshot.jpg]",
        timestamp: "2023-10-21T09:10:00Z"
      },
      {
        id: "msg2",
        role: "assistant",
        content: "Based on your description and the screenshot, this appears to be a common CSS positioning issue with dropdowns on mobile devices. Here are a few potential solutions:\n\n1. **Add overflow handling to the dropdown container**:\n```css\n.dropdown-menu {\n  position: absolute;\n  left: auto;\n  right: 0; /* Align to right side */\n  overflow-x: visible;\n}\n```\n\n2. **Use responsive positioning**:\n```css\n@media screen and (max-width: 768px) {\n  .dropdown-menu {\n    position: fixed;\n    left: 0;\n    right: 0;\n    width: 100%;\n  }\n}\n```\n\n3. **Check for any fixed width settings** that might be forcing the dropdown to maintain a width that exceeds the screen bounds.\n\nCould you share the current CSS for your navbar and dropdown components?",
        timestamp: "2023-10-21T09:12:30Z"
      },
      {
        id: "msg3",
        role: "user",
        content: "Here's the relevant CSS:\n```css\n.navbar {\n  display: flex;\n  justify-content: space-between;\n  width: 100%;\n}\n\n.dropdown {\n  position: relative;\n}\n\n.dropdown-menu {\n  position: absolute;\n  top: 100%;\n  left: 0;\n  width: 250px;\n  box-shadow: 0 2px 5px rgba(0,0,0,0.2);\n}\n```",
        timestamp: "2023-10-21T09:20:00Z"
      },
      {
        id: "msg4",
        role: "assistant",
        content: "I can see the issue now. The fixed width of 250px for the dropdown menu combined with it being positioned from the left side is causing it to extend beyond the screen on smaller devices.\n\nHere's how to fix it:\n\n```css\n.dropdown {\n  position: relative;\n}\n\n.dropdown-menu {\n  position: absolute;\n  top: 100%;\n  left: auto;    /* Remove left positioning */\n  right: 0;      /* Align to the right of the dropdown parent */\n  width: 250px;  /* Keep your desired width */\n  max-width: 100vw; /* But ensure it doesn't exceed viewport width */\n  box-shadow: 0 2px 5px rgba(0,0,0,0.2);\n}\n\n/* For very small screens, you might want this additional rule */\n@media screen and (max-width: 300px) {\n  .dropdown-menu {\n    width: 100vw;\n    right: -10px; /* Adjust based on your navbar padding */\n  }\n}\n```\n\nThis solution:\n1. Aligns the dropdown menu to the right instead of the left\n2. Ensures it doesn't exceed viewport width\n3. Provides additional adjustments for very small screens\n\nTry these changes and let me know if they resolve the issue on iPhone.",
        timestamp: "2023-10-21T09:23:45Z"
      },
      {
        id: "msg5",
        role: "user",
        content: "That fixed the issue! The dropdown now appears correctly aligned to the right edge of the screen. Thanks for your help.",
        timestamp: "2023-10-21T10:30:00Z"
      }
    ]
  },
  {
    id: "chat4",
    title: "New Feature Ideas",
    date: "Oct 18, 2023",
    preview: "I think we should add a dark mode option...",
    created_at: "2023-10-18T16:05:00Z",
    updated_at: "2023-10-18T17:30:00Z",
    model: "gpt-4",
    messages: [
      {
        id: "msg1",
        role: "user",
        content: "I think we should add a dark mode option to our app. What do you think and how could we implement it?",
        timestamp: "2023-10-18T16:05:00Z"
      },
      {
        id: "msg2",
        role: "assistant",
        content: "Adding a dark mode is an excellent idea! It offers several benefits:\n\n- Reduced eye strain in low-light environments\n- Battery savings on OLED/AMOLED screens\n- Accessibility improvements for photosensitive users\n- Modern, sleek aesthetic many users prefer\n\n**Implementation Approach:**\n\n1. **CSS Variables Method** (Recommended):\n   ```css\n   :root {\n     /* Light theme (default) */\n     --background: #ffffff;\n     --text-primary: #333333;\n     --accent-color: #0066cc;\n   }\n   \n   [data-theme=\"dark\"] {\n     --background: #121212;\n     --text-primary: #e0e0e0;\n     --accent-color: #4d9fff;\n   }\n   ```\n\n2. **Theme Toggling with JavaScript**:\n   ```javascript\n   // Toggle function\n   function toggleDarkMode() {\n     const currentTheme = document.documentElement.getAttribute('data-theme');\n     const newTheme = currentTheme === 'dark' ? 'light' : 'dark';\n     \n     document.documentElement.setAttribute('data-theme', newTheme);\n     localStorage.setItem('theme', newTheme); // Save preference\n   }\n   \n   // Initialize theme on load\n   function initTheme() {\n     const savedTheme = localStorage.getItem('theme') || \n                       (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');\n     document.documentElement.setAttribute('data-theme', savedTheme);\n   }\n   ```\n\n3. **User Preference Detection**:\n   - Detect system preferences with `prefers-color-scheme` media query\n   - Offer options: \"Light\", \"Dark\", \"System Default\"\n\n4. **UI Component**:\n   - Add a toggle switch in settings\n   - Consider a floating toggle for quick access\n\nWould you like me to expand on any of these implementation steps or discuss specific frameworks you're using?",
        timestamp: "2023-10-18T16:07:30Z"
      },
      {
        id: "msg3", 
        role: "user",
        content: "This is really helpful. We're using React with Tailwind CSS. Is there a recommended approach for that combination?",
        timestamp: "2023-10-18T16:20:00Z"
      },
      {
        id: "msg4",
        role: "assistant",
        content: "Perfect! React with Tailwind CSS is an excellent combination for implementing dark mode. Here's the recommended approach:\n\n**1. Set up Tailwind CSS Dark Mode**\n\nFirst, enable the dark mode feature in your `tailwind.config.js`:\n\n```javascript\n// tailwind.config.js\nmodule.exports = {\n  darkMode: 'class', // Use class strategy (instead of media queries)\n  // rest of your config\n}\n```\n\n**2. Create a Theme Context and Provider in React**\n\n```jsx\n// ThemeContext.js\nimport React, { createContext, useContext, useEffect, useState } from 'react';\n\nconst ThemeContext = createContext();\n\nexport const ThemeProvider = ({ children }) => {\n  const [theme, setTheme] = useState('light');\n  \n  // Initial theme detection\n  useEffect(() => {\n    const savedTheme = localStorage.getItem('theme');\n    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;\n    \n    if (savedTheme) {\n      setTheme(savedTheme);\n    } else if (prefersDark) {\n      setTheme('dark');\n    }\n  }, []);\n  \n  // Update HTML class when theme changes\n  useEffect(() => {\n    if (theme === 'dark') {\n      document.documentElement.classList.add('dark');\n    } else {\n      document.documentElement.classList.remove('dark');\n    }\n    localStorage.setItem('theme', theme);\n  }, [theme]);\n  \n  const toggleTheme = () => {\n    setTheme(theme === 'dark' ? 'light' : 'dark');\n  };\n  \n  return (\n    <ThemeContext.Provider value={{ theme, toggleTheme }}>\n      {children}\n    </ThemeContext.Provider>\n  );\n};\n\n// Custom hook for using the theme\nexport const useTheme = () => useContext(ThemeContext);\n```\n\n**3. Wrap your app with the provider**\n\n```jsx\n// In your App.js or index.js\nimport { ThemeProvider } from './ThemeContext';\n\nfunction App() {\n  return (\n    <ThemeProvider>\n      <YourApp />\n    </ThemeProvider>\n  );\n}\n```\n\n**4. Create a toggle component**\n\n```jsx\n// ThemeToggle.js\nimport { useTheme } from './ThemeContext';\nimport { SunIcon, MoonIcon } from '@heroicons/react/solid'; // If using Heroicons\n\nexport const ThemeToggle = () => {\n  const { theme, toggleTheme } = useTheme();\n  \n  return (\n    <button \n      onClick={toggleTheme}\n      className=\"p-2 rounded-full bg-gray-200 dark:bg-gray-800 transition-colors\"\n      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}\n    >\n      {theme === 'dark' ? \n        <SunIcon className=\"w-5 h-5 text-yellow-500\" /> : \n        <MoonIcon className=\"w-5 h-5 text-gray-700\" />}\n    </button>\n  );\n};\n```\n\n**5. Use Tailwind dark variant in your components**\n\n```jsx\n// Example component using dark mode variants\nconst Card = ({ title, content }) => {\n  return (\n    <div className=\"bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md transition-colors\">\n      <h2 className=\"text-gray-900 dark:text-white text-xl font-bold\">{title}</h2>\n      <p className=\"text-gray-600 dark:text-gray-300 mt-2\">{content}</p>\n    </div>\n  );\n};\n```\n\nThis approach gives you:\n- System preference detection\n- User preference persistence\n- Smooth transitions between themes\n- Type-safe theme context with a custom hook\n- Tailwind's utility-first approach for styling in both themes\n\nWould you like me to explain any part of this implementation in more detail?",
        timestamp: "2023-10-18T16:25:45Z"
      },
      {
        id: "msg5",
        role: "user",
        content: "This is perfect! I'll implement it following these steps. Thanks for the detailed explanation.",
        timestamp: "2023-10-18T17:30:00Z"
      }
    ]
  },
  {
    id: "chat5",
    title: "Weekly Status Update",
    date: "Oct 15, 2023",
    preview: "This week I completed the authentication flow...",
    created_at: "2023-10-15T13:00:00Z",
    updated_at: "2023-10-15T13:25:00Z",
    model: "gpt-3.5-turbo",
    messages: [
      {
        id: "msg1",
        role: "user",
        content: "Can you help me draft a weekly status update email? This week I completed the authentication flow, fixed 3 critical bugs in the checkout process, and started working on the new reporting dashboard. I still need to finish the user profile API integration.",
        timestamp: "2023-10-15T13:00:00Z"
      },
      {
        id: "msg2",
        role: "assistant",
        content: "# Weekly Status Update - Week of October 9, 2023\n\nHi Team,\n\nI hope this email finds you well. Here's a summary of my progress this week:\n\n## Completed:\n\n1. **Authentication Flow**\n   - Implemented sign-up, login, and password reset functionality\n   - Added OAuth integration with Google and Facebook\n   - Completed security review and addressed feedback\n\n2. **Checkout Process Bug Fixes**\n   - Fixed critical issue with payment processing timeouts\n   - Resolved address validation error that was blocking international orders\n   - Fixed cart calculation discrepancy when applying multiple discounts\n\n3. **Reporting Dashboard (In Progress)**\n   - Created initial layout and navigation\n   - Implemented data fetching framework\n   - Added first set of visualization components\n\n## In Progress:\n\n1. **User Profile API Integration**\n   - Currently working on connecting frontend components to backend endpoints\n   - Expected completion: End of next week\n\n## Next Week's Focus:\n\n1. Complete the User Profile API integration\n2. Continue developing the reporting dashboard features\n3. Begin work on export functionality for reports\n\nPlease let me know if you have any questions or if there are any priorities I should adjust.\n\nBest regards,\n[Your Name]\n",
        timestamp: "2023-10-15T13:03:30Z"
      },
      {
        id: "msg3",
        role: "user",
        content: "This looks good, but can you add a note about the upcoming team meeting on Wednesday?",
        timestamp: "2023-10-15T13:15:00Z"
      },
      {
        id: "msg4",
        role: "assistant",
        content: "# Weekly Status Update - Week of October 9, 2023\n\nHi Team,\n\nI hope this email finds you well. Here's a summary of my progress this week:\n\n## Completed:\n\n1. **Authentication Flow**\n   - Implemented sign-up, login, and password reset functionality\n   - Added OAuth integration with Google and Facebook\n   - Completed security review and addressed feedback\n\n2. **Checkout Process Bug Fixes**\n   - Fixed critical issue with payment processing timeouts\n   - Resolved address validation error that was blocking international orders\n   - Fixed cart calculation discrepancy when applying multiple discounts\n\n3. **Reporting Dashboard (In Progress)**\n   - Created initial layout and navigation\n   - Implemented data fetching framework\n   - Added first set of visualization components\n\n## In Progress:\n\n1. **User Profile API Integration**\n   - Currently working on connecting frontend components to backend endpoints\n   - Expected completion: End of next week\n\n## Next Week's Focus:\n\n1. Complete the User Profile API integration\n2. Continue developing the reporting dashboard features\n3. Begin work on export functionality for reports\n\n## Reminders:\n\n* **Team Meeting:** Wednesday, October 18 at 10:00 AM in Conference Room A (or via Zoom)\n  * I'll be presenting a demo of the new authentication flow\n  * Discussion on Q4 roadmap priorities\n\nPlease let me know if you have any questions or if there are any priorities I should adjust.\n\nBest regards,\n[Your Name]\n",
        timestamp: "2023-10-15T13:18:45Z"
      },
      {
        id: "msg5",
        role: "user",
        content: "Perfect! I'll send this out now.",
        timestamp: "2023-10-15T13:25:00Z"
      }
    ]
  }
];

const ChatHistoryPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();
  
  const filteredHistory = mockChatHistory.filter((chat) =>
    chat.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    chat.preview.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  const handleSelectChat = (chatId: string) => {
    console.log(`Selected chat: ${chatId}`);
    
    // Find the selected chat
    const selectedChat = mockChatHistory.find(chat => chat.id === chatId);
    
    if (selectedChat) {
      // Log what would be loaded in a real implementation
      console.log("Loading chat with the following data:", {
        id: selectedChat.id,
        title: selectedChat.title,
        model: selectedChat.model,
        messageCount: selectedChat.messages.length,
        firstMessage: selectedChat.messages[0].content.substring(0, 50) + "...",
        lastMessage: selectedChat.messages[selectedChat.messages.length - 1].content.substring(0, 50) + "..."
      });
      
      // Dispatch a custom event to notify the main window that a chat was selected
      try {
        // For the main window
        const chatSelectedEvent = new CustomEvent("chat-history-selected", {
          detail: { chat: selectedChat }
        });
        window.dispatchEvent(chatSelectedEvent);

        // For cross-window communication, use localStorage as a bridge
        const chatData = JSON.stringify({
          eventType: "chat-history-selected",
          timestamp: new Date().toISOString(),
          chat: selectedChat
        });
        localStorage.setItem("selectedChatHistory", chatData);

        // If we have the Electron API, try to execute JavaScript in the main window
        if (window.electronAPI) {
          // Execute JavaScript in the main window to load the chat
          const mainWindowScript = `
            try {
              if (localStorage.getItem("selectedChatHistory")) {
                const chatData = JSON.parse(localStorage.getItem("selectedChatHistory"));
                if (chatData && chatData.chat) {
                  console.log("Received chat history from history window:", chatData.chat.id);
                  // Dispatch event in main window
                  window.dispatchEvent(new CustomEvent("chat-history-selected", { 
                    detail: { chat: chatData.chat } 
                  }));
                }
              }
            } catch (e) {
              console.error("Error processing selected chat:", e);
            }
          `;
          console.log("Attempting to execute script in main window");
          // This would require additional Electron API support to run scripts in other windows
        }
      } catch (error) {
        console.error("Error dispatching chat selection event:", error);
      }
    }
    
    // Close window
    if (window.electronAPI) {
      window.electronAPI.closeHistoryWindow();
    }
  };
  
  const handleCloseHistory = () => {
    try {
      if (window.electronAPI) {
        console.log("Closing history window...");
        window.electronAPI.closeHistoryWindow()
          .then(() => {
            console.log("History window closed successfully");
          })
          .catch((error: Error) => {
            console.error("Error closing history window:", error);
          });
      } else {
        console.error("electronAPI is not available!");
      }
    } catch (error: unknown) {
      console.error("Error closing history window:", error);
    }
  };
  
  return (
    <div className="flex h-screen flex-col bg-background p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-semibold">Chat History</h1>
        </div>
        <button 
          onClick={handleCloseHistory}
          className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
          aria-label="Close history"
        >
          <X size={20} />
        </button>
      </div>
      
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
        <input
          type="text"
          placeholder="Search conversations..."
          className="w-full rounded-md border border-gray-300 py-3 pl-10 pr-4 dark:border-gray-600 dark:bg-gray-800"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>
      
      <div className="flex-1 overflow-y-auto pr-2">
        {filteredHistory.length > 0 ? (
          <ul className="space-y-3">
            {filteredHistory.map((chat) => (
              <li 
                key={chat.id}
                className="flex cursor-pointer items-start rounded-md border border-gray-200 p-4 hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
                onClick={() => handleSelectChat(chat.id)}
              >
                <MessageSquare className="mr-4 shrink-0 text-primary" size={24} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-lg truncate">{chat.title}</h3>
                    <span className="text-sm text-gray-500 whitespace-nowrap ml-2">{chat.date}</span>
                  </div>
                  <p className="mt-1 text-gray-500 truncate">{chat.preview}</p>
                  <div className="mt-2 flex items-center text-xs text-gray-400">
                    <span className="mr-2">{chat.messages.length} messages</span>
                    <span className="mr-2">•</span>
                    <span>{chat.model}</span>
                  </div>
                </div>
                <button 
                  className="ml-3 p-2 text-gray-400 hover:text-red-500 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
                  onClick={(e) => {
                    e.stopPropagation();
                    // Handle delete functionality (mock for now)
                    console.log("Delete chat:", chat.id);
                  }}
                >
                  <Trash2 size={18} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center justify-center h-[40vh] text-center">
            <MessageSquare className="text-gray-400 mb-3" size={32} />
            <p className="text-lg text-gray-500">No conversations found</p>
            {searchQuery && <p className="text-sm text-gray-400 mt-1">Try a different search term</p>}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatHistoryPage; 