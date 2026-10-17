import { Controller, Post, Get, Param, Body } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RunningSession } from './running-session.entity';
import { GpsSample } from './gps-sample.entity';
import { haversineMetres } from './haversine';

@Controller('runs')
export class RunningController {
  constructor(
    @InjectRepository(RunningSession)
    private sessionsRepo: Repository<RunningSession>,
    @InjectRepository(GpsSample)
    private samplesRepo: Repository<GpsSample>,
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

  @Post(':id/samples')
  async addSamples(
    @Param('id') sessionId: string,
    @Body() body: { samples: Array<{ sequence: number; latitude: number; longitude: number; accuracy?: number; recordedAt: string }> },
  ) {
    const session = await this.sessionsRepo.findOne({ where: { id: sessionId } });
    if (!session) throw new Error('Session not found');

    const entities = body.samples.map((s) =>
      this.samplesRepo.create({
        sessionId,
        sequence: s.sequence,
        latitude: s.latitude,
        longitude: s.longitude,
        accuracy: s.accuracy,
        recordedAt: new Date(s.recordedAt),
      }),
    );
    await this.samplesRepo.save(entities);

    // Recalculate distance from all samples
    const all = await this.samplesRepo.find({ where: { sessionId }, order: { sequence: 'ASC' } });
    let distance = 0;
    for (let i = 1; i < all.length; i++) {
      distance += haversineMetres(all[i - 1].latitude, all[i - 1].longitude, all[i].latitude, all[i].longitude);
    }
    session.distanceMetres = Math.round(distance);
    await this.sessionsRepo.save(session);

    return { distanceMetres: session.distanceMetres, sampleCount: all.length };
  }

  @Post(':id/finish')
  async finish(@Param('id') id: string) {
    const session = await this.sessionsRepo.findOne({ where: { id } });
    if (!session) throw new Error('Session not found');
    session.status = 'COMPLETED';
    session.finishedAt = new Date();
    return this.sessionsRepo.save(session);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return this.sessionsRepo.findOne({ where: { id } });
  }
}
