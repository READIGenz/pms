/**
 * main.ts
 * -------
 * REMARK: NestJS bootstrap. We set a global API prefix `/api` and enable CORS
 * so the Vite dev server (http://localhost:5173) can talk to the API.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? true,
    credentials: true,
  });
  await app.listen(process.env.PORT || 3000);
  console.log(`API listening on http://localhost:${process.env.PORT || 3000}/api`);
}
bootstrap();
