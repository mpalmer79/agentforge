import { useState, useCallback, useRef, useEffect } from 'react';
import { Agent } from '../agent';
import type { Message, Tool, Provider, Middleware, MemoryConfig, ToolResult } from '../types';
import { generateId } from '../utils';

export interface UseStreamingAgentConfig {
  provider: Provider;
  tools?: Tool[];
  middleware?: Middleware[];
  memory?: MemoryConfig;
  systemPrompt?: string;
  onToken?: (token: string) => void;
  onToolCall?: (toolName: string, args: Record<string, unknown>) => void;
  onToolResult?: (result: ToolResult) => void;
  onComplete?: (content: string) => void;
  onError?: (error: Error) => void;
}

export interface UseStreamingAgentReturn {
  messages: Message[];
  streamingContent: string;
  isStreaming: boolean;
  error: Error | null;
  sendMessage: (content: string) => Promise<void>;
  reset: () => void;
  abort: () => void;
}

/**
 * React hook for streaming agent responses
 */
export function useStreamingAgent(config: UseStreamingAgentConfig): UseStreamingAgentReturn {
  const {
    provider,
    tools = [],
    middleware = [],
    memory,
    systemPrompt,
    onToken,
    onToolCall,
    onToolResult,
    onComplete,
    onError,
  } = config;

  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingContent, setStreamingContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const agentRef = useRef<Agent | null>(null);

  // Initialize agent
  useEffect(() => {
    agentRef.current = new Agent({
      provider,
      tools,
      middleware,
      memory,
      systemPrompt,
    });
  }, [provider, tools, middleware, memory, systemPrompt]);

  const sendMessage = useCallback(
    async (content: string): Promise<void> => {
      if (!agentRef.current) {
        const err = new Error('Agent not initialized');
        setError(err);
        onError?.(err);
        return;
      }

      // Add user message
      const userMessage: Message = {
        id: generateId('msg'),
        role: 'user',
        content,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsStreaming(true);
      setStreamingContent('');
      setError(null);

      abortControllerRef.current = new AbortController();

      try {
        // Build message array
        const allMessages: Message[] = [];

        if (systemPrompt && messages.length === 0) {
          allMessages.push({
            id: generateId('msg'),
            role: 'system',
            content: systemPrompt,
            timestamp: Date.now(),
          });
        }

        allMessages.push(...messages, userMessage);

        let fullContent = '';

        // Stream the response
        for await (const event of agentRef.current.stream(allMessages, {
          signal: abortControllerRef.current.signal,
        })) {
          switch (event.type) {
            case 'content': {
              const token = event.data as string;
              fullContent += token;
              setStreamingContent(fullContent);
              onToken?.(token);
              break;
            }

            case 'tool_call': {
              const toolCall = event.data as { name: string; arguments: Record<string, unknown> };
              onToolCall?.(toolCall.name, toolCall.arguments);
              break;
            }

            case 'tool_result': {
              onToolResult?.(event.data as ToolResult);
              break;
            }

            case 'done': {
              const assistantMessage: Message = {
                id: generateId('msg'),
                role: 'assistant',
                content: fullContent,
                timestamp: Date.now(),
              };

              setMessages((prev) => [...prev, assistantMessage]);
              setStreamingContent('');
              onComplete?.(fullContent);
              break;
            }
          }
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));

        if (error.name !== 'AbortError' && error.message !== 'Agent execution aborted') {
          setError(error);
          onError?.(error);
        }
      } finally {
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    },
    [messages, systemPrompt, onToken, onToolCall, onToolResult, onComplete, onError]
  );

  const reset = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setMessages([]);
    setStreamingContent('');
    setError(null);
    setIsStreaming(false);
  }, []);

  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsStreaming(false);

    // Save any streamed content as a partial message
    if (streamingContent) {
      const partialMessage: Message = {
        id: generateId('msg'),
        role: 'assistant',
        content: streamingContent + ' [interrupted]',
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, partialMessage]);
      setStreamingContent('');
    }
  }, [streamingContent]);

  return {
    messages,
    streamingContent,
    isStreaming,
    error,
    sendMessage,
    reset,
    abort,
  };
}
