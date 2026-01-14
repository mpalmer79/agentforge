[streaming.md](https://github.com/user-attachments/files/24618651/streaming.md)
# Streaming

Stream responses token-by-token for responsive UIs that show content as it generates.

## Basic Streaming

Use `agent.stream()` instead of `agent.run()`:

```typescript
for await (const event of agent.stream('Tell me a story')) {
  switch (event.type) {
    case 'content':
      // Token received
      process.stdout.write(event.data as string);
      break;
      
    case 'tool_call':
      // Tool is being called
      console.log('Calling tool:', event.data);
      break;
      
    case 'tool_result':
      // Tool completed
      console.log('Tool result:', event.data);
      break;
      
    case 'done':
      // Stream complete
      console.log('\nDone!');
      break;
  }
}
```

## Stream Events

| Event Type | Data | When |
|------------|------|------|
| `content` | `string` | New token received |
| `tool_call` | `ToolCall` | Tool execution starting |
| `tool_result` | `ToolResult` | Tool execution complete |
| `done` | `{ content: string }` | Stream finished |

## Collecting Full Response

Build the complete response while streaming:

```typescript
let fullContent = '';
const toolResults: ToolResult[] = [];

for await (const event of agent.stream('Hello')) {
  if (event.type === 'content') {
    fullContent += event.data;
    updateUI(fullContent); // Update as we go
  }
  
  if (event.type === 'tool_result') {
    toolResults.push(event.data as ToolResult);
  }
}

console.log('Final content:', fullContent);
console.log('Tools used:', toolResults.length);
```

## Abort Streaming

Cancel a stream with AbortController:

```typescript
const controller = new AbortController();

// Cancel after 5 seconds
setTimeout(() => controller.abort(), 5000);

try {
  for await (const event of agent.stream('Long response...', {
    signal: controller.signal,
  })) {
    console.log(event);
  }
} catch (error) {
  if (error.message.includes('aborted')) {
    console.log('Stream was cancelled');
  }
}
```

## React Integration

### useStreamingAgent Hook

```tsx
import { useStreamingAgent, OpenAIProvider } from 'agentforge/react';

function Chat() {
  const {
    messages,
    streamingContent,  // Current streaming content
    isStreaming,
    sendMessage,
    abort,
  } = useStreamingAgent({
    provider: new OpenAIProvider({ apiKey: '...' }),
    onToken: (token) => {
      // Called for each token
    },
    onComplete: (content) => {
      // Called when stream finishes
    },
  });

  return (
    <div>
      {messages.map(m => (
        <Message key={m.id} content={m.content} />
      ))}
      
      {isStreaming && (
        <Message content={streamingContent} isStreaming />
      )}
      
      <button onClick={() => sendMessage('Hello!')}>
        Send
      </button>
      
      {isStreaming && (
        <button onClick={abort}>Stop</button>
      )}
    </div>
  );
}
```

### Manual Streaming in React

```tsx
function Chat() {
  const [content, setContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const handleSend = async (message: string) => {
    setIsStreaming(true);
    setContent('');
    
    abortRef.current = new AbortController();

    try {
      for await (const event of agent.stream(message, {
        signal: abortRef.current.signal,
      })) {
        if (event.type === 'content') {
          setContent(prev => prev + event.data);
        }
      }
    } finally {
      setIsStreaming(false);
    }
  };

  const handleAbort = () => {
    abortRef.current?.abort();
  };

  return (
    <div>
      <div>{content}</div>
      {isStreaming && <button onClick={handleAbort}>Stop</button>}
    </div>
  );
}
```

## Server-Sent Events (SSE)

Stream to a web client using SSE:

```typescript
// Express.js example
app.get('/chat/stream', async (req, res) => {
  const { message } = req.query;
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  for await (const event of agent.stream(message as string)) {
    if (event.type === 'content') {
      res.write(`data: ${JSON.stringify({ content: event.data })}\n\n`);
    }
    
    if (event.type === 'done') {
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    }
  }

  res.end();
});
```

Client-side:

```javascript
const eventSource = new EventSource(`/chat/stream?message=${encodeURIComponent(message)}`);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.done) {
    eventSource.close();
    return;
  }
  
  appendContent(data.content);
};
```

## Streaming with Tools

Tools execute between streaming chunks:

```typescript
for await (const event of agent.stream('What is 42 * 17?')) {
  switch (event.type) {
    case 'content':
      // "Let me calculate that..."
      console.log(event.data);
      break;
      
    case 'tool_call':
      // { name: 'calculator', arguments: { a: 42, b: 17, op: 'multiply' } }
      console.log('Using calculator...');
      break;
      
    case 'tool_result':
      // { result: 714 }
      console.log('Got result');
      break;
      
    case 'content':
      // "42 multiplied by 17 equals 714."
      console.log(event.data);
      break;
  }
}
```

## Error Handling in Streams

```typescript
try {
  for await (const event of agent.stream('Hello')) {
    // Handle events
  }
} catch (error) {
  if (error instanceof ProviderError) {
    if (error.code === 'PROVIDER_RATE_LIMITED') {
      console.log('Rate limited, please wait...');
    }
  }
}
```

## Performance Tips

### 1. Debounce UI Updates

```typescript
let buffer = '';
let timeout: NodeJS.Timeout;

for await (const event of agent.stream(message)) {
  if (event.type === 'content') {
    buffer += event.data;
    
    // Update UI at most every 50ms
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      setContent(buffer);
    }, 50);
  }
}

// Final update
setContent(buffer);
```

### 2. Use requestAnimationFrame

```typescript
let buffer = '';
let rafId: number;

for await (const event of agent.stream(message)) {
  if (event.type === 'content') {
    buffer += event.data;
    
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      setContent(buffer);
    });
  }
}
```

## Next Steps

- **[Error Handling](/guide/error-handling)** — Handle stream errors
- **[React Integration](/guide/react-integration)** — Full React guide
- **[Examples](/examples/customer-support)** — Real-world streaming
