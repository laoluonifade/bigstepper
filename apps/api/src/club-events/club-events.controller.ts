import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, Length, Matches, Max, MaxLength, Min } from 'class-validator';
import { AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import type { EventActivity } from './club-events.repository';
import { ClubEventsService } from './club-events.service';

class EventDto {
  @IsString() @Length(2, 80)
  title: string;

  @IsIn(['run', 'walk', 'cycle', 'any'])
  activity: EventActivity;

  @IsOptional() @IsString() @MaxLength(600)
  notes?: string | null;

  @IsInt() @Min(0) @Max(6)
  weekday: number;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime: string;

  @IsString() @MaxLength(64)
  timeZone: string;

  @IsInt() @Min(15) @Max(1440)
  durationMinutes: number;

  @IsOptional() @IsInt() @Min(500) @Max(200_000)
  distanceMetres?: number | null;

  @IsString() @Length(2, 120)
  venue: string;

  @IsOptional() @IsString() @MaxLength(200)
  address?: string | null;

  @IsNumber() @IsLatitude()
  latitude: number;

  @IsNumber() @IsLongitude()
  longitude: number;
}

class NearQuery {
  @IsOptional() @Type(() => Number) @IsLatitude()
  lat?: number;

  @IsOptional() @Type(() => Number) @IsLongitude()
  lon?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  km?: number;
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
    return this.events.create(user.id, id, input);
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
