// app/src/renderer/components/chat/compact-chat-view.tsx
import { useAgentStore } from '@/renderer/libs/stores/agent-store';
import { useChatContext } from '@/renderer/libs/stores/chat-store';
import { useModelStore } from '@/renderer/libs/stores/model-store';
import React from 'react';
import ChatInput, { ChatInputRef } from './chat-input';

interface CompactChatViewProps {
  chatInputRef: React.RefObject<ChatInputRef | null>;
}

const CompactChatView: React.FC<CompactChatViewProps> = ({ chatInputRef }) => {
  const { 
    input, 
    setInput, 
    isLoading, 
    sendMessage, 
    stopGeneration, 
    copiedContent, 
    rejectCopiedContent 
  } = useChatContext();
  const { selectedAgent, triggerAgentSelect } = useAgentStore();
  const { selectedModelId, setSelectedModelId } = useModelStore();
  
  const handleReset = () => window.location.reload();
  const handleAddAttachment = () => {};
  const handleToggleTranslation = () => {}; 
  const handleVoiceInput = () => {}; 
  
  const triggerHistoryWindow = () => {
    if (window.electronAPI) {
      window.electronAPI.toggleHistoryWindow().catch(console.error);
    }
  };
  
  const handleOpenSettings = () => {
    if (window.electronAPI) {
      window.electronAPI.toggleSettingsWindow().catch(console.error);
    }
  };
  
  return (
    <div className="h-full flex flex-col p-1">
      <div className="flex-1 min-h-[100px]">
        <ChatInput
          ref={chatInputRef}
          isLoading={isLoading}
          input={input}
          setInput={setInput}
          hasMessages={false}
          onAddAttachment={handleAddAttachment}
          onToggleTranslation={handleToggleTranslation}
          onReset={handleReset}
          onVoiceInput={handleVoiceInput}
          onSendMessage={sendMessage}
          onStopGeneration={stopGeneration}
          selectedAgent={selectedAgent}
          triggerAgentSelect={triggerAgentSelect}
          selectedModelId={selectedModelId}
          onModelSelect={setSelectedModelId}
          triggerHistoryWindow={triggerHistoryWindow}
          onOpenSettings={handleOpenSettings}
          copiedContent={copiedContent}
          onRejectCopiedContent={rejectCopiedContent}
        />
      </div>
    </div>
  );
};

export default CompactChatView;