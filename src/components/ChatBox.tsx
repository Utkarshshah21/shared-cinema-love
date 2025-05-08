
import { useRef, useEffect } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Message {
  text: string;
  isSelf: boolean;
}

interface ChatBoxProps {
  messages: Message[];
}

const ChatBox = ({ messages }: ChatBoxProps) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <ScrollArea className="h-[calc(100vh-22rem)]">
      <div className="p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-center text-muted-foreground">
            <p>No messages yet.<br />Start chatting with your partner!</p>
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.isSelf ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`px-4 py-2 rounded-lg max-w-[80%] ${
                  message.isSelf
                    ? 'bg-purple-500 text-white rounded-br-none'
                    : 'bg-gray-100 text-gray-800 rounded-bl-none'
                }`}
              >
                {message.text}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
    </ScrollArea>
  );
};

export default ChatBox;
