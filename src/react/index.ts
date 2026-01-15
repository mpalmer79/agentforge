export { AgentProvider, useAgentContext, useHasAgentProvider } from './context';
export type { AgentProviderConfig, AgentProviderProps } from './context';

export { useAgent } from './useAgent';
export type { UseAgentConfig, UseAgentReturn } from './useAgent';

export { useChat } from './useChat';
export type { UseChatConfig, UseChatReturn } from './useChat';

export { useStreamingAgent } from './useStreamingAgent';
export type { UseStreamingAgentConfig, UseStreamingAgentReturn } from './useStreamingAgent';

// v1.1.0 - Enhanced React Components
export {
  ChatWindow,
  MessageList,
  MessageBubble,
  ToolStatus,
  TypingIndicator,
  ChatErrorBoundary,
  Avatar,
} from './components';
export type {
  ChatWindowProps,
  ChatWindowRef,
  MessageListProps,
  MessageBubbleProps,
  ToolStatusProps,
  TypingIndicatorProps,
} from './components';
