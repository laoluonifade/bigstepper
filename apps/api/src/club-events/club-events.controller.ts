import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min } from 'class-validator';
import { AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { AVATAR_MAX_BYTES } from '../profiles/profiles.service';
import type { EventActivity, EventRepeat } from './club-events.repository';
import { ClubEventsService } from './club-events.service';

class EventDto {
  @IsString() @Length(1, 80)
  title: string;

  @IsIn(['run', 'walk', 'cycle', 'any'])
  activity: EventActivity;

  @IsOptional() @IsString() @MaxLength(600)
  notes?: string | null;

  @IsIn(['once', 'daily', 'weekly', 'monthly'])
  repeat: EventRepeat;

  @IsOptional() @IsInt() @Min(1) @Max(12)
  repeatEvery?: number;

  @IsOptional() @IsArray() @ArrayMaxSize(7) @IsInt({ each: true }) @Min(0, { each: true }) @Max(6, { each: true })
  weekdays?: number[];

  @IsOptional() @IsIn(['date', 'weekday'])
  monthMode?: 'date' | 'weekday' | null;

  @IsOptional() @IsInt() @Min(1) @Max(5)
  monthWeek?: number | null;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startsOn: string;

  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endsOn?: string | null;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime: string;

  @IsString() @MaxLength(64)
  timeZone: string;

  @IsInt() @Min(15) @Max(1440)
  durationMinutes: number;

  @IsOptional() @IsInt() @Min(500) @Max(200_000)
  distanceMetres?: number | null;

  @IsOptional() @IsString() @MaxLength(120)
  venue?: string | null;

  @IsOptional() @IsString() @MaxLength(200)
  address?: string | null;

  @IsOptional() @IsNumber() @IsLatitude()
  latitude?: number | null;

  @IsOptional() @IsNumber() @IsLongitude()
  longitude?: number | null;

  @IsOptional() @IsBoolean()
  draft?: boolean;
}

class NearQuery {
  @IsOptional() @Type(() => Number) @IsLatitude()
  lat?: number;

  @IsOptional() @Type(() => Number) @IsLongitude()
  lon?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  km?: number;
}

class CheckInDto {
  @IsOptional() @IsString() @Length(4, 12)
  code?: string;

  @IsOptional() @IsUUID()
  userId?: string;
}

@Controller()
export class ClubEventsController {
  constructor(private readonly events: ClubEventsService) {}

  @Get('clubs/:id/events')
  @UseGuards(OptionalJwtAuthGuard)
  forClub(@Param('id') id: string, @CurrentUser() viewer: AuthenticatedUser | null) {
    return this.events.forClub(id, viewer?.id ?? null);
  }

  @Post('clubs/:id/events')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  create(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() input: EventDto) {
    const { draft, ...event } = input;
    return this.events.create(user.id, id, event, Boolean(draft));
  }

  @Get('events/drafts')
  @UseGuards(JwtAuthGuard)
  drafts(@CurrentUser() user: AuthenticatedUser) {
    return this.events.drafts(user.id);
  }

  @Post('events/:id/publish')
  @UseGuards(JwtAuthGuard)
  publish(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.events.publish(user.id, id);
  }

  @Get('events')
  @UseGuards(JwtAuthGuard)
  discover(@CurrentUser() user: AuthenticatedUser, @Query() query: NearQuery) {
    return this.events.discover(user.id, query.lat ?? null, query.lon ?? null, query.km ?? 25);
  }

  @Get('events/:id')
  @UseGuards(OptionalJwtAuthGuard)
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() viewer: AuthenticatedUser | null, @Query() query: NearQuery) {
    return this.events.get(id, viewer?.id ?? null, query.lat, query.lon);
  }

  @Patch('events/:id')
  @UseGuards(JwtAuthGuard)
  update(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() input: EventDto) {
    return this.events.update(user.id, id, input);
  }

  @Delete('events/:id')
  @UseGuards(JwtAuthGuard)
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.events.remove(user.id, id);
  }

  @Post('events/:id/cover')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: AVATAR_MAX_BYTES, files: 1 } }))
  setCover(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file?: { buffer: Buffer; mimetype: string }) {
    return this.events.setCover(user.id, id, file);
  }

  @Delete('events/:id/cover')
  @UseGuards(JwtAuthGuard)
  removeCover(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.events.removeCover(user.id, id);
  }

  @Get('events/:id/guests')
  @UseGuards(JwtAuthGuard)
  guests(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.events.guests(user.id, id);
  }

  @Post('events/:id/check-in')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  checkIn(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: CheckInDto) {
    return this.events.checkIn(user.id, id, body, true);
  }

  @Delete('events/:id/check-in/:userId')
  @UseGuards(JwtAuthGuard)
  undoCheckIn(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Param('userId', ParseUUIDPipe) userId: string) {
    return this.events.checkIn(user.id, id, { userId }, false);
  }

  @Post('events/:id/join')
  @UseGuards(JwtAuthGuard)
  join(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.events.join(user.id, id);
  }

  @Delete('events/:id/join')
  @UseGuards(JwtAuthGuard)
  leave(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.events.leave(user.id, id);
  }
}
