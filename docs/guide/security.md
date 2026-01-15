# Security

Best practices for secure AgentForge deployments.

## API Key Management

### Never Commit Keys
```typescript
// ❌ Never do this
const provider = new OpenAIProvider({
  apiKey: 'sk-1234567890abcdef',
});

// ✅ Use environment variables
const provider = new OpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY,
});
```

### Secret Managers

For production, use a secret manager:
```typescript
// AWS Secrets Manager
import { SecretsManager } from '@aws-sdk/client-secrets-manager';

const secrets = new SecretsManager();
const { SecretString } = await secrets.getSecretValue({
  SecretId: 'agentforge/openai',
});

const provider = new OpenAIProvider({
  apiKey: JSON.parse(SecretString).apiKey,
});
```

### Key Rotation

Rotate API keys regularly and implement graceful rotation:
```typescript
class RotatingProvider {
  private provider: OpenAIProvider;
  
  async refresh() {
    const newKey = await fetchLatestKey();
    this.provider = new OpenAIProvider({ apiKey: newKey });
  }
}
```

## Tool Execution Security

### Input Validation

Always validate tool inputs with strict Zod schemas:
```typescript
// ❌ Too permissive
const tool = defineTool({
  name: 'fetch',
  schema: z.object({ url: z.string() }), // Accepts any string
  execute: async ({ url }) => fetch(url),
});

// ✅ Strict validation
const tool = defineTool({
  name: 'fetch',
  schema: z.object({
    url: z.string()
      .url()
      .refine(
        (url) => ALLOWED_DOMAINS.some(d => url.includes(d)),
        'Domain not in allowlist'
      ),
  }),
  execute: async ({ url }) => fetch(url),
});
```

### SSRF Prevention

Server-Side Request Forgery is a critical risk when tools fetch URLs:
```typescript
const ALLOWED_DOMAINS = [
  'api.example.com',
  'data.example.com',
];

const BLOCKED_PATTERNS = [
  /^https?:\/\/localhost/,
  /^https?:\/\/127\./,
  /^https?:\/\/10\./,
  /^https?:\/\/192\.168\./,
  /^https?:\/\/172\.(1[6-9]|2[0-9]|3[0-1])\./,
];

function validateUrl(url: string): boolean {
  // Block internal networks
  if (BLOCKED_PATTERNS.some(p => p.test(url))) {
    return false;
  }
  
  // Only allow specific domains
  const parsed = new URL(url);
  return ALLOWED_DOMAINS.includes(parsed.hostname);
}

const safeFetchTool = defineTool({
  name: 'safe_fetch',
  schema: z.object({
    url: z.string().url().refine(validateUrl, 'URL not allowed'),
  }),
  execute: async ({ url }) => {
    // Additional runtime check
    if (!validateUrl(url)) {
      throw new Error('URL validation failed');
    }
    return fetch(url);
  },
});
```

### Command Injection

If tools execute system commands:
```typescript
// ❌ Dangerous - allows injection
const tool = defineTool({
  name: 'search_files',
  schema: z.object({ pattern: z.string() }),
  execute: async ({ pattern }) => {
    return exec(`grep -r "${pattern}" /data`); // Injection risk!
  },
});

// ✅ Safe - use parameterized execution
import { execFile } from 'child_process';

const tool = defineTool({
  name: 'search_files',
  schema: z.object({
    pattern: z.string().max(100).regex(/^[\w\s-]+$/),
  }),
  execute: async ({ pattern }) => {
    return new Promise((resolve, reject) => {
      execFile('grep', ['-r', pattern, '/data'], (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout);
      });
    });
  },
});
```

## Data Protection

### Logging Redaction

Never log sensitive data:
```typescript
import { LoggingMiddleware } from 'agentforge';

const logging = new LoggingMiddleware({
  logger: console,
  redactKeys: [
    'apiKey',
    'authorization',
    'password',
    'ssn',
    'creditCard',
    'token',
  ],
  redactPatterns: [
    /\b\d{3}-\d{2}-\d{4}\b/g,  // SSN
    /\b\d{16}\b/g,              // Credit card
    /Bearer\s+[\w-]+/g,         // Bearer tokens
  ],
});
```

### PII in Conversations

Be cautious with conversation history:
```typescript
// Implement PII detection before storing
function containsPII(text: string): boolean {
  const patterns = [
    /\b\d{3}-\d{2}-\d{4}\b/,      // SSN
    /\b\d{16}\b/,                  // Credit card
    /\b[\w.]+@[\w.]+\.\w+\b/,      // Email
  ];
  return patterns.some(p => p.test(text));
}

agent.on('message:add', ({ message }) => {
  if (containsPII(message.content)) {
    logger.warn('PII detected in conversation');
    // Optionally redact or reject
  }
});
```

### Encryption at Rest

Encrypt stored conversations:
```typescript
import { createCipheriv, createDecipheriv } from 'crypto';

class EncryptedMemory {
  private key: Buffer;
  
  encrypt(data: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(data, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString('base64');
  }
  
  decrypt(data: string): string {
    const buffer = Buffer.from(data, 'base64');
    const iv = buffer.subarray(0, 16);
    const tag = buffer.subarray(16, 32);
    const encrypted = buffer.subarray(32);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(encrypted) + decipher.final('utf8');
  }
}
```

## Rate Limiting

Protect against abuse:
```typescript
import { RateLimiter } from 'agentforge';

const limiter = new RateLimiter({
  maxRequests: 100,
  windowMs: 60000, // 1 minute
  keyGenerator: (context) => context.userId,
  onLimit: (key) => {
    logger.warn('Rate limit exceeded', { userId: key });
  },
});

const agent = new Agent({
  provider,
  middleware: [limiter],
});
```

## Audit Logging

Track all agent actions:
```typescript
agent.on('request:complete', ({ requestId, input, output, userId }) => {
  auditLog.write({
    timestamp: new Date().toISOString(),
    requestId,
    userId,
    action: 'agent_request',
    inputHash: hash(input),  // Don't log full input
    toolsCalled: output.toolCalls?.map(t => t.name),
    success: true,
  });
});

agent.on('tool:execute', ({ tool, args, result, userId }) => {
  auditLog.write({
    timestamp: new Date().toISOString(),
    userId,
    action: 'tool_execution',
    tool: tool.name,
    argsHash: hash(args),
    success: !result.error,
  });
});
```

## Security Checklist

Before deploying to production:

- [ ] API keys stored in secret manager
- [ ] Environment variables for all secrets
- [ ] Tool inputs validated with strict Zod schemas
- [ ] URL allowlists for fetch-based tools
- [ ] SSRF patterns blocked
- [ ] Sensitive data redacted from logs
- [ ] PII detection implemented
- [ ] Rate limiting configured
- [ ] Audit logging enabled
- [ ] Encryption for stored conversations
- [ ] Regular key rotation scheduled
```

---

**File paths:**
```
docs/guide/architecture.md
docs/guide/choosing-providers.md
docs/guide/error-handling.md
docs/guide/security.md
