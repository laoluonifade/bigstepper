import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsIn, IsInt, IsString, Max, MaxLength, Min } from 'class-validator';
import { AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { DuelActivity } from './duel-progress';
import { DuelsService } from './duels.service';

class CreateDuelDto {
  @IsString() @MaxLength(40)
  username: string;

  @IsIn(['run', 'walk', 'cycle', 'any'])
  activity: DuelActivity;

  @IsInt() @Min(500) @Max(200_000)
  targetMetres: number;

  @IsInt() @Min(5) @Max(600)
  minutes: number;
}

@Controller('duels')
@UseGuards(JwtAuthGuard)
export class DuelsController {
  constructor(private readonly duels: DuelsService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  create(@CurrentUser() user: AuthenticatedUser, @Body() input: CreateDuelDto) {
    return this.duels.create(user.id, input);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.duels.get(user.id, id);
  }

  @Post(':id/accept')
  accept(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.duels.respond(user.id, id, 'accept');
  }

  @Post(':id/decline')
  decline(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.duels.respond(user.id, id, 'decline');
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.duels.cancel(user.id, id);
  }

  @Post(':id/ready')
  ready(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.duels.ready(user.id, id);
  }
}
