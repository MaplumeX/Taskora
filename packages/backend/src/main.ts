import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
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
    execSync('pnpm exec prisma migrate deploy', {
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

  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: true,
    credentials: true,
  });

  app.use(cookieParser());

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