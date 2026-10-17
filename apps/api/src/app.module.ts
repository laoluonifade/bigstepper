import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      username: process.env.DB_USER || 'bigstepper',
      password: process.env.DB_PASSWORD || 'bigstepper',
      database: process.env.DB_NAME || 'bigstepper',
      autoLoadEntities: true,
      synchronize: process.env.NODE_ENV !== 'production', // Use migrations in prod
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
