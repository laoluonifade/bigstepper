import { Controller, Post, Get, Param, Body } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompetitionTable } from './competition-table.entity';
import { TableRegistration } from './table-registration.entity';

@Controller('tables')
export class TablesController {
  constructor(
    @InjectRepository(CompetitionTable)
    private tablesRepo: Repository<CompetitionTable>,
    @InjectRepository(TableRegistration)
    private regsRepo: Repository<TableRegistration>,
  ) {}

  @Post()
  async create(@Body() body: { title: string; creatorId: string; type?: string }) {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const table = this.tablesRepo.create({
      title: body.title,
      code,
      creatorId: body.creatorId,
      type: body.type || 'free',
      status: 'OPEN_FOR_ENTRY',
    });
    return this.tablesRepo.save(table);
  }

  @Post(':id/register-free')
  async registerFree(@Param('id') tableId: string, @Body() body: { userId: string }) {
    const reg = this.regsRepo.create({ tableId, userId: body.userId });
    return this.regsRepo.save(reg);
  }

  @Get(':id/standings')
  async standings(@Param('id') tableId: string) {
    const regs = await this.regsRepo.find({
      where: { tableId },
      relations: ['user'],
      order: { creditedDistanceMetres: 'DESC' },
    });
    return regs.map((r, i) => ({
      rank: i + 1,
      userId: r.userId,
      displayName: r.user?.displayName || r.user?.email,
      creditedDistanceMetres: r.creditedDistanceMetres,
    }));
  }

  @Get(':code')
  async getByCode(@Param('code') code: string) {
    return this.tablesRepo.findOne({ where: { code } });
  }
}
