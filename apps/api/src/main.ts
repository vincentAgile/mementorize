import type { IncomingMessage, ServerResponse } from 'node:http';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors();
  // In a container, \`docker stop\` sends SIGTERM. Without this, Nest ignores
  // it: the onModuleDestroy hooks (closing the database pool) never run, and
  // Docker kills the process after 10 s.
  app.enableShutdownHooks();
  // No keep-alive: every response closes its connection, and the web server
  // opens a new one for its next call (well under a millisecond on Docker's
  // network). During a deployment, the old API container stops while the
  // web is still calling it: a kept-alive connection could be closed at the
  // very moment it's reused, and that request would fail. See
  // deploy/README.md, "Déploiement continu".
  app.use((_req: IncomingMessage, res: ServerResponse, next: () => void) => {
    res.setHeader('Connection', 'close');
    next();
  });
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
