import { describe, it, expect, vi } from 'vitest';
import { EventEmitter, waitForEvent } from '../../src/events';

describe('EventEmitter', () => {
  describe('on/emit', () => {
    it('should subscribe and receive events', async () => {
      const emitter = new EventEmitter();
      const listener = vi.fn();

      emitter.on('request:start', listener);
      await emitter.emit('request:start', { messages: [], timestamp: Date.now() });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ messages: [] }));
    });

    it('should support multiple listeners', async () => {
      const emitter = new EventEmitter();
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      emitter.on('request:start', listener1);
      emitter.on('request:start', listener2);
      await emitter.emit('request:start', { messages: [], timestamp: Date.now() });

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it('should return unsubscribe function', async () => {
      const emitter = new EventEmitter();
      const listener = vi.fn();

      const unsubscribe = emitter.on('request:start', listener);
      unsubscribe();
      await emitter.emit('request:start', { messages: [], timestamp: Date.now() });

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('once', () => {
    it('should only fire once', async () => {
      const emitter = new EventEmitter();
      const listener = vi.fn();

      emitter.once('request:start', listener);
      await emitter.emit('request:start', { messages: [], timestamp: Date.now() });
      await emitter.emit('request:start', { messages: [], timestamp: Date.now() });

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('off', () => {
    it('should remove listener', async () => {
      const emitter = new EventEmitter();
      const listener = vi.fn();

      emitter.on('request:start', listener);
      emitter.off('request:start', listener);
      await emitter.emit('request:start', { messages: [], timestamp: Date.now() });

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('removeAllListeners', () => {
    it('should remove all listeners for event', async () => {
      const emitter = new EventEmitter();
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      emitter.on('request:start', listener1);
      emitter.on('request:start', listener2);
      emitter.removeAllListeners('request:start');
      await emitter.emit('request:start', { messages: [], timestamp: Date.now() });

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();
    });

    it('should remove all listeners when no event specified', async () => {
      const emitter = new EventEmitter();
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      emitter.on('request:start', listener1);
      emitter.on('request:end', listener2);
      emitter.removeAllListeners();
      await emitter.emit('request:start', { messages: [], timestamp: Date.now() });
      await emitter.emit('request:end', { 
        response: { id: '1', content: '', finishReason: 'stop' }, 
        durationMs: 100, 
        timestamp: Date.now() 
      });

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();
    });
  });

  describe('listenerCount', () => {
    it('should return correct count', () => {
      const emitter = new EventEmitter();

      expect(emitter.listenerCount('request:start')).toBe(0);

      emitter.on('request:start', () => {});
      expect(emitter.listenerCount('request:start')).toBe(1);

      emitter.on('request:start', () => {});
      expect(emitter.listenerCount('request:start')).toBe(2);

      emitter.once('request:start', () => {});
      expect(emitter.listenerCount('request:start')).toBe(3);
    });
  });

  describe('eventNames', () => {
    it('should return event names with listeners', () => {
      const emitter = new EventEmitter();

      emitter.on('request:start', () => {});
      emitter.on('request:end', () => {});
      emitter.once('tool:start', () => {});

      const names = emitter.eventNames();

      expect(names).toContain('request:start');
      expect(names).toContain('request:end');
      expect(names).toContain('tool:start');
    });
  });

  describe('error handling', () => {
    it('should not throw when listener throws', async () => {
      const emitter = new EventEmitter();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      emitter.on('request:start', () => {
        throw new Error('Listener error');
      });

      await expect(
        emitter.emit('request:start', { messages: [], timestamp: Date.now() })
      ).resolves.not.toThrow();

      consoleSpy.mockRestore();
    });
  });
});

describe('waitForEvent', () => {
  it('should resolve when event is emitted', async () => {
    const emitter = new EventEmitter();

    const promise = waitForEvent(emitter, 'request:start');
    emitter.emit('request:start', { messages: [], timestamp: 123 });

    const result = await promise;
    expect(result.timestamp).toBe(123);
  });

  it('should timeout if event not emitted', async () => {
    const emitter = new EventEmitter();

    await expect(
      waitForEvent(emitter, 'request:start', 50)
    ).rejects.toThrow(/Timeout/);
  });
});
