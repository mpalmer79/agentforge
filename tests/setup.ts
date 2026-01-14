import { beforeAll, afterAll, afterEach, vi } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Reset mocks between tests
afterEach(() => {
  vi.clearAllMocks();
  mockFetch.mockReset();
});

// Mock console methods to reduce noise in tests
beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(() => {
  vi.restoreAllMocks();
});

// Helper to mock successful fetch response
export function mockFetchResponse(data: unknown, status = 200) {
  mockFetch.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  });
}

// Helper to mock streaming response
export function mockStreamingResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  let chunkIndex = 0;

  const stream = new ReadableStream({
    pull(controller) {
      if (chunkIndex < chunks.length) {
        controller.enqueue(encoder.encode(`data: ${chunks[chunkIndex]}\n\n`));
        chunkIndex++;
      } else {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }
    },
  });

  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    body: stream,
  });
}

// Helper to mock fetch error
export function mockFetchError(message: string, status = 500) {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    text: async () => message,
    json: async () => ({ error: message }),
  });
}

// Export mock for direct access
export { mockFetch };
