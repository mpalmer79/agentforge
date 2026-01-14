[react-integration.md](https://github.com/user-attachments/files/24618640/react-integration.md)
# React Integration

AgentForge provides first-class React support with hooks and context providers.

## Installation

The React components are included in the main package:

```bash
npm install agentforge zod
```

## Quick Start

```tsx
import { useAgent, OpenAIProvider } from 'agentforge/react';

const provider = new OpenAIProvider({ 
  apiKey: process.env.REACT_APP_OPENAI_API_KEY! 
});

function Chat() {
  const { messages, sendMessage, isLoading } = useAgent({ provider });

  return (
    <div>
      {messages.map(m => (
        <div key={m.id} className={m.role}>
          {m.content}
        </div>
      ))}
      
      <button 
        onClick={() => sendMessage('Hello!')}
        disabled={isLoading}
      >
        {isLoading ? 'Thinking...' : 'Send'}
      </button>
    </div>
  );
}
```

## Hooks

### useAgent

Full-featured hook for agent interactions:

```tsx
const {
  messages,      // Message[] - conversation history
  isLoading,     // boolean - request in progress
  error,         // Error | null - last error
  sendMessage,   // (message: string) => Promise<void>
  reset,         // () => void - clear conversation
  abort,         // () => void - cancel current request
} = useAgent({
  provider,                  // Required: LLM provider
  tools: [myTool],           // Optional: available tools
  systemPrompt: 'You are...', // Optional: system message
  middleware: [logger],      // Optional: middleware
  memory: { maxMessages: 50 }, // Optional: memory config
  onError: (error) => {},    // Optional: error callback
  onToolCall: (name, args) => {}, // Optional: tool callback
  onResponse: (response) => {}, // Optional: response callback
});
```

### useChat

Simplified hook for basic chat UIs:

```tsx
const {
  messages,
  input,          // string - current input value
  setInput,       // (value: string) => void
  handleSubmit,   // (e: FormEvent) => void
  isLoading,
  reload,         // () => void - resend last message
  stop,           // () => void - abort current request
} = useChat({
  provider,
  systemPrompt: 'You are a helpful assistant.',
});

return (
  <form onSubmit={handleSubmit}>
    <input 
      value={input} 
      onChange={(e) => setInput(e.target.value)}
      placeholder="Type a message..."
    />
    <button type="submit" disabled={isLoading}>
      Send
    </button>
  </form>
);
```

### useStreamingAgent

Hook with streaming support:

```tsx
const {
  messages,
  streamingContent,  // string - content being streamed
  isStreaming,       // boolean - streaming in progress
  sendMessage,
  abort,
} = useStreamingAgent({
  provider,
  tools: [myTool],
  onToken: (token) => {
    // Called for each token
    console.log('Token:', token);
  },
  onComplete: (content) => {
    // Called when streaming finishes
    console.log('Complete:', content);
  },
});

return (
  <div>
    {messages.map(m => <Message key={m.id} {...m} />)}
    
    {isStreaming && (
      <div className="streaming">
        {streamingContent}
        <span className="cursor">▊</span>
      </div>
    )}
  </div>
);
```

## Context Provider

Share configuration across components:

```tsx
import { AgentProvider, useAgentContext } from 'agentforge/react';

// Root component
function App() {
  return (
    <AgentProvider
      provider={new OpenAIProvider({ apiKey: '...' })}
      tools={[searchTool, calculatorTool]}
      systemPrompt="You are a helpful assistant."
    >
      <Chat />
      <Sidebar />
    </AgentProvider>
  );
}

// Child component
function Chat() {
  const { provider, tools, systemPrompt } = useAgentContext();
  
  const { messages, sendMessage } = useAgent({
    provider,
    tools,
    systemPrompt,
  });

  // ...
}
```

## Complete Chat Example

```tsx
import { useState } from 'react';
import { useAgent, OpenAIProvider, defineTool } from 'agentforge/react';
import { z } from 'zod';

const provider = new OpenAIProvider({ 
  apiKey: process.env.REACT_APP_OPENAI_API_KEY! 
});

const weatherTool = defineTool({
  name: 'get_weather',
  description: 'Get weather for a city',
  parameters: z.object({
    city: z.string(),
  }),
  execute: async ({ city }) => {
    // Mock implementation
    return { city, temp: 72, condition: 'sunny' };
  },
});

function ChatApp() {
  const [input, setInput] = useState('');
  
  const { 
    messages, 
    sendMessage, 
    isLoading, 
    error,
    reset 
  } = useAgent({
    provider,
    tools: [weatherTool],
    systemPrompt: 'You are a helpful assistant with weather data access.',
    onToolCall: (name, args) => {
      console.log(`Tool called: ${name}`, args);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    
    const message = input;
    setInput('');
    await sendMessage(message);
  };

  return (
    <div className="chat-container">
      <header>
        <h1>AI Assistant</h1>
        <button onClick={reset}>New Chat</button>
      </header>

      <div className="messages">
        {messages
          .filter(m => m.role !== 'system')
          .map(m => (
            <div key={m.id} className={`message ${m.role}`}>
              <div className="avatar">
                {m.role === 'user' ? '👤' : '🤖'}
              </div>
              <div className="content">{m.content}</div>
            </div>
          ))}
        
        {isLoading && (
          <div className="message assistant loading">
            <div className="avatar">🤖</div>
            <div className="content">Thinking...</div>
          </div>
        )}
      </div>

      {error && (
        <div className="error">
          Error: {error.message}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask me anything..."
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}

export default ChatApp;
```

## Styling Example

```css
.chat-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  max-width: 800px;
  margin: 0 auto;
}

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid #e5e7eb;
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
}

.message {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1rem;
  animation: fadeIn 0.3s ease;
}

.message.user {
  flex-direction: row-reverse;
}

.message .avatar {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
}

.message .content {
  padding: 0.75rem 1rem;
  border-radius: 12px;
  max-width: 70%;
}

.message.user .content {
  background: #6366f1;
  color: white;
}

.message.assistant .content {
  background: #f3f4f6;
  color: #111827;
}

.message.loading .content {
  color: #9ca3af;
}

.error {
  padding: 0.75rem 1rem;
  background: #fef2f2;
  color: #dc2626;
  margin: 0 1rem;
  border-radius: 8px;
}

form {
  display: flex;
  gap: 0.5rem;
  padding: 1rem;
  border-top: 1px solid #e5e7eb;
}

form input {
  flex: 1;
  padding: 0.75rem 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 1rem;
}

form button {
  padding: 0.75rem 1.5rem;
  background: #6366f1;
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 500;
  cursor: pointer;
}

form button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
```

## TypeScript Types

```typescript
import type { Message, AgentResponse, Tool } from 'agentforge';

interface ChatProps {
  initialMessages?: Message[];
  onResponse?: (response: AgentResponse) => void;
}

function Chat({ initialMessages, onResponse }: ChatProps) {
  // ...
}
```

## Next Steps

- **[Streaming](/guide/streaming)** — Real-time streaming in React
- **[Examples](/examples/customer-support)** — Full chat implementations
- **[Plugins & Events](/guide/plugins-events)** — React event integration
