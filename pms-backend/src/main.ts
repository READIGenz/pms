// src/main.ts
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { cors: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,        // strips unknown fields (keep DTOs exact)
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );

  app.enableCors({
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Skip-Auth'],
    methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  });

  // Serve uploaded files (e.g., profile photos) from /uploads
  // Example URL: http://localhost:3000/uploads/12345.jpg
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/' });

  await app.listen(process.env.PORT || 3000);
}
bootstrap();
