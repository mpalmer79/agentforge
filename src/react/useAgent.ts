import { useState, useCallback, useRef, useEffect } from 'react';
import { Agent } from '../agent';
import type {
  Message,
  Tool,
  Provider,
  Middleware,
  MemoryConfig,
  ToolResult,
  AgentResponse,
} from '../types';
import { generateId } from '../utils';

export interface UseAgentConfig {
  provider?: Provider;
  tools?: Tool[];
  middleware?: Middleware[];
  memory?: MemoryConfig;
  systemPrompt?: string;
  onError?: (error: Error) => void;
  onToolCall?: (toolName: string, args: Record<string, unknown>) => void;
  onToolResult?: (result: ToolResult) => void;
  onMessage?: (message: Message) => void;
}

export interface UseAgentReturn {
  messages: Message[];
  isLoading: boolean;
  error: Error | null;
  sendMessage: (content: string) => Promise<AgentResponse | null>;
  reset: () => void;
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void;
  setMessages: (messages: Message[]) => void;
  abort: () => void;
}

/**
 * React hook for interacting with an AI agent
 */
export function useAgent(config: UseAgentConfig): UseAgentReturn {
  const {
    provider,
    tools = [],
    middleware = [],
    memory,
    systemPrompt,
    onError,
    onToolCall,
    onToolResult,
    onMessage,
  } = config;

  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const agentRef = useRef<Agent | null>(null);

  // Initialize or update agent when config changes
  useEffect(() => {
    if (!provider) {
      agentRef.current = null;
      return;
    }

    agentRef.current = new Agent({
      provider,
      tools,
      middleware,
      memory,
      systemPrompt,
    });
  }, [provider, tools, middleware, memory, systemPrompt]);

  const sendMessage = useCallback(
    async (content: string): Promise<AgentResponse | null> => {
      if (!agentRef.current) {
        const err = new Error('Agent not initialized. Provide a provider.');
        setError(err);
        onError?.(err);
        return null;
      }

      // Create user message
      const userMessage: Message = {
        id: generateId('msg'),
        role: 'user',
        content,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMessage]);
      onMessage?.(userMessage);
      setIsLoading(true);
      setError(null);

      // Create abort controller
      abortControllerRef.current = new AbortController();

      try {
        // Build messages array with history
        const allMessages: Message[] = [];

        // Add system prompt if exists and not already in messages
        if (systemPrompt && messages.length === 0) {
          allMessages.push({
            id: generateId('msg'),
            role: 'system',
            content: systemPrompt,
            timestamp: Date.now(),
          });
        }

        // Add existing messages
        allMessages.push(...messages);

        // Add new user message
        allMessages.push(userMessage);

        // Run agent
        const response = await agentRef.current.run(allMessages, {
          signal: abortControllerRef.current.signal,
        });

        // Handle tool calls
        if (response.toolResults) {
          for (const result of response.toolResults) {
            onToolResult?.(result);
          }
        }

        // Create assistant message
        const assistantMessage: Message = {
          id: generateId('msg'),
          role: 'assistant',
          content: response.content,
          timestamp: Date.now(),
        };

        setMessages((prev) => [...prev, assistantMessage]);
        onMessage?.(assistantMessage);

        return response;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));

        // Don't report abort errors
        if (error.name !== 'AbortError' && error.message !== 'Agent execution aborted') {
          setError(error);
          onError?.(error);
        }

        return null;
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [messages, systemPrompt, onError, onToolCall, onToolResult, onMessage]
  );

  const reset = useCallback(() => {
    // Abort any pending request
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;

    setMessages([]);
    setError(null);
    setIsLoading(false);
  }, []);

  const addMessage = useCallback(
    (message: Omit<Message, 'id' | 'timestamp'>) => {
      const fullMessage: Message = {
        ...message,
        id: generateId('msg'),
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, fullMessage]);
      onMessage?.(fullMessage);
    },
    [onMessage]
  );

  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsLoading(false);
  }, []);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    reset,
    addMessage,
    setMessages,
    abort,
  };
}
