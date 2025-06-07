// app/src/renderer/components/chat/compact-chat-view.tsx
import React from 'react';
import ChatInput, { ChatInputRef } from '../input/chat-input';

interface CompactChatViewProps {
  chatInputRef: React.RefObject<ChatInputRef | null>;
}

const CompactChatView: React.FC<CompactChatViewProps> = ({ chatInputRef }) => {
  return (
    <div className="h-full w-full flex items-end justify-center">
      <div 
        className="bg-background border-border w-full h-full rounded-xl border shadow-lg transition-all duration-300 ease-in-out"
      >
        <div className="h-full flex flex-col p-2">
          <ChatInput
            ref={chatInputRef}
            hasMessages={false}
          />
        </div>
      </div>
    </div>
  );
};

export default CompactChatView;