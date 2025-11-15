import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { RedisIoAdapter } from './redis-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe());
  app.enableCors({
    origin: ['http://localhost:3000', 'http://192.168.100.189:8080', '*'],
    credentials: true,
  });

  // Enable Socket.IO with Redis adapter for cross-service sync
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.warn('⚠️  REDIS_URL is not set. Socket.IO will run without shared adapter.');
    app.useWebSocketAdapter(new IoAdapter(app));
  } else {
    const redisAdapter = new RedisIoAdapter(app, redisUrl);
    await redisAdapter.connectToRedis();
    app.useWebSocketAdapter(redisAdapter);
    console.log('✅ Socket.IO Redis adapter initialized');
  }

  const port = process.env.PORT || 8080;
  await app.listen(port, '0.0.0.0');
  console.log(`Server running on port ${port}`);
  console.log(`Socket.IO server ready for connections`);
}
bootstrap();
