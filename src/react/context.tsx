import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Provider, Tool, Middleware, MemoryConfig } from '../types';

export interface AgentProviderConfig {
  provider: Provider;
  tools?: Tool[];
  middleware?: Middleware[];
  memory?: MemoryConfig;
  systemPrompt?: string;
}

interface AgentContextValue {
  config: AgentProviderConfig;
}

const AgentContext = createContext<AgentContextValue | null>(null);

export interface AgentProviderProps extends AgentProviderConfig {
  children: ReactNode;
}

/**
 * Provider component for agent configuration
 */
export function AgentProvider({
  children,
  provider,
  tools,
  middleware,
  memory,
  systemPrompt,
}: AgentProviderProps): JSX.Element {
  const value = useMemo(
    () => ({
      config: {
        provider,
        tools,
        middleware,
        memory,
        systemPrompt,
      },
    }),
    [provider, tools, middleware, memory, systemPrompt]
  );

  return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>;
}

/**
 * Hook to access agent context
 */
export function useAgentContext(): AgentContextValue {
  const context = useContext(AgentContext);

  if (!context) {
    throw new Error('useAgentContext must be used within an AgentProvider');
  }

  return context;
}

/**
 * Hook to check if inside AgentProvider
 */
export function useHasAgentProvider(): boolean {
  const context = useContext(AgentContext);
  return context !== null;
}
