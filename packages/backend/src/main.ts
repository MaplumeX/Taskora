import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, Logger } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { deployDatabase, MIGRATION_FAILURE_HELP } from './migrations/deploy';
import { httpCompression } from './common/http-compression';

async function bootstrap() {
  try {
    await deployDatabase({ log: (message) => Logger.log(message, 'Bootstrap') });
  } catch (error) {
    Logger.error(MIGRATION_FAILURE_HELP, error, 'Bootstrap');
    process.exitCode = 1;
    return;
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.use(httpCompression());

  // /sync/push 承载离线期间积压的 Outbox：默认 100kb 只够约 50 条新建
  // 任务，超限请求被整批拒绝、设备原样重放，同步永久卡死。设备端按
  // 256KB 分批（MAX_PUSH_BATCH_BYTES），这里留足余量。
  app.useBodyParser('json', { limit: '4mb' });

  app.enableCors({
    origin: true,
    credentials: true,
  });

  app.use(cookieParser());

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  Logger.log(`Server running on http://localhost:${port}`, 'Bootstrap');
}

bootstrap().catch((error) => {
  Logger.error('Application startup failed.', error, 'Bootstrap');
  process.exitCode = 1;
});
