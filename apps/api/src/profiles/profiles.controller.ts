import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfilesService } from './profiles.service';

@Controller()
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMine(@CurrentUser() user: AuthenticatedUser) {
    return this.profilesService.getMine(user.id);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  updateMine(@CurrentUser() user: AuthenticatedUser, @Body() body: UpdateProfileDto) {
    return this.profilesService.updateMine(user.id, body);
  }

  @Get('users/:username')
  getPublic(@Param('username') username: string) {
    return this.profilesService.getPublic(username);
  }
}
