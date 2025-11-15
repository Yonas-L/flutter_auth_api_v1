import { IoAdapter } from '@nestjs/platform-socket.io';
import type { INestApplicationContext } from '@nestjs/common';
import type { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient, type RedisClientType } from 'redis';

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter> | null = null;
  private pubClient: RedisClientType | null = null;
  private subClient: RedisClientType | null = null;

  constructor(app: INestApplicationContext, private readonly redisUrl: string) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    this.pubClient = createClient({ url: this.redisUrl });
    this.subClient = this.pubClient.duplicate();
    await Promise.all([this.pubClient.connect(), this.subClient.connect()]);
    this.adapterConstructor = createAdapter(this.pubClient, this.subClient);
  }

  override createIOServer(port: number, options?: ServerOptions) {
    if (!this.adapterConstructor) {
      throw new Error('Redis adapter has not been initialized. Call connectToRedis() first.');
    }

    const server = super.createIOServer(port, options);
    server.adapter(this.adapterConstructor);
    return server;
  }

  async disconnect(): Promise<void> {
    await Promise.all([
      this.pubClient?.disconnect() ?? Promise.resolve(),
      this.subClient?.disconnect() ?? Promise.resolve(),
    ]);

    this.pubClient = null;
    this.subClient = null;
    this.adapterConstructor = null;
  }
}
