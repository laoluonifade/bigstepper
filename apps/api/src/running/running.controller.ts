import { Controller, Post, Get, Param, Body, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RunningSession } from './running-session.entity';

@Controller('runs')
export class RunningController {
  constructor(
    @InjectRepository(RunningSession)
    private sessionsRepo: Repository<RunningSession>,
  ) {}

  @Post('start')
  async start(@Body() body: { userId: string }) {
    const session = this.sessionsRepo.create({
      userId: body.userId,
      status: 'RUNNING',
      startedAt: new Date(),
    });
    return this.sessionsRepo.save(session);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return this.sessionsRepo.findOne({ where: { id } });
  }
}
