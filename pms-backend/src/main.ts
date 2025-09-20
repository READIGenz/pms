import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,        // strips unknown fields (keep DTOs exact)
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );
app.enableCors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: false,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Skip-Auth'],
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
});

  await app.listen(process.env.PORT || 3000);
}
bootstrap();
