// No external UUID dependency, using simple timestamp + random

interface CachedMedia {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  createdAt: number;
}

class CacheService {
  private cache = new Map<string, CachedMedia>();
  private readonly MAX_CACHE_SIZE = 100; // Limit number of items in RAM
  private readonly TTL = 3600000; // 1 hour

  constructor() {
    // Cleanup interval every 10 minutes
    setInterval(() => this.cleanup(), 600000);
  }

  set(buffer: Buffer, mimeType: string, fileName: string): string {
    const id = Date.now().toString() + '-' + Math.random().toString(36).substring(2, 9);
    
    // Simple eviction policy: if too many items, delete the oldest
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }

    this.cache.set(id, {
      buffer,
      mimeType,
      fileName,
      createdAt: Date.now()
    });

    return id;
  }

  get(id: string): CachedMedia | undefined {
    return this.cache.get(id);
  }

  delete(id: string): boolean {
    return this.cache.delete(id);
  }

  getAll(): { id: string, fileName: string, createdAt: number }[] {
    const items: { id: string, fileName: string, createdAt: number }[] = [];
    this.cache.forEach((value, key) => {
      items.push({ id: key, fileName: value.fileName, createdAt: value.createdAt });
    });
    return items;
  }

  private cleanup() {
    const now = Date.now();
    this.cache.forEach((value, key) => {
      if (now - value.createdAt > this.TTL) {
        this.cache.delete(key);
      }
    });
  }
}

export const mediaCache = new CacheService();
