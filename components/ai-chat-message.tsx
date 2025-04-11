import { cn } from '@/lib/utils'

interface AIChatMessageProps {
  message: {
    id: string;
    role: 'user' | 'assistant' | 'system' | 'data';
    content: string;
  };
  isOwnMessage: boolean;
  showHeader: boolean;
  username: string;
}

export const AIChatMessageItem = ({ 
  message, 
  isOwnMessage, 
  showHeader,
  username
}: AIChatMessageProps) => {
  return (
    <div className={`flex mt-2 ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
      <div
        className={cn('max-w-[75%] w-fit flex flex-col gap-1', {
          'items-end': isOwnMessage,
        })}
      >
        {showHeader && (
          <div
            className={cn('flex items-center gap-2 text-xs px-3', {
              'justify-end flex-row-reverse': isOwnMessage,
            })}
          >
            <span className={'font-medium'}>{isOwnMessage ? username : 'Guide'}</span>
            <span className="text-foreground/50 text-xs">
              {new Date().toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
              })}
            </span>
          </div>
        )}
        <div
          className={cn(
            'py-2 px-3 rounded-xl text-sm w-fit',
            isOwnMessage ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
          )}
        >
          {message.content}
        </div>
      </div>
    </div>
  )
} 