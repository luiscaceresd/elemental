'use client'

import { useChat } from '@ai-sdk/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { cn } from '@/lib/utils';
import { AIChatMessageItem } from '@/components/ai-chat-message';
import { useChatScroll } from '@/hooks/use-chat-scroll';

interface AINPCChatProps {
  username: string;
  initialMessages?: Array<{
    id: string;
    content: string;
    role: 'user' | 'assistant';
  }>;
  onClose?: () => void;
  npcName?: string;
}

/**
 * AI NPC chat component based on the Vercel AI SDK
 * @param username - The username of the player
 * @param initialMessages - Initial messages to display in the chat
 * @param npcName - The name of the NPC (defaults to Guide)
 * @returns The chat component
 */
export const AINPCChat = ({
  username,
  initialMessages = [],
  onClose,
  npcName = "Guide"
}: AINPCChatProps) => {
  const { containerRef, scrollToBottom } = useChatScroll();
  
  // Setup the chat with the AI SDK
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/npc-chat', // Use our custom route
    initialMessages: initialMessages.map(msg => ({
      id: msg.id,
      content: msg.content,
      role: msg.role
    })),
  });

  // Map between the AI SDK's typing and our UI typings
  const formattedMessages = useMemo(() => {
    return messages.map(msg => ({
      ...msg,
      // Add any additional formatting needed
    }));
  }, [messages]);

  useEffect(() => {
    // Scroll to bottom whenever messages change
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Custom wrapper around handleSubmit to match the original component's behavior
  const onSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() === '' || isLoading) return;
    
    handleSubmit(e);
    // No need to clear input as the useChat hook handles this
  }, [handleSubmit, input, isLoading]);

  // Handle key presses in the input field
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    // Enter key should send the message
    if (e.key === 'Enter' && !e.shiftKey && input.trim() && !isLoading) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
    
    // Escape key should close the chat
    if (e.key === 'Escape' && onClose) {
      e.preventDefault();
      onClose();
    }
  }, [handleSubmit, input, isLoading, onClose]);

  // Add a ref for the input element
  const inputRef = useRef<HTMLInputElement>(null);

  // Add an effect to focus the input when the component mounts
  useEffect(() => {
    // Focus the input field when the component mounts
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  return (
    <div className="flex flex-col h-full w-full bg-background text-foreground antialiased">
      {/* Messages area */}
      <div ref={containerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground">
            No messages yet. Start the conversation!
          </div>
        ) : null}
        <div className="space-y-1">
          {formattedMessages.map((message, index) => {
            const prevMessage = index > 0 ? formattedMessages[index - 1] : null;
            const showHeader = !prevMessage || prevMessage.role !== message.role;
            const isUser = message.role === 'user';

            return (
              <div
                key={message.id}
                className="animate-in fade-in slide-in-from-bottom-4 duration-300"
              >
                <AIChatMessageItem
                  message={message}
                  isOwnMessage={isUser}
                  showHeader={showHeader}
                  username={username}
                  npcName={npcName}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Input form */}
      <form onSubmit={onSubmit} className="p-4 pt-2 pb-6 border-t border-border flex items-center gap-2">
        <Input
          ref={inputRef}
          className={cn(
            'rounded-full bg-background text-sm transition-all duration-300 npc-chat-input',
            !isLoading && input.trim() ? 'w-[calc(100%-36px)]' : 'w-full'
          )}
          type="text"
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          disabled={isLoading}
        />
        {!isLoading && input.trim() && (
          <Button
            className="aspect-square rounded-full animate-in fade-in slide-in-from-right-4 duration-300"
            type="submit"
            disabled={isLoading}
          >
            <Send className="size-4" />
          </Button>
        )}
      </form>
    </div>
  );
}; 