import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BranchesController } from './controllers/branches.controller';
import { CitiesController } from './controllers/cities.controller';
import { BranchesService } from './services/branches.service';
import { CitiesService } from './services/cities.service';

import { Branch } from './entities/branches/branch.entity';
import { City } from './entities/cities/city.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Branch, City])
  ],
  controllers: [BranchesController, CitiesController],
  providers: [BranchesService, CitiesService],
})
export class BranchesModule {}
