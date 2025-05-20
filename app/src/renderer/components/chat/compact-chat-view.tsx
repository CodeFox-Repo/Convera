// app/src/renderer/components/chat/compact-chat-view.tsx
import React from 'react';
import ChatInput, { ChatInputRef } from './chat-input';

interface CompactChatViewProps {
  chatInputRef: React.RefObject<ChatInputRef | null>;
}

const CompactChatView: React.FC<CompactChatViewProps> = ({ chatInputRef }) => {
  return (
    <div className="h-full flex flex-col p-1">
      <div className="flex-1 min-h-[100px]">
        <ChatInput
          ref={chatInputRef}
          hasMessages={false}
        />
      </div>
    </div>
  );
};

export default CompactChatView;