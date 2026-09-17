import { Module } from '@nestjs/common';
import { BranchesController } from './controllers/branches.controller';
import { CitiesController } from './controllers/cities.controller';
import { BranchesService } from './services/branches.service';
import { CitiesService } from './services/cities.service';

@Module({
  controllers: [BranchesController, CitiesController],
  providers: [BranchesService, CitiesService],
})
export class BranchesModule {}
