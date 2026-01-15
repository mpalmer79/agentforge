import { useState, useCallback, useRef } from 'react';
import type { Provider, Tool, Message } from '../types';
import { generateId } from '../utils';

export interface UseChatConfig {
  provider: Provider;
  tools?: Tool[];
  systemPrompt?: string;
  initialMessages?: Message[];
  onFinish?: (message: Message) => void;
  onError?: (error: Error) => void;
}

export interface UseChatReturn {
  messages: Message[];
  input: string;
  setInput: (input: string) => void;
  handleSubmit: (e?: React.FormEvent) => void;
  isLoading: boolean;
  error: Error | null;
  reload: () => void;
  stop: () => void;
  append: (message: Omit<Message, 'id' | 'timestamp'>) => void;
}

/**
 * Simplified chat hook for common chat UI patterns
 */
export function useChat(config: UseChatConfig): UseChatReturn {
  const { provider, tools = [], systemPrompt, initialMessages = [], onFinish, onError } = config;

  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const lastUserMessageRef = useRef<string>('');

  const sendToProvider = useCallback(
    async (messagesToSend: Message[]) => {
      setIsLoading(true);
      setError(null);
      abortControllerRef.current = new AbortController();

      try {
        const response = await provider.complete({
          messages: messagesToSend,
          tools: tools.map((t) => t.toJSON()),
        });

        const assistantMessage: Message = {
          id: generateId('msg'),
          role: 'assistant',
          content: response.content,
          timestamp: Date.now(),
        };

        setMessages((prev) => [...prev, assistantMessage]);
        onFinish?.(assistantMessage);

        if (response.toolCalls && response.toolCalls.length > 0) {
          for (const toolCall of response.toolCalls) {
            const tool = tools.find((t) => t.name === toolCall.name);
            if (tool) {
              try {
                const result = await tool.execute(toolCall.arguments);
                const toolMessage: Message = {
                  id: generateId('msg'),
                  role: 'tool',
                  content: JSON.stringify(result),
                  timestamp: Date.now(),
                  metadata: { toolCallId: toolCall.id },
                };
                setMessages((prev) => [...prev, toolMessage]);

                await sendToProvider([...messagesToSend, assistantMessage, toolMessage]);
              } catch (toolError) {
                console.error(`Tool ${toolCall.name} failed:`, toolError);
              }
            }
          }
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        if (error.name !== 'AbortError') {
          setError(error);
          onError?.(error);
        }
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [provider, tools, onFinish, onError]
  );

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();

      if (!input.trim() || isLoading) return;

      const userMessage: Message = {
        id: generateId('msg'),
        role: 'user',
        content: input.trim(),
        timestamp: Date.now(),
      };

      lastUserMessageRef.current = input.trim();

      const messagesToSend: Message[] = [];

      if (systemPrompt) {
        messagesToSend.push({
          id: generateId('msg'),
          role: 'system',
          content: systemPrompt,
          timestamp: Date.now(),
        });
      }

      messagesToSend.push(...messages, userMessage);

      setMessages((prev) => [...prev, userMessage]);
      setInput('');

      sendToProvider(messagesToSend);
    },
    [input, isLoading, messages, systemPrompt, sendToProvider]
  );

  const reload = useCallback(() => {
    if (!lastUserMessageRef.current || isLoading) return;

    setMessages((prev) => {
      const lastMessage = prev[prev.length - 1];
      if (lastMessage?.role === 'assistant') {
        return prev.slice(0, -1);
      }
      return prev;
    });

    const messagesToSend: Message[] = [];

    if (systemPrompt) {
      messagesToSend.push({
        id: generateId('msg'),
        role: 'system',
        content: systemPrompt,
        timestamp: Date.now(),
      });
    }

    messagesToSend.push(...messages.filter((m) => m.role !== 'assistant'));

    sendToProvider(messagesToSend);
  }, [isLoading, messages, systemPrompt, sendToProvider]);

  const stop = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsLoading(false);
  }, []);

  const append = useCallback((message: Omit<Message, 'id' | 'timestamp'>) => {
    const fullMessage: Message = {
      ...message,
      id: generateId('msg'),
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, fullMessage]);
  }, []);

  return {
    messages,
    input,
    setInput,
    handleSubmit,
    isLoading,
    error,
    reload,
    stop,
    append,
  };
}
