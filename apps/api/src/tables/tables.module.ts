import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompetitionTable } from './competition-table.entity';
import { TableRegistration } from './table-registration.entity';
import { TablesController } from './tables.controller';
import { TablesService } from './tables.service';

@Module({
  imports: [TypeOrmModule.forFeature([CompetitionTable, TableRegistration])],
  controllers: [TablesController],
  providers: [TablesService],
})
export class TablesModule {}
