import { describe, it, expect } from 'vitest';
import {
  AgentForgeError,
  ProviderError,
  ToolExecutionError,
  ValidationError,
  AgentExecutionError,
  ConfigurationError,
  ErrorCode,
  isAgentForgeError,
  isRetryableError,
  wrapError,
  createErrorHandler,
} from '../../src/errors';

describe('errors', () => {
  describe('AgentForgeError', () => {
    it('should create error with message and code', () => {
      const error = new AgentForgeError('Test error', ErrorCode.UNKNOWN);

      expect(error.message).toBe('Test error');
      expect(error.code).toBe(ErrorCode.UNKNOWN);
      expect(error.name).toBe('AgentForgeError');
    });

    it('should include context with timestamp and errorId', () => {
      const error = new AgentForgeError('Test', ErrorCode.UNKNOWN);

      expect(error.context.timestamp).toBeDefined();
      expect(error.context.errorId).toMatch(/^err_/);
    });

    it('should preserve cause error', () => {
      const cause = new Error('Original error');
      const error = new AgentForgeError('Wrapped', ErrorCode.UNKNOWN, { cause });

      expect(error.cause).toBe(cause);
    });

    it('should generate user-friendly message', () => {
      const error = new AgentForgeError('Technical details', ErrorCode.PROVIDER_RATE_LIMITED);
      const userMessage = error.getUserMessage();

      expect(userMessage).toContain('Too many requests');
    });

    it('should generate diagnostics string', () => {
      const error = new AgentForgeError('Test', ErrorCode.TOOL_EXECUTION_FAILED, {
        context: {
          operation: 'test_op',
          toolName: 'test_tool',
        },
      });

      const diagnostics = error.getDiagnostics();

      expect(diagnostics).toContain('Error: Test');
      expect(diagnostics).toContain('Code: TOOL_EXECUTION_FAILED');
      expect(diagnostics).toContain('Operation: test_op');
      expect(diagnostics).toContain('Tool: test_tool');
    });

    it('should serialize to JSON', () => {
      const error = new AgentForgeError('Test', ErrorCode.UNKNOWN);
      const json = error.toJSON();

      expect(json.name).toBe('AgentForgeError');
      expect(json.message).toBe('Test');
      expect(json.code).toBe(ErrorCode.UNKNOWN);
    });
  });

  describe('ProviderError', () => {
    it('should create provider-specific error', () => {
      const error = new ProviderError('API failed', 'openai', { statusCode: 500 });

      expect(error.message).toBe('API failed');
      expect(error.providerName).toBe('openai');
      expect(error.statusCode).toBe(500);
    });

    it('should be retryable for 5xx errors', () => {
      const error = new ProviderError('Server error', 'openai', { statusCode: 503 });
      expect(error.retryable).toBe(true);
    });

    it('should not be retryable for 4xx errors', () => {
      const error = new ProviderError('Bad request', 'openai', { statusCode: 400 });
      expect(error.retryable).toBe(false);
    });

    it('should create rate limited error', () => {
      const error = ProviderError.rateLimited('openai', 5000);

      expect(error.code).toBe(ErrorCode.PROVIDER_RATE_LIMITED);
      expect(error.retryable).toBe(true);
      expect(error.retryAfterMs).toBe(5000);
    });

    it('should create authentication error', () => {
      const error = ProviderError.authenticationFailed('anthropic');

      expect(error.code).toBe(ErrorCode.PROVIDER_AUTHENTICATION_FAILED);
      expect(error.retryable).toBe(false);
    });

    it('should create timeout error', () => {
      const error = ProviderError.timeout('openai', 30000);

      expect(error.message).toContain('timed out');
      expect(error.retryable).toBe(true);
    });
  });

  describe('ToolExecutionError', () => {
    it('should create tool-specific error', () => {
      const error = new ToolExecutionError('Tool failed', 'calculator');

      expect(error.toolName).toBe('calculator');
      expect(error.code).toBe(ErrorCode.TOOL_EXECUTION_FAILED);
    });

    it('should create not found error', () => {
      const error = ToolExecutionError.notFound('missing_tool');

      expect(error.code).toBe(ErrorCode.TOOL_NOT_FOUND);
      expect(error.message).toContain('not found');
    });

    it('should create validation error', () => {
      const validationError = new Error('Invalid input');
      const error = ToolExecutionError.validationFailed('my_tool', validationError);

      expect(error.code).toBe(ErrorCode.TOOL_VALIDATION_FAILED);
      expect(error.cause).toBe(validationError);
    });

    it('should create timeout error', () => {
      const error = ToolExecutionError.timeout('slow_tool', 5000);

      expect(error.code).toBe(ErrorCode.TOOL_TIMEOUT);
      expect(error.retryable).toBe(true);
    });
  });

  describe('ValidationError', () => {
    it('should create invalid field error', () => {
      const error = ValidationError.invalidField('count', 'number', 'not-a-number');

      expect(error.field).toBe('count');
      expect(error.expectedType).toBe('number');
    });

    it('should create missing required error', () => {
      const error = ValidationError.missingRequired('apiKey');

      expect(error.field).toBe('apiKey');
      expect(error.message).toContain('required');
    });

    it('should create invalid format error', () => {
      const error = ValidationError.invalidFormat('email', 'email address');

      expect(error.message).toContain('format');
    });
  });

  describe('AgentExecutionError', () => {
    it('should create max iterations error', () => {
      const error = AgentExecutionError.maxIterationsExceeded(10);

      expect(error.code).toBe(ErrorCode.AGENT_MAX_ITERATIONS);
      expect(error.iterationCount).toBe(10);
    });

    it('should create aborted error', () => {
      const error = AgentExecutionError.aborted();

      expect(error.code).toBe(ErrorCode.AGENT_ABORTED);
    });
  });

  describe('ConfigurationError', () => {
    it('should create missing API key error', () => {
      const error = ConfigurationError.missingApiKey('openai');

      expect(error.message).toContain('API key');
      expect(error.message).toContain('openai');
    });

    it('should create invalid option error', () => {
      const error = ConfigurationError.invalidOption('maxRetries', 'must be positive');

      expect(error.message).toContain('maxRetries');
    });
  });

  describe('utility functions', () => {
    describe('isAgentForgeError', () => {
      it('should return true for AgentForge errors', () => {
        const error = new AgentForgeError('Test', ErrorCode.UNKNOWN);
        expect(isAgentForgeError(error)).toBe(true);
      });

      it('should return true for subclass errors', () => {
        const error = new ProviderError('Test', 'openai');
        expect(isAgentForgeError(error)).toBe(true);
      });

      it('should return false for regular errors', () => {
        const error = new Error('Test');
        expect(isAgentForgeError(error)).toBe(false);
      });
    });

    describe('isRetryableError', () => {
      it('should return true for retryable errors', () => {
        const error = ProviderError.rateLimited('openai');
        expect(isRetryableError(error)).toBe(true);
      });

      it('should return false for non-retryable errors', () => {
        const error = ProviderError.authenticationFailed('openai');
        expect(isRetryableError(error)).toBe(false);
      });

      it('should return false for regular errors', () => {
        const error = new Error('Test');
        expect(isRetryableError(error)).toBe(false);
      });
    });

    describe('wrapError', () => {
      it('should return same error if already AgentForge error', () => {
        const error = new AgentForgeError('Test', ErrorCode.UNKNOWN);
        const wrapped = wrapError(error);
        expect(wrapped).toBe(error);
      });

      it('should wrap regular Error', () => {
        const error = new Error('Regular error');
        const wrapped = wrapError(error);

        expect(isAgentForgeError(wrapped)).toBe(true);
        expect(wrapped.message).toBe('Regular error');
        expect(wrapped.cause).toBe(error);
      });

      it('should wrap string', () => {
        const wrapped = wrapError('String error');
        expect(wrapped.message).toBe('String error');
      });
    });

    describe('createErrorHandler', () => {
      it('should create handler that wraps errors', () => {
        const handler = createErrorHandler({ rethrow: false });
        const result = handler(new Error('Test'));

        expect(isAgentForgeError(result)).toBe(true);
      });

      it('should call onError callback', () => {
        let capturedError: AgentForgeError | null = null;
        const handler = createErrorHandler({
          rethrow: false,
          onError: (e) => { capturedError = e; },
        });

        handler(new Error('Test'));
        expect(capturedError).not.toBeNull();
      });

      it('should rethrow by default', () => {
        const handler = createErrorHandler();
        expect(() => handler(new Error('Test'))).toThrow();
      });
    });
  });
});
