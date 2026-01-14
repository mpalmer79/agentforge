# Contributing to AgentForge

Thank you for your interest in contributing to AgentForge! This document provides guidelines and information for contributors.

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- npm, yarn, or pnpm
- Git

### Setup

1. Fork the repository
2. Clone your fork:
```bash
   git clone https://github.com/YOUR_USERNAME/agentforge.git
   cd agentforge
```
3. Install dependencies:
```bash
   npm install
```
4. Create a branch:
```bash
   git checkout -b feature/your-feature-name
```

## 📁 Project Structure
```
agentforge/
├── src/
│   ├── index.ts          # Main exports
│   ├── agent.ts          # Agent class
│   ├── tool.ts           # Tool definitions
│   ├── middleware.ts     # Middleware system
│   ├── types.ts          # TypeScript types
│   ├── utils.ts          # Utility functions
│   ├── providers/        # LLM providers
│   │   ├── base.ts
│   │   ├── openai.ts
│   │   └── anthropic.ts
│   └── react/            # React integration
│       ├── context.tsx
│       ├── useAgent.ts
│       ├── useChat.ts
│       └── useStreamingAgent.ts
├── examples/             # Example implementations
├── tests/                # Test files
└── docs/                 # Documentation
```

## 🛠️ Development

### Building
```bash
npm run build
```

### Testing
```bash
npm test                 # Run all tests
npm run test:coverage    # Run with coverage
```

### Linting
```bash
npm run lint
```

### Type Checking
```bash
npx tsc --noEmit
```

## 📝 Coding Standards

### TypeScript

- Use strict TypeScript settings
- Provide explicit types for function parameters and return values
- Use interfaces for object shapes
- Prefer `unknown` over `any`

### Code Style

- Use 2-space indentation
- Use single quotes for strings
- Add trailing commas in multi-line structures
- Write descriptive variable and function names

### Documentation

- Add JSDoc comments for public APIs
- Include usage examples in comments
- Update README when adding features

## 🔄 Pull Request Process

### Before Submitting

1. Ensure all tests pass
2. Update documentation if needed
3. Add tests for new features
4. Run linting and fix issues

### PR Guidelines

- Use descriptive PR titles
- Reference related issues
- Provide a clear description of changes
- Keep PRs focused and reasonably sized

### PR Title Format
```
type(scope): description

Examples:
feat(agent): add streaming support
fix(provider): handle rate limit errors
docs(readme): update installation instructions
test(middleware): add cache middleware tests
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `test`: Tests
- `refactor`: Code refactoring
- `chore`: Maintenance tasks

## 🧪 Testing Guidelines

### Writing Tests
```typescript
import { describe, it, expect, vi } from 'vitest';
import { Agent, defineTool } from '../src';

describe('Agent', () => {
  it('should execute tools correctly', async () => {
    const mockTool = defineTool({
      name: 'test_tool',
      description: 'A test tool',
      parameters: z.object({ input: z.string() }),
      execute: vi.fn().mockResolvedValue({ result: 'success' }),
    });

    const agent = new Agent({
      provider: mockProvider,
      tools: [mockTool],
    });

    const response = await agent.run('test input');
    expect(response.content).toBeDefined();
  });
});
```

### Test Categories

- **Unit Tests**: Test individual functions and classes
- **Integration Tests**: Test component interactions
- **E2E Tests**: Test complete workflows (with mocked APIs)

## 🐛 Reporting Issues

### Bug Reports

Include:
- Clear description of the bug
- Steps to reproduce
- Expected vs actual behavior
- Environment details (Node version, OS, etc.)
- Relevant code snippets

### Feature Requests

Include:
- Clear description of the feature
- Use case and motivation
- Proposed API design (if applicable)
- Any relevant examples

## 📜 Code of Conduct

### Our Standards

- Be respectful and inclusive
- Welcome newcomers
- Accept constructive criticism
- Focus on what's best for the community

### Unacceptable Behavior

- Harassment or discrimination
- Trolling or insulting comments
- Personal or political attacks
- Publishing others' private information

## 📄 License

By contributing, you agree that your contributions will be licensed under the MIT License.

## 🙏 Recognition

Contributors will be recognized in:
- The README contributors section
- Release notes for significant contributions
- The project's GitHub contributors page

---

Thank you for contributing to AgentForge! Your efforts help make AI development more accessible to everyone.
