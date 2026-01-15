/**
 * Persistence layer for conversation history and agent state
 *
 * Provides pluggable storage backends with support for:
 * - In-memory storage (default, for development)
 * - File-based storage
 * - Custom adapters (Redis, PostgreSQL, etc.)
 */

import type { Message, ToolResult } from './types';
import { generateId } from './utils';

// ============================================
// Types
// ============================================

export interface Conversation {
  id: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
  metadata: ConversationMetadata;
}

export interface ConversationMetadata {
  title?: string;
  systemPrompt?: string;
  model?: string;
  provider?: string;
  tags?: string[];
  totalTokens?: number;
  messageCount: number;
  toolCallCount: number;
  custom?: Record<string, unknown>;
}

export interface ConversationSummary {
  id: string;
  title?: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  preview: string;
}

export interface SearchOptions {
  query?: string;
  tags?: string[];
  startDate?: number;
  endDate?: number;
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
}

export interface StorageStats {
  conversationCount: number;
  totalMessages: number;
  totalTokens: number;
  oldestConversation?: number;
  newestConversation?: number;
}

// ============================================
// Storage Adapter Interface
// ============================================

export interface StorageAdapter {
  /** Initialize the storage (create tables, etc.) */
  initialize(): Promise<void>;

  /** Close connections and cleanup */
  close(): Promise<void>;

  /** Save a conversation */
  save(conversation: Conversation): Promise<void>;

  /** Get a conversation by ID */
  get(id: string): Promise<Conversation | null>;

  /** Delete a conversation */
  delete(id: string): Promise<boolean>;

  /** List conversations with pagination */
  list(options?: SearchOptions): Promise<ConversationSummary[]>;

  /** Search conversations */
  search(options: SearchOptions): Promise<ConversationSummary[]>;

  /** Get storage statistics */
  getStats(): Promise<StorageStats>;

  /** Clear all data (use with caution) */
  clear(): Promise<void>;
}

// ============================================
// In-Memory Storage Adapter
// ============================================

export class MemoryStorageAdapter implements StorageAdapter {
  private conversations: Map<string, Conversation> = new Map();

  async initialize(): Promise<void> {
    // No initialization needed for in-memory storage
  }

  async close(): Promise<void> {
    this.conversations.clear();
  }

  async save(conversation: Conversation): Promise<void> {
    this.conversations.set(conversation.id, {
      ...conversation,
      updatedAt: Date.now(),
    });
  }

  async get(id: string): Promise<Conversation | null> {
    return this.conversations.get(id) ?? null;
  }

  async delete(id: string): Promise<boolean> {
    return this.conversations.delete(id);
  }

  async list(options: SearchOptions = {}): Promise<ConversationSummary[]> {
    const { limit = 50, offset = 0, sortBy = 'updatedAt', sortOrder = 'desc' } = options;

    let results = Array.from(this.conversations.values());

    // Sort
    results.sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
    });

    // Paginate
    results = results.slice(offset, offset + limit);

    return results.map(this.toSummary);
  }

  async search(options: SearchOptions): Promise<ConversationSummary[]> {
    const { query, tags, startDate, endDate, limit = 50, offset = 0 } = options;

    let results = Array.from(this.conversations.values());

    // Filter by query
    if (query) {
      const lowerQuery = query.toLowerCase();
      results = results.filter(
        (c) =>
          c.metadata.title?.toLowerCase().includes(lowerQuery) ||
          c.messages.some((m) => m.content.toLowerCase().includes(lowerQuery))
      );
    }

    // Filter by tags
    if (tags && tags.length > 0) {
      results = results.filter((c) => tags.some((tag) => c.metadata.tags?.includes(tag)));
    }

    // Filter by date range
    if (startDate) {
      results = results.filter((c) => c.createdAt >= startDate);
    }
    if (endDate) {
      results = results.filter((c) => c.createdAt <= endDate);
    }

    // Sort by relevance (updatedAt for now)
    results.sort((a, b) => b.updatedAt - a.updatedAt);

    // Paginate
    results = results.slice(offset, offset + limit);

    return results.map(this.toSummary);
  }

  async getStats(): Promise<StorageStats> {
    const conversations = Array.from(this.conversations.values());

    return {
      conversationCount: conversations.length,
      totalMessages: conversations.reduce((sum, c) => sum + c.messages.length, 0),
      totalTokens: conversations.reduce((sum, c) => sum + (c.metadata.totalTokens ?? 0), 0),
      oldestConversation:
        conversations.length > 0 ? Math.min(...conversations.map((c) => c.createdAt)) : undefined,
      newestConversation:
        conversations.length > 0 ? Math.max(...conversations.map((c) => c.createdAt)) : undefined,
    };
  }

  async clear(): Promise<void> {
    this.conversations.clear();
  }

  private toSummary(conversation: Conversation): ConversationSummary {
    const lastUserMessage = [...conversation.messages].reverse().find((m) => m.role === 'user');

    return {
      id: conversation.id,
      title: conversation.metadata.title,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      messageCount: conversation.messages.length,
      preview: lastUserMessage?.content.substring(0, 100) ?? '',
    };
  }
}

// ============================================
// File Storage Adapter
// ============================================

export class FileStorageAdapter implements StorageAdapter {
  private basePath: string;
  private index: Map<string, { updatedAt: number; title?: string }> = new Map();
  private fs: typeof import('fs/promises') | null = null;
  private path: typeof import('path') | null = null;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  async initialize(): Promise<void> {
    // Dynamic import for Node.js fs module
    this.fs = await import('fs/promises');
    this.path = await import('path');

    // Ensure directory exists
    await this.fs.mkdir(this.basePath, { recursive: true });

    // Load index
    await this.loadIndex();
  }

  async close(): Promise<void> {
    await this.saveIndex();
  }

  async save(conversation: Conversation): Promise<void> {
    if (!this.fs || !this.path) throw new Error('Storage not initialized');

    const filePath = this.path.join(this.basePath, `${conversation.id}.json`);
    const data = {
      ...conversation,
      updatedAt: Date.now(),
    };

    await this.fs.writeFile(filePath, JSON.stringify(data, null, 2));

    // Update index
    this.index.set(conversation.id, {
      updatedAt: data.updatedAt,
      title: conversation.metadata.title,
    });
    await this.saveIndex();
  }

  async get(id: string): Promise<Conversation | null> {
    if (!this.fs || !this.path) throw new Error('Storage not initialized');

    try {
      const filePath = this.path.join(this.basePath, `${id}.json`);
      const data = await this.fs.readFile(filePath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  async delete(id: string): Promise<boolean> {
    if (!this.fs || !this.path) throw new Error('Storage not initialized');

    try {
      const filePath = this.path.join(this.basePath, `${id}.json`);
      await this.fs.unlink(filePath);
      this.index.delete(id);
      await this.saveIndex();
      return true;
    } catch {
      return false;
    }
  }

  async list(options: SearchOptions = {}): Promise<ConversationSummary[]> {
    const { limit = 50, offset = 0, sortOrder = 'desc' } = options;

    const entries = Array.from(this.index.entries())
      .map(([id, meta]) => ({ id, ...meta }))
      .sort((a, b) =>
        sortOrder === 'desc' ? b.updatedAt - a.updatedAt : a.updatedAt - b.updatedAt
      )
      .slice(offset, offset + limit);

    const summaries: ConversationSummary[] = [];

    for (const entry of entries) {
      const conversation = await this.get(entry.id);
      if (conversation) {
        summaries.push({
          id: conversation.id,
          title: conversation.metadata.title,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt,
          messageCount: conversation.messages.length,
          preview:
            conversation.messages.find((m) => m.role === 'user')?.content.substring(0, 100) ?? '',
        });
      }
    }

    return summaries;
  }

  async search(options: SearchOptions): Promise<ConversationSummary[]> {
    // For file storage, we need to load conversations to search
    // This is not efficient for large datasets
    const all = await this.list({ limit: 1000 });

    if (!options.query) return all.slice(0, options.limit ?? 50);

    const query = options.query.toLowerCase();
    return all
      .filter(
        (s) => s.title?.toLowerCase().includes(query) || s.preview.toLowerCase().includes(query)
      )
      .slice(0, options.limit ?? 50);
  }

  async getStats(): Promise<StorageStats> {
    const conversations = await this.list({ limit: 10000 });

    return {
      conversationCount: conversations.length,
      totalMessages: conversations.reduce((sum, c) => sum + c.messageCount, 0),
      totalTokens: 0, // Would need to load all conversations
      oldestConversation:
        conversations.length > 0 ? Math.min(...conversations.map((c) => c.createdAt)) : undefined,
      newestConversation:
        conversations.length > 0 ? Math.max(...conversations.map((c) => c.createdAt)) : undefined,
    };
  }

  async clear(): Promise<void> {
    if (!this.fs || !this.path) throw new Error('Storage not initialized');

    for (const id of this.index.keys()) {
      const filePath = this.path.join(this.basePath, `${id}.json`);
      try {
        await this.fs.unlink(filePath);
      } catch {
        // Ignore errors
      }
    }

    this.index.clear();
    await this.saveIndex();
  }

  private async loadIndex(): Promise<void> {
    if (!this.fs || !this.path) return;

    try {
      const indexPath = this.path.join(this.basePath, '_index.json');
      const data = await this.fs.readFile(indexPath, 'utf-8');
      const parsed = JSON.parse(data);
      this.index = new Map(Object.entries(parsed));
    } catch {
      this.index = new Map();
    }
  }

  private async saveIndex(): Promise<void> {
    if (!this.fs || !this.path) return;

    const indexPath = this.path.join(this.basePath, '_index.json');
    const data = Object.fromEntries(this.index);
    await this.fs.writeFile(indexPath, JSON.stringify(data, null, 2));
  }
}

// ============================================
// Conversation Manager
// ============================================

export class ConversationManager {
  private adapter: StorageAdapter;
  private currentConversation: Conversation | null = null;
  private autoSaveEnabled: boolean;
  private autoSaveDebounceMs: number;
  private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    adapter: StorageAdapter,
    options: {
      autoSave?: boolean;
      autoSaveDebounceMs?: number;
    } = {}
  ) {
    this.adapter = adapter;
    this.autoSaveEnabled = options.autoSave ?? true;
    this.autoSaveDebounceMs = options.autoSaveDebounceMs ?? 1000;
  }

  async initialize(): Promise<void> {
    await this.adapter.initialize();
  }

  async close(): Promise<void> {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }
    if (this.currentConversation) {
      await this.save();
    }
    await this.adapter.close();
  }

  // ---- Conversation Lifecycle ----

  /**
   * Create a new conversation
   */
  create(
    options: {
      systemPrompt?: string;
      model?: string;
      provider?: string;
      title?: string;
      tags?: string[];
    } = {}
  ): Conversation {
    const now = Date.now();

    this.currentConversation = {
      id: generateId('conv'),
      createdAt: now,
      updatedAt: now,
      messages: [],
      metadata: {
        title: options.title,
        systemPrompt: options.systemPrompt,
        model: options.model,
        provider: options.provider,
        tags: options.tags,
        messageCount: 0,
        toolCallCount: 0,
      },
    };

    return this.currentConversation;
  }

  /**
   * Load an existing conversation
   */
  async load(id: string): Promise<Conversation | null> {
    const conversation = await this.adapter.get(id);
    if (conversation) {
      this.currentConversation = conversation;
    }
    return conversation;
  }

  /**
   * Get the current conversation
   */
  getCurrent(): Conversation | null {
    return this.currentConversation;
  }

  /**
   * Save the current conversation
   */
  async save(): Promise<void> {
    if (!this.currentConversation) return;

    this.currentConversation.updatedAt = Date.now();
    this.currentConversation.metadata.messageCount = this.currentConversation.messages.length;

    await this.adapter.save(this.currentConversation);
  }

  // ---- Message Management ----

  /**
   * Add a message to the current conversation
   */
  addMessage(message: Message): void {
    if (!this.currentConversation) {
      this.create();
    }

    this.currentConversation!.messages.push(message);
    this.currentConversation!.metadata.messageCount++;

    // Auto-generate title from first user message
    if (!this.currentConversation!.metadata.title && message.role === 'user') {
      this.currentConversation!.metadata.title = this.generateTitle(message.content);
    }

    this.scheduleAutoSave();
  }

  /**
   * Add multiple messages
   */
  addMessages(messages: Message[]): void {
    for (const message of messages) {
      this.addMessage(message);
    }
  }

  /**
   * Record tool results
   */
  recordToolResults(results: ToolResult[]): void {
    if (!this.currentConversation) return;

    this.currentConversation.metadata.toolCallCount += results.length;
    this.scheduleAutoSave();
  }

  /**
   * Update token count
   */
  updateTokenCount(tokens: number): void {
    if (!this.currentConversation) return;

    this.currentConversation.metadata.totalTokens =
      (this.currentConversation.metadata.totalTokens ?? 0) + tokens;
    this.scheduleAutoSave();
  }

  // ---- Query Methods ----

  /**
   * List conversations
   */
  async list(options?: SearchOptions): Promise<ConversationSummary[]> {
    return this.adapter.list(options);
  }

  /**
   * Search conversations
   */
  async search(options: SearchOptions): Promise<ConversationSummary[]> {
    return this.adapter.search(options);
  }

  /**
   * Get storage stats
   */
  async getStats(): Promise<StorageStats> {
    return this.adapter.getStats();
  }

  /**
   * Delete a conversation
   */
  async delete(id: string): Promise<boolean> {
    if (this.currentConversation?.id === id) {
      this.currentConversation = null;
    }
    return this.adapter.delete(id);
  }

  // ---- Export/Import ----

  /**
   * Export conversation to JSON
   */
  exportToJSON(conversation?: Conversation): string {
    const conv = conversation ?? this.currentConversation;
    if (!conv) throw new Error('No conversation to export');

    return JSON.stringify(conv, null, 2);
  }

  /**
   * Import conversation from JSON
   */
  async importFromJSON(json: string): Promise<Conversation> {
    const conversation = JSON.parse(json) as Conversation;

    // Assign new ID to avoid conflicts
    conversation.id = generateId('conv');
    conversation.createdAt = Date.now();
    conversation.updatedAt = Date.now();

    await this.adapter.save(conversation);
    this.currentConversation = conversation;

    return conversation;
  }

  /**
   * Export to ChatML format
   */
  exportToChatML(conversation?: Conversation): string {
    const conv = conversation ?? this.currentConversation;
    if (!conv) throw new Error('No conversation to export');

    return conv.messages
      .map((m) => {
        return `<|im_start|>${m.role}\n${m.content}<|im_end|>`;
      })
      .join('\n');
  }

  // ---- Private Methods ----

  private generateTitle(content: string): string {
    // Take first sentence or first 50 chars
    const firstSentence = content.match(/^[^.!?]+[.!?]?/)?.[0] ?? content;
    return firstSentence.substring(0, 50).trim() + (firstSentence.length > 50 ? '...' : '');
  }

  private scheduleAutoSave(): void {
    if (!this.autoSaveEnabled) return;

    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }

    this.autoSaveTimer = setTimeout(() => {
      this.save().catch(console.error);
    }, this.autoSaveDebounceMs);
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a conversation manager with in-memory storage
 */
export function createMemoryConversationManager(): ConversationManager {
  return new ConversationManager(new MemoryStorageAdapter());
}

/**
 * Create a conversation manager with file storage
 */
export function createFileConversationManager(basePath: string): ConversationManager {
  return new ConversationManager(new FileStorageAdapter(basePath));
}
