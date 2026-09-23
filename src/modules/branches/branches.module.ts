import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BranchesController } from './branches.controller';
import { CitiesController } from './cities.controller';
import { BranchesService } from './branches.service';
import { CitiesService } from './cities.service';

import { Branch } from './branch.entity';
import { City } from './city.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Branch, City])
  ],
  controllers: [BranchesController, CitiesController],
  providers: [BranchesService, CitiesService],
})
export class BranchesModule {}
