/**
 * Enhanced React Components for AgentForge
 *
 * Production-ready UI components for building chat interfaces:
 * - ChatWindow: Complete chat interface with input
 * - MessageList: Scrollable message display
 * - MessageBubble: Individual message rendering
 * - ToolStatus: Tool execution visualization
 * - TypingIndicator: Streaming/loading indicator
 */

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
  type ReactNode,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import type { Message, ToolCall, ToolResult } from '../types';

// ============================================
// Types
// ============================================

export interface ChatWindowProps {
  /** Current messages to display */
  messages: Message[];
  /** Called when user sends a message */
  onSendMessage: (content: string) => void;
  /** Whether the agent is currently responding */
  isLoading?: boolean;
  /** Current streaming content (partial response) */
  streamingContent?: string;
  /** Pending tool calls being executed */
  pendingToolCalls?: ToolCall[];
  /** Completed tool results */
  toolResults?: ToolResult[];
  /** Placeholder text for input */
  placeholder?: string;
  /** Disable input */
  disabled?: boolean;
  /** Custom class name */
  className?: string;
  /** Custom styles */
  style?: CSSProperties;
  /** Custom message renderer */
  renderMessage?: (message: Message, index: number) => ReactNode;
  /** Custom tool status renderer */
  renderToolStatus?: (toolCall: ToolCall, result?: ToolResult) => ReactNode;
  /** Header content */
  header?: ReactNode;
  /** Footer content (above input) */
  footer?: ReactNode;
  /** Maximum input length */
  maxInputLength?: number;
  /** Enable auto-scroll to bottom */
  autoScroll?: boolean;
  /** Show timestamps */
  showTimestamps?: boolean;
}

export interface ChatWindowRef {
  /** Focus the input field */
  focus: () => void;
  /** Clear the input field */
  clearInput: () => void;
  /** Scroll to bottom */
  scrollToBottom: () => void;
  /** Get current input value */
  getInputValue: () => string;
  /** Set input value */
  setInputValue: (value: string) => void;
}

export interface MessageListProps {
  /** Messages to display */
  messages: Message[];
  /** Custom message renderer */
  renderMessage?: (message: Message, index: number) => ReactNode;
  /** Show timestamps */
  showTimestamps?: boolean;
  /** Custom class name */
  className?: string;
  /** Custom styles */
  style?: CSSProperties;
}

export interface MessageBubbleProps {
  /** The message to display */
  message: Message;
  /** Show timestamp */
  showTimestamp?: boolean;
  /** Custom class name */
  className?: string;
  /** Custom styles */
  style?: CSSProperties;
}

export interface ToolStatusProps {
  /** Tool calls being executed */
  toolCalls: ToolCall[];
  /** Completed tool results */
  toolResults?: ToolResult[];
  /** Whether tools are currently executing */
  isExecuting?: boolean;
  /** Custom renderer for tool items */
  renderToolItem?: (toolCall: ToolCall, result?: ToolResult) => ReactNode;
  /** Custom class name */
  className?: string;
  /** Custom styles */
  style?: CSSProperties;
  /** Collapse completed tools */
  collapseCompleted?: boolean;
}

export interface TypingIndicatorProps {
  /** Whether to show the indicator */
  isVisible: boolean;
  /** Custom text */
  text?: string;
  /** Custom class name */
  className?: string;
  /** Custom styles */
  style?: CSSProperties;
}

// ============================================
// Styles (CSS-in-JS defaults)
// ============================================

const defaultStyles = {
  chatWindow: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    overflow: 'hidden',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  messageList: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '16px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  inputContainer: {
    display: 'flex',
    padding: '12px 16px',
    borderTop: '1px solid #e5e7eb',
    gap: '8px',
  },
  input: {
    flex: 1,
    padding: '10px 14px',
    borderRadius: '8px',
    border: '1px solid #d1d5db',
    fontSize: '14px',
    outline: 'none',
    resize: 'none' as const,
  },
  sendButton: {
    padding: '10px 20px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: '#3b82f6',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  sendButtonDisabled: {
    backgroundColor: '#9ca3af',
    cursor: 'not-allowed',
  },
  messageBubble: {
    maxWidth: '80%',
    padding: '10px 14px',
    borderRadius: '12px',
    fontSize: '14px',
    lineHeight: 1.5,
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#3b82f6',
    color: '#ffffff',
  },
  assistantMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#f3f4f6',
    color: '#1f2937',
  },
  systemMessage: {
    alignSelf: 'center',
    backgroundColor: '#fef3c7',
    color: '#92400e',
    fontSize: '12px',
    padding: '6px 12px',
  },
  toolMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#ecfdf5',
    color: '#065f46',
    fontFamily: 'monospace',
    fontSize: '12px',
  },
  timestamp: {
    fontSize: '10px',
    color: '#9ca3af',
    marginTop: '4px',
  },
  toolStatus: {
    padding: '8px 12px',
    backgroundColor: '#f8fafc',
    borderRadius: '6px',
    fontSize: '12px',
  },
  toolItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 0',
  },
  toolIcon: {
    width: '16px',
    height: '16px',
  },
  typingIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '8px 12px',
    color: '#6b7280',
    fontSize: '14px',
  },
  dot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: '#9ca3af',
    animation: 'bounce 1.4s infinite ease-in-out both',
  },
};

// ============================================
// Helper to check if tool succeeded
// ============================================

function isToolSuccess(result: ToolResult): boolean {
  return result.error === undefined || result.error === null;
}

// ============================================
// ChatWindow Component
// ============================================

export const ChatWindow = forwardRef<ChatWindowRef, ChatWindowProps>(function ChatWindow(
  {
    messages,
    onSendMessage,
    isLoading = false,
    streamingContent,
    pendingToolCalls = [],
    toolResults = [],
    placeholder = 'Type a message...',
    disabled = false,
    className,
    style,
    renderMessage,
    renderToolStatus,
    header,
    footer,
    maxInputLength = 10000,
    autoScroll = true,
    showTimestamps = false,
  },
  ref
) {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    clearInput: () => setInputValue(''),
    scrollToBottom: () => {
      if (listRef.current) {
        listRef.current.scrollTop = listRef.current.scrollHeight;
      }
    },
    getInputValue: () => inputValue,
    setInputValue: (value: string) => setInputValue(value),
  }));

  // Auto-scroll on new messages
  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, streamingContent, autoScroll]);

  const handleSend = useCallback(() => {
    const trimmed = inputValue.trim();
    if (trimmed && !disabled && !isLoading) {
      onSendMessage(trimmed);
      setInputValue('');
    }
  }, [inputValue, disabled, isLoading, onSendMessage]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Build display messages including streaming
  const displayMessages: Message[] = [...messages];
  if (streamingContent) {
    displayMessages.push({
      id: 'streaming',
      role: 'assistant',
      content: streamingContent,
      timestamp: Date.now(),
      metadata: { streaming: true },
    });
  }

  return (
    <div className={className} style={{ ...defaultStyles.chatWindow, ...style }}>
      {header}

      <div ref={listRef} style={defaultStyles.messageList}>
        <MessageList
          messages={displayMessages}
          renderMessage={renderMessage}
          showTimestamps={showTimestamps}
        />

        {pendingToolCalls.length > 0 &&
          (renderToolStatus ? (
            <React.Fragment>
              {pendingToolCalls.map((tc) => (
                <React.Fragment key={tc.id}>
                  {renderToolStatus(
                    tc,
                    toolResults.find((r) => r.toolCallId === tc.id)
                  )}
                </React.Fragment>
              ))}
            </React.Fragment>
          ) : (
            <ToolStatus
              toolCalls={pendingToolCalls}
              toolResults={toolResults}
              isExecuting={isLoading}
            />
          ))}

        {isLoading && !streamingContent && pendingToolCalls.length === 0 && (
          <TypingIndicator isVisible={true} />
        )}
      </div>

      {footer}

      <div style={defaultStyles.inputContainer}>
        <textarea
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value.slice(0, maxInputLength))}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || isLoading}
          rows={1}
          style={{
            ...defaultStyles.input,
            minHeight: '40px',
            maxHeight: '120px',
          }}
        />
        <button
          onClick={handleSend}
          disabled={disabled || isLoading || !inputValue.trim()}
          style={{
            ...defaultStyles.sendButton,
            ...(disabled || isLoading || !inputValue.trim()
              ? defaultStyles.sendButtonDisabled
              : {}),
          }}
        >
          {isLoading ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  );
});

// ============================================
// MessageList Component
// ============================================

export function MessageList({
  messages,
  renderMessage,
  showTimestamps = false,
  className,
  style,
}: MessageListProps): React.ReactElement {
  return (
    <div className={className} style={style}>
      {messages.map((message, index) =>
        renderMessage ? (
          <React.Fragment key={message.id || index}>{renderMessage(message, index)}</React.Fragment>
        ) : (
          <MessageBubble
            key={message.id || index}
            message={message}
            showTimestamp={showTimestamps}
          />
        )
      )}
    </div>
  );
}

// ============================================
// MessageBubble Component
// ============================================

export function MessageBubble({
  message,
  showTimestamp = false,
  className,
  style,
}: MessageBubbleProps): React.ReactElement {
  const getBubbleStyle = (): CSSProperties => {
    const base = { ...defaultStyles.messageBubble };

    switch (message.role) {
      case 'user':
        return { ...base, ...defaultStyles.userMessage };
      case 'assistant':
        return { ...base, ...defaultStyles.assistantMessage };
      case 'system':
        return { ...base, ...defaultStyles.systemMessage };
      case 'tool':
        return { ...base, ...defaultStyles.toolMessage };
      default:
        return base;
    }
  };

  const formatContent = (content: string): React.ReactElement => {
    // Handle code blocks
    if (content.includes('```')) {
      const parts = content.split(/(```[\s\S]*?```)/g);
      return (
        <React.Fragment>
          {parts.map((part, i) => {
            if (part.startsWith('```')) {
              const code = part.replace(/```\w*\n?/g, '').trim();
              return (
                <pre
                  key={i}
                  style={{
                    backgroundColor: '#1f2937',
                    color: '#e5e7eb',
                    padding: '8px 12px',
                    borderRadius: '4px',
                    overflow: 'auto',
                    fontSize: '12px',
                    margin: '8px 0',
                  }}
                >
                  <code>{code}</code>
                </pre>
              );
            }
            return <span key={i}>{part}</span>;
          })}
        </React.Fragment>
      );
    }

    return <React.Fragment>{content}</React.Fragment>;
  };

  return (
    <div
      className={className}
      style={{
        ...getBubbleStyle(),
        ...style,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ whiteSpace: 'pre-wrap' }}>
        {formatContent(message.content)}
        {(message.metadata?.streaming as boolean) && <span style={{ opacity: 0.5 }}>▋</span>}
      </div>
      {showTimestamp && message.timestamp && (
        <div style={defaultStyles.timestamp}>
          {new Date(message.timestamp).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}

// ============================================
// ToolStatus Component
// ============================================

export function ToolStatus({
  toolCalls,
  toolResults = [],
  isExecuting = false,
  renderToolItem,
  className,
  style,
  collapseCompleted = false,
}: ToolStatusProps): React.ReactElement | null {
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (toolCalls.length === 0) return null;

  const resultMap = new Map(toolResults.map((r) => [r.toolCallId, r]));
  const completedCount = toolResults.length;
  const totalCount = toolCalls.length;
  const allComplete = completedCount === totalCount && !isExecuting;

  if (collapseCompleted && allComplete && isCollapsed) {
    return (
      <div
        className={className}
        style={{ ...defaultStyles.toolStatus, ...style, cursor: 'pointer' }}
        onClick={() => setIsCollapsed(false)}
      >
        <span>
          ✓ {totalCount} tool{totalCount > 1 ? 's' : ''} executed
        </span>
      </div>
    );
  }

  return (
    <div className={className} style={{ ...defaultStyles.toolStatus, ...style }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '8px',
        }}
      >
        <strong style={{ fontSize: '12px', color: '#374151' }}>
          {isExecuting ? 'Executing Tools...' : 'Tools'}
        </strong>
        <span style={{ fontSize: '11px', color: '#6b7280' }}>
          {completedCount}/{totalCount}
        </span>
      </div>

      {toolCalls.map((toolCall) => {
        const result = resultMap.get(toolCall.id);

        if (renderToolItem) {
          return (
            <React.Fragment key={toolCall.id}>{renderToolItem(toolCall, result)}</React.Fragment>
          );
        }

        const success = result ? isToolSuccess(result) : undefined;

        return (
          <div key={toolCall.id} style={defaultStyles.toolItem}>
            <span style={{ fontSize: '14px' }}>{result ? (success ? '✓' : '✗') : '⋯'}</span>
            <span style={{ fontWeight: 500 }}>{toolCall.name}</span>
            {result && (
              <span
                style={{
                  color: success ? '#059669' : '#dc2626',
                  fontSize: '11px',
                }}
              >
                {success ? 'Success' : 'Failed'}
              </span>
            )}
          </div>
        );
      })}

      {collapseCompleted && allComplete && (
        <button
          onClick={() => setIsCollapsed(true)}
          style={{
            marginTop: '8px',
            padding: '4px 8px',
            fontSize: '11px',
            border: 'none',
            background: 'none',
            color: '#6b7280',
            cursor: 'pointer',
          }}
        >
          Collapse
        </button>
      )}
    </div>
  );
}

// ============================================
// TypingIndicator Component
// ============================================

export function TypingIndicator({
  isVisible,
  text = 'Thinking',
  className,
  style,
}: TypingIndicatorProps): React.ReactElement | null {
  if (!isVisible) return null;

  return (
    <div className={className} style={{ ...defaultStyles.typingIndicator, ...style }}>
      <span>{text}</span>
      <span style={{ ...defaultStyles.dot, animationDelay: '0s' }} />
      <span style={{ ...defaultStyles.dot, animationDelay: '0.2s' }} />
      <span style={{ ...defaultStyles.dot, animationDelay: '0.4s' }} />
    </div>
  );
}

// ============================================
// Additional Utility Components
// ============================================

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

/**
 * Error boundary for chat components
 */
export class ChatErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div
            style={{
              padding: '20px',
              backgroundColor: '#fef2f2',
              color: '#991b1b',
              borderRadius: '8px',
              textAlign: 'center',
            }}
          >
            <p>Something went wrong displaying the chat.</p>
            <button
              onClick={() => this.setState({ hasError: false })}
              style={{
                marginTop: '10px',
                padding: '8px 16px',
                backgroundColor: '#dc2626',
                color: '#ffffff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Try Again
            </button>
          </div>
        )
      );
    }

    return this.props.children;
  }
}

/**
 * Avatar component for messages
 */
export function Avatar({
  role,
  src,
  alt,
  size = 32,
  style,
}: {
  role: string;
  src?: string;
  alt?: string;
  size?: number;
  style?: CSSProperties;
}): React.ReactElement {
  const getDefaultIcon = () => {
    switch (role) {
      case 'user':
        return '👤';
      case 'assistant':
        return '🤖';
      case 'system':
        return '⚙️';
      case 'tool':
        return '🔧';
      default:
        return '💬';
    }
  };

  if (src) {
    return (
      <img
        src={src}
        alt={alt ?? role}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          ...style,
        }}
      />
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: '#e5e7eb',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.5,
        ...style,
      }}
    >
      {getDefaultIcon()}
    </div>
  );
}
