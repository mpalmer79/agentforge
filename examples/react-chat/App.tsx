/**
 * React Chat Example
 *
 * A complete chat interface using AgentForge React hooks.
 * This can be used as a starting point for building AI chat UIs.
 */

import React, { useState, useRef, useEffect } from 'react';
import { useAgent, AgentProvider } from '../../src/react';
import { OpenAIProvider, defineTool } from '../../src';
import { z } from 'zod';

// Define tools for the chat agent
const timeTool = defineTool({
  name: 'get_current_time',
  description: 'Get the current date and time',
  parameters: z.object({
    timezone: z.string().optional().describe('Timezone (e.g., "America/New_York")'),
  }),
  execute: async ({ timezone }) => {
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      dateStyle: 'full',
      timeStyle: 'long',
      timeZone: timezone || 'UTC',
    };
    return {
      formatted: now.toLocaleString('en-US', options),
      iso: now.toISOString(),
      timezone: timezone || 'UTC',
    };
  },
});

const randomNumberTool = defineTool({
  name: 'random_number',
  description: 'Generate a random number within a range',
  parameters: z.object({
    min: z.number().describe('Minimum value'),
    max: z.number().describe('Maximum value'),
  }),
  execute: async ({ min, max }) => {
    const result = Math.floor(Math.random() * (max - min + 1)) + min;
    return { min, max, result };
  },
});

// Message component
interface MessageProps {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
}

function Message({ role, content, timestamp }: MessageProps) {
  const isUser = role === 'user';

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        marginBottom: '12px',
      }}
    >
      <div
        style={{
          maxWidth: '70%',
          padding: '12px 16px',
          borderRadius: '16px',
          backgroundColor: isUser ? '#007AFF' : '#E9E9EB',
          color: isUser ? 'white' : 'black',
        }}
      >
        <div style={{ fontSize: '14px', lineHeight: '1.4' }}>{content}</div>
        <div
          style={{
            fontSize: '10px',
            opacity: 0.7,
            marginTop: '4px',
            textAlign: 'right',
          }}
        >
          {new Date(timestamp).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}

// Loading indicator
function TypingIndicator() {
  return (
    <div style={{ display: 'flex', gap: '4px', padding: '12px' }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: '#999',
            animation: `bounce 1.4s infinite ease-in-out both`,
            animationDelay: `${i * 0.16}s`,
          }}
        />
      ))}
    </div>
  );
}

// Main chat component
function ChatInterface() {
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, isLoading, error, sendMessage, reset } = useAgent({
    provider: new OpenAIProvider({
      apiKey: import.meta.env.VITE_OPENAI_API_KEY || '',
    }),
    tools: [timeTool, randomNumberTool],
    systemPrompt: `You are a friendly and helpful assistant. You have access to tools for getting the current time and generating random numbers. Be concise and conversational.`,
    onError: (err) => console.error('Agent error:', err),
    onToolCall: (name, args) => console.log('Tool called:', name, args),
  });

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const message = inputValue;
    setInputValue('');
    await sendMessage(message);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        maxWidth: '600px',
        margin: '0 auto',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px',
          borderBottom: '1px solid #E5E5E5',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
            🤖 AgentForge Chat
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#666' }}>
            Powered by AgentForge
          </p>
        </div>
        <button
          onClick={reset}
          style={{
            padding: '8px 12px',
            borderRadius: '8px',
            border: '1px solid #DDD',
            background: 'white',
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          Clear Chat
        </button>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
        }}
      >
        {messages.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              color: '#999',
              marginTop: '40px',
            }}
          >
            <p style={{ fontSize: '32px', marginBottom: '8px' }}>👋</p>
            <p>Send a message to start chatting!</p>
            <p style={{ fontSize: '12px', marginTop: '8px' }}>
              Try: "What time is it?" or "Give me a random number between 1 and 100"
            </p>
          </div>
        ) : (
          messages
            .filter((m) => m.role !== 'system' && m.role !== 'tool')
            .map((message) => (
              <Message
                key={message.id}
                role={message.role as MessageProps['role']}
                content={message.content}
                timestamp={message.timestamp}
              />
            ))
        )}

        {isLoading && <TypingIndicator />}

        {error && (
          <div
            style={{
              padding: '12px',
              backgroundColor: '#FEE',
              borderRadius: '8px',
              color: '#C00',
              fontSize: '14px',
            }}
          >
            Error: {error.message}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        style={{
          padding: '16px',
          borderTop: '1px solid #E5E5E5',
          display: 'flex',
          gap: '8px',
        }}
      >
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Type a message..."
          disabled={isLoading}
          style={{
            flex: 1,
            padding: '12px 16px',
            borderRadius: '24px',
            border: '1px solid #DDD',
            fontSize: '14px',
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={isLoading || !inputValue.trim()}
          style={{
            padding: '12px 24px',
            borderRadius: '24px',
            border: 'none',
            backgroundColor: isLoading || !inputValue.trim() ? '#CCC' : '#007AFF',
            color: 'white',
            fontWeight: 600,
            cursor: isLoading || !inputValue.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          Send
        </button>
      </form>
    </div>
  );
}

// App wrapper
export default function App() {
  return <ChatInterface />;
}
