// src/main.ts
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}

import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, LogLevel } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  // Allow overriding Nest logger levels via env:
  // e.g. LOG_LEVELS=log,warn,error,debug  (leave empty to keep Nest default)
  const rawLevels = String(process.env.LOG_LEVELS || '').trim();
  const parsedLevels = rawLevels
    ? (rawLevels.split(',').map(s => s.trim()).filter(Boolean) as LogLevel[])
    : undefined;

  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    {
      logger: parsedLevels, // undefined preserves Nest's default behavior
    },
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,        // strips unknown fields (keep DTOs exact)
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );

  const allowedOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://34.236.185.127:5173',
    'http://34.236.185.127:3000',
  ];

  app.enableCors({
    origin: (origin, callback) => {
      // allow requests with no origin (like Postman)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('CORS not allowed'));
      }
    },
    credentials: true, // must be true for cookies or Authorization header
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Skip-Auth'],
  });

  // Serve static files
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/' });

  // Listen on PORT environment variable or default 3001
  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`Backend running on port ${port}`);
}
bootstrap();
