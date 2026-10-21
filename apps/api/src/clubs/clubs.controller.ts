import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClubsService } from './clubs.service';
import { CreateClubDto } from './dto/create-club.dto';

class AddMemberDto {
  @IsOptional()
  @IsString()
  @Length(1, 60)
  username?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;
}

@Controller(['clubs', 'communities'])
export class ClubsController {
  constructor(private readonly clubsService: ClubsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateClubDto) {
    return this.clubsService.create(user.id, body);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.clubsService.get(id);
  }

  @Get(':id/members')
  members(@Param('id') id: string) {
    return this.clubsService.members(id);
  }

  @Get(':id/leaderboard')
  @UseGuards(JwtAuthGuard)
  leaderboard(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.clubsService.monthLeaderboard(user.id, id);
  }

  @Post(':id/members')
  @UseGuards(JwtAuthGuard)
  addMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: AddMemberDto,
  ) {
    return this.clubsService.addMember(user.id, id, body);
  }
}
