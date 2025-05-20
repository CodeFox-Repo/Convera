// app/src/renderer/components/chat/expanded-chat-view.tsx
import { useAgentStore } from '@/renderer/libs/stores/agent-store';
import { useChatContext } from '@/renderer/libs/stores/chat-store';
import { useChatUIStore } from '@/renderer/libs/stores/chat-ui-store';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, X } from 'lucide-react';
import React, { useEffect, useRef } from 'react';
import ChatContent from './chat-content';
import ChatInput, { ChatInputRef } from './chat-input';

const buttonVariants = {
  hidden: { opacity: 0, y: -10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2 } },
  hover: {
    scale: 1.1,
    backgroundColor: "hsl(var(--secondary) / 0.7)",
    transition: { duration: 0.15 },
  },
  tap: { scale: 0.95 },
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
    }, 500);
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
    <div
      className="no-drag-region bg flex h-full w-full flex-col"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="drag-region pointer-events-auto relative z-[100] h-12 w-full">
        <AnimatePresence>
          {showControls && (
            <motion.div
              className="no-drag-region absolute inset-x-0 top-5 flex justify-between px-4"
              initial="hidden"
              animate="visible"
              exit="hidden"
              variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
              transition={{ duration: 0.2 }}
            >
              <motion.button
                onClick={handleExit}
                className="bg-background/50 pointer-events-auto rounded-md p-1"
                aria-label="Exit"
                variants={buttonVariants}
                initial="visible"
                whileHover="hover"
                whileTap="tap"
              >
                <X size={22} />
              </motion.button>
              <motion.button
                onClick={handleNewHistory}
                className="bg-background/50 pointer-events-auto rounded-md p-1"
                aria-label="New chat"
                variants={buttonVariants}
                initial="visible"
                whileHover="hover"
                whileTap="tap"
              >
                <Plus size={22} />
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      
      <div className="drag-region flex flex-1 flex-col overflow-y-auto">
        <div className="drag-region min-h-0 flex-1 overflow-y-auto p-4">
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

        {error && (
          <div className="mx-auto w-[90%] border-red-500 rounded-md p-4 text-center">
            <p className="text-red-500 font-medium">
              {error.message || "An error occurred. Please check your API key or try again later."}
            </p>
          </div>
        )}

        <div className="drag-region flex flex-col p-1">
          <div className="flex-1">
            <ChatInput
              ref={chatInputRef}
              hasMessages={true}
              placeholder="Message to FoxyChat..."
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExpandedChatView;