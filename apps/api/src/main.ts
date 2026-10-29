import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { httpMetrics } from './metrics/metrics';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  const config = app.get(ConfigService);
  const port = config.getOrThrow<number>('PORT');

  app.set('trust proxy', 1);
  app.use(httpMetrics);
  app.useBodyParser('json', { limit: '1mb' });
  app.use(helmet());
  app.setGlobalPrefix('v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors({
    origin: [config.getOrThrow<string>('WEB_ORIGIN'), config.getOrThrow<string>('ADMIN_ORIGIN')],
    credentials: true,
  });
  app.enableShutdownHooks();

  if (config.get<string>('NODE_ENV') !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Jump API')
      .setDescription('API for verified activity competitions, communities, creator earnings, and gated payments.')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swaggerConfig));
  }

  const host = config.get<string>('HOST') || '0.0.0.0';
  await app.listen(port, host);
  Logger.log(`API listening on http://${host}:${port}/v1`, 'Bootstrap');
}

void bootstrap();
