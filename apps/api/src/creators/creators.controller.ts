import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreatorSignupDto } from './creator.dto';
import { CreatorsService } from './creators.service';

@Controller('creators')
@UseGuards(JwtAuthGuard)
export class CreatorsController {
  constructor(private readonly creatorsService: CreatorsService) {}

  @Post('signup') signup(@CurrentUser() user: AuthenticatedUser, @Body() body: CreatorSignupDto) {
    return this.creatorsService.signup(user.id, body);
  }

  @Get('me') me(@CurrentUser() user: AuthenticatedUser) {
    return this.creatorsService.me(user.id);
  }

  @Get('me/earnings') earnings(@CurrentUser() user: AuthenticatedUser) {
    return this.creatorsService.earnings(user.id);
  }
}
