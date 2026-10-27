import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { validateEnvironment } from './config/environment';
import { redisConnectionOptions } from './config/redis';
import { RedisModule } from './redis/redis.module';
import { JobsModule } from './jobs/jobs.module';
import { RunningModule } from './running/running.module';
import { TablesModule } from './tables/tables.module';
import { ProfilesModule } from './profiles/profiles.module';
import { ClubsModule } from './clubs/clubs.module';
import { LeaguesModule } from './leagues/leagues.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AdminModule } from './admin/admin.module';
import { PaymentsModule } from './payments/payments.module';
import { CreatorsModule } from './creators/creators.module';
import { WalletsModule } from './wallets/wallets.module';
import { MailModule } from './mail/mail.module';
import { FeedModule } from './feed/feed.module';
import { StravaModule } from './strava/strava.module';
import { GeoModule } from './geo/geo.module';
import { LeaderboardModule } from './leaderboard/leaderboard.module';
import { PrizesModule } from './prizes/prizes.module';
import { AmlModule } from './aml/aml.module';
import { SafetyModule } from './safety/safety.module';
import { DuelsModule } from './duels/duels.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.getOrThrow<string>('DATABASE_URL'),
        autoLoadEntities: true,
        synchronize: false,
      }),
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: redisConnectionOptions(config.getOrThrow<string>('REDIS_URL')),
      }),
    }),
    RedisModule,
    MailModule,
    AmlModule,
    SafetyModule,
    DuelsModule,
    FeedModule,
    JobsModule,
    AuthModule,
    ProfilesModule,
    ClubsModule,
    LeaguesModule,
    NotificationsModule,
    AdminModule,
    PaymentsModule,
    CreatorsModule,
    WalletsModule,
    RunningModule,
    TablesModule,
    StravaModule,
    GeoModule,
    LeaderboardModule,
    PrizesModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
