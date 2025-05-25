// app/src/renderer/components/chat/expanded-chat-view.tsx
import { useAgentStore } from '@/renderer/libs/stores/agent-store';
import { useChatContext } from '@/renderer/libs/stores/chat-store';
import { useChatUIStore } from '@/renderer/libs/stores/chat-ui-store';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, Sparkles, X } from 'lucide-react';
import React, { useEffect, useRef } from 'react';
import ChatInput, { ChatInputRef } from '../input/chat-input';
import ChatContent from '../message/chat-content';

const buttonVariants = {
  hidden: { opacity: 0, y: -10, scale: 0.8 },
  visible: { 
    opacity: 1, 
    y: 0, 
    scale: 1,
    transition: { 
      duration: 0.3,
      type: "spring",
      damping: 20,
      stiffness: 300
    } 
  },
  hover: {
    scale: 1.1,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    backdropFilter: "blur(20px)",
    transition: { duration: 0.2 },
  },
  tap: { scale: 0.95 },
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1,
    transition: {
      duration: 0.4,
      ease: "easeOut"
    }
  }
};

interface ExpandedChatViewProps {
  chatInputRef: React.RefObject<ChatInputRef | null>;
}

const ExpandedChatView: React.FC<ExpandedChatViewProps> = ({ chatInputRef }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const { 
    messages, 
    isLoading, 
    editMessage,
    regenerateMessage,
    error
  } = useChatContext();
  
  const { showControls, setShowControls } = useChatUIStore();
  const { agentChanged, handleAgentChange } = useAgentStore();
  
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);
  
  const controlsTimerRef = useRef<number | null>(null);
  
  const handleMouseEnter = () => {
    if (controlsTimerRef.current) {
      window.clearTimeout(controlsTimerRef.current);
    }
    setShowControls(true);
  };
  
  const handleMouseLeave = () => {
    if (controlsTimerRef.current) {
      window.clearTimeout(controlsTimerRef.current);
    }
    
    controlsTimerRef.current = window.setTimeout(() => {
      setShowControls(false);
    }, 1000);
  };
  
  useEffect(() => {
    return () => {
      if (controlsTimerRef.current) {
        window.clearTimeout(controlsTimerRef.current);
      }
    };
  }, []);
  
  const handleExit = () => {
    if (window.electronAPI) {
      window.electronAPI.closeWindow();
    }
  };
  
  const handleNewHistory = () => {
    window.location.reload();
  };
  
  return (
    <motion.div
      className="no-drag-region relative h-full w-full flex flex-col overflow-hidden"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Modern gradient background with glass effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20 dark:from-slate-900 dark:via-slate-800/50 dark:to-purple-900/20" />
      
      {/* Animated background particles/orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div 
          className="absolute -top-10 -left-10 w-32 h-32 bg-gradient-to-br from-blue-400/20 to-purple-400/20 rounded-full blur-2xl"
          animate={{
            x: [0, 100, 0],
            y: [0, 50, 0],
            scale: [1, 1.2, 1],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
        <motion.div 
          className="absolute -bottom-10 -right-10 w-40 h-40 bg-gradient-to-br from-orange-400/15 to-pink-400/15 rounded-full blur-2xl"
          animate={{
            x: [0, -80, 0],
            y: [0, -60, 0],
            scale: [1, 0.8, 1],
          }}
          transition={{
            duration: 25,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
        <motion.div 
          className="absolute top-1/3 left-1/2 w-24 h-24 bg-gradient-to-br from-green-400/10 to-teal-400/10 rounded-full blur-xl"
          animate={{
            x: [0, -50, 0],
            y: [0, 30, 0],
            scale: [1, 1.3, 1],
          }}
          transition={{
            duration: 15,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
      </div>

      {/* Enhanced frosted glass morphism overlay - more transparent */}
      <div className="absolute inset-0 bg-white/10 dark:bg-black/5 backdrop-blur-3xl" />
      
      {/* Additional subtle texture overlay for frosted effect - more transparent */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-white/3 dark:from-white/3 dark:via-transparent dark:to-white/1" />

      {/* Top control bar */}
      <div className="drag-region relative z-50 h-14 w-full flex items-center">
        <AnimatePresence>
          {showControls && (
            <motion.div
              className="no-drag-region absolute inset-x-0 top-4 flex justify-between items-center px-6"
              initial="hidden"
              animate="visible"
              exit="hidden"
              variants={{ 
                hidden: { opacity: 0, y: -20 }, 
                visible: { 
                  opacity: 1, 
                  y: 0,
                  transition: {
                    duration: 0.3,
                    staggerChildren: 0.1
                  }
                } 
              }}
            >
              {/* Left side - branding - more transparent */}
              <motion.div 
                className="flex items-center gap-3"
                variants={buttonVariants}
              >
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/8 dark:bg-black/8 backdrop-blur-2xl border border-white/10 dark:border-white/5">
                  <Sparkles size={16} className="text-orange-500" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-200">FoxyChat</span>
                </div>
              </motion.div>

              {/* Right side controls - more transparent */}
              <motion.div 
                className="flex items-center gap-3"
                variants={{ 
                  visible: {
                    transition: {
                      staggerChildren: 0.05
                    }
                  }
                }}
              >
                <motion.button
                  onClick={handleNewHistory}
                  className="p-2.5 rounded-full bg-white/8 dark:bg-black/8 backdrop-blur-2xl border border-white/10 dark:border-white/5 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white transition-colors"
                  aria-label="New chat"
                  variants={buttonVariants}
                  whileHover="hover"
                  whileTap="tap"
                >
                  <Plus size={18} />
                </motion.button>
                <motion.button
                  onClick={handleExit}
                  className="p-2.5 rounded-full bg-white/8 dark:bg-black/8 backdrop-blur-2xl border border-white/10 dark:border-white/5 text-gray-600 dark:text-gray-300 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                  aria-label="Exit"
                  variants={buttonVariants}
                  whileHover="hover"
                  whileTap="tap"
                >
                  <X size={18} />
                </motion.button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      
      {/* Main content area */}
      <div className="relative flex flex-1 flex-col overflow-hidden">
        {/* Chat content with improved styling */}
        <div className="flex-1 overflow-y-auto">
          <div className="relative">
            <ChatContent
              messages={messages}
              messagesEndRef={messagesEndRef}
              isLoading={isLoading}
              onEditMessage={editMessage}
              onRegenerateMessage={regenerateMessage}
              agentChanged={agentChanged}
              onRegenerateWithNewAgent={() => handleAgentChange(true)}
              onIgnoreAgentChange={() => handleAgentChange(false)}
            />
          </div>
        </div>

        {/* Error display with more transparent styling */}
        {error && (
          <motion.div 
            className="mx-6 mb-4 p-4 rounded-2xl bg-red-50/30 dark:bg-red-900/8 border border-red-200/15 dark:border-red-800/10 backdrop-blur-2xl"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <p className="text-red-700 dark:text-red-300 font-medium text-sm">
                {error.message || "An error occurred. Please check your API key or try again later."}
              </p>
            </div>
          </motion.div>
        )}

        {/* Chat input with ultra transparent frosted glass styling */}
        <div className="relative px-6 pb-6">
          <div className="relative">
            {/* Input background glow */}
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10 rounded-2xl blur-lg" />
            
            {/* Input container with ultra transparent frosted glass */}
            <div className="relative bg-white/12 dark:bg-black/8 backdrop-blur-3xl rounded-2xl border border-white/10 dark:border-white/3">
              <ChatInput
                ref={chatInputRef}
                hasMessages={true}
                placeholder="Ask me anything..."
              />
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default ExpandedChatView;