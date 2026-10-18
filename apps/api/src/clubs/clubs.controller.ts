import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { IsUUID } from 'class-validator';
import { AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClubsService } from './clubs.service';
import { CreateClubDto } from './dto/create-club.dto';

class AddMemberDto {
  @IsUUID()
  userId: string;
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
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.clubsService.get(id);
  }

  @Get(':id/members')
  members(@Param('id', ParseUUIDPipe) id: string) {
    return this.clubsService.members(id);
  }

  @Post(':id/members')
  @UseGuards(JwtAuthGuard)
  addMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AddMemberDto,
  ) {
    return this.clubsService.addMember(user.id, id, body.userId);
  }
}
