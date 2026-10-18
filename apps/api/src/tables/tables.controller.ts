import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateTableDto } from './dto/create-table.dto';
import { TablesService } from './tables.service';
import { CreateCreatorPaidChallengeDto } from '../admin/paid-table.dto';

@Controller(['tables', 'challenges'])
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  @Get()
  list() {
    return this.tablesService.list();
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateTableDto) {
    return this.tablesService.create(user.id, body);
  }

  @Post('paid-drafts')
  @UseGuards(JwtAuthGuard)
  createPaidDraft(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateCreatorPaidChallengeDto) {
    return this.tablesService.createPaidDraft(user.id, body);
  }

  @Post(':id/register-free')
  @UseGuards(JwtAuthGuard)
  registerFree(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) tableId: string,
  ) {
    return this.tablesService.registerFree(tableId, user.id);
  }

  @Get(':id/standings')
  standings(@Param('id', ParseUUIDPipe) tableId: string) {
    return this.tablesService.standings(tableId);
  }

  @Get(':code')
  getByCode(@Param('code') code: string) {
    return this.tablesService.getByCode(code);
  }

  @Get(':id/result/final')
  result(@Param('id', ParseUUIDPipe) id: string) {
    return this.tablesService.result(id);
  }
}
