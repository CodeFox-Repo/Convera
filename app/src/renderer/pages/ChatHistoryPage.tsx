import React, { useState, useEffect } from "react";
import { Search, Trash2, MessageSquare, X, RefreshCw } from "lucide-react";

// Interface for chat data
interface ChatData {
  id: string;
  title: string;
  createdAt: string;
  lastUpdated: string;
  messageCount: number;
  messages?: {
    id: string;
    role: string;
    content: string;
    timestamp: string;
  }[];
}

const ChatHistoryPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  
  // Function to fetch chat history
  const fetchChatHistory = async () => {
    try {
      setRefreshing(true);
      const response = await fetch('http://localhost:38000/api/chats');
      const data = await response.json();
      
      if (data.status === "success") {
        setChatHistory(data.chats);
        setError(null);
      } else {
        setError("Failed to load chat history");
      }
    } catch (err) {
      console.error("Error fetching chat history:", err);
      setError("Error connecting to server");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };
  
  // Fetch on initial load
  useEffect(() => {
    fetchChatHistory();
    
    // Add event listeners for window focus and visibility
    const handleFocus = () => {
      console.log("Window focused, refreshing chat history");
      fetchChatHistory();
    };
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log("Window visible, refreshing chat history");
        fetchChatHistory();
      }
    };
    
    // Listen for when the window gets focus
    window.addEventListener('focus', handleFocus);
    
    // Listen for visibility changes
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Custom event for Electron window show
    window.addEventListener('window-show', handleFocus);
    
    // Cleanup event listeners
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('window-show', handleFocus);
    };
  }, []);
  
  // Filter chats based on search query
  const filteredHistory = chatHistory.filter((chat) =>
    chat.title.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  // Handle refreshing chat list manually
  const handleRefresh = () => {
    fetchChatHistory();
  };
  
  // Handle selecting a chat
  const handleSelectChat = async (chatId: string) => {
    try {
      const response = await fetch(`http://localhost:38000/api/chats/${chatId}`);
      const data = await response.json();
      
      if (data.status === "success") {
        // Dispatch a custom event to notify the main window that a chat was selected
        try {
          const chatSelectedEvent = new CustomEvent("chat-history-selected", {
            detail: { chat: data.chat }
          });
          window.dispatchEvent(chatSelectedEvent);

          // For cross-window communication, use localStorage as a bridge
          const chatData = JSON.stringify({
            eventType: "chat-history-selected",
            timestamp: new Date().toISOString(),
            chat: data.chat
          });
          localStorage.setItem("selectedChatHistory", chatData);

          // If we have the Electron API, try to close the window
          if (window.electronAPI) {
            window.electronAPI.toggleHistoryWindow();
          }
        } catch (error) {
          console.error("Error dispatching chat selection event:", error);
        }
      } else {
        setError("Failed to load chat");
      }
    } catch (err) {
      console.error("Error fetching chat details:", err);
      setError("Error loading chat");
    }
  };
  
  // Handle deleting a chat
  const handleDeleteChat = async (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    
    try {
      const response = await fetch(`http://localhost:38000/api/chats/${chatId}`, {
        method: 'DELETE'
      });
      const data = await response.json();
      
      if (data.status === "success") {
        // Remove chat from the local state
        setChatHistory(prevChats => prevChats.filter(chat => chat.id !== chatId));
      } else {
        setError("Failed to delete chat");
      }
    } catch (err) {
      console.error("Error deleting chat:", err);
      setError("Error deleting chat");
    }
  };
  
  // Handle closing the history window
  const handleCloseHistory = () => {
    try {
      if (window.electronAPI) {
        console.log("Closing history window...");
        window.electronAPI.toggleHistoryWindow()
          .then(() => {
            console.log("History window toggled successfully");
          })
          .catch((error: Error) => {
            console.error("Error toggling history window:", error);
          });
      } else {
        console.error("electronAPI is not available!");
      }
    } catch (error: unknown) {
      console.error("Error toggling history window:", error);
    }
  };
  
  // Format the date for display
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      
      if (date.toDateString() === now.toDateString()) {
        return `Today, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      } else if (date.toDateString() === yesterday.toDateString()) {
        return `Yesterday, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      } else {
        return date.toLocaleDateString(undefined, { 
          year: 'numeric', 
          month: 'short', 
          day: 'numeric' 
        });
      }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      return dateString;
    }
  };
  
  return (
    <div className="flex h-screen flex-col bg-background p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-semibold">Chat History</h1>
          <button 
            onClick={handleRefresh}
            className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
            aria-label="Refresh chat history"
            disabled={refreshing}
          >
            <RefreshCw size={18} className={refreshing ? "animate-spin" : ""} />
          </button>
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
        {loading && chatHistory.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p>Loading chat history...</p>
          </div>
        ) : error && chatHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-red-500 mb-2">{error}</p>
            <button 
              className="px-4 py-2 bg-primary text-white rounded-md"
              onClick={handleRefresh}
            >
              Retry
            </button>
          </div>
        ) : filteredHistory.length > 0 ? (
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
                    <span className="text-sm text-gray-500 whitespace-nowrap ml-2">{formatDate(chat.lastUpdated)}</span>
                  </div>
                  <div className="mt-2 flex items-center text-xs text-gray-400">
                    <span className="mr-2">{chat.messageCount} messages</span>
                    <span className="mr-2">•</span>
                    <span>{formatDate(chat.createdAt)}</span>
                  </div>
                </div>
                <button 
                  className="ml-3 p-2 text-gray-400 hover:text-red-500 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
                  onClick={(e) => handleDeleteChat(e, chat.id)}
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