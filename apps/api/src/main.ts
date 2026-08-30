import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // rejette les propriétés non déclarées dans les DTO
      transform: true, // convertit les payloads JSON dans le type des DTO
    }),
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`API démarrée sur http://localhost:${port}`);
}
await bootstrap();
