import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, Logger } from '@nestjs/common';
import { execSync } from 'child_process';
import { resolve } from 'path';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

const backendRoot = resolve(__dirname, '..');

function runDatabaseMigrations(): void {
  try {
    Logger.log('Checking for pending database migrations...', 'Bootstrap');
    execSync('node node_modules/prisma/build/index.js migrate deploy', {
      cwd: backendRoot,
      stdio: 'inherit',
    });
    Logger.log('Database migrations are up to date.', 'Bootstrap');
  } catch (error) {
    Logger.error(
      'Database migration failed. Aborting startup.',
      error,
      'Bootstrap',
    );
    process.exit(1);
  }
}

async function bootstrap() {
  runDatabaseMigrations();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

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

bootstrap();