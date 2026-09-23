import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Branch } from './branch.entity';
import { City } from './city.entity';
import { CreateBranchDto, UpdateBranchDto } from './branch.dto';

@Injectable()
export class BranchesService {
  constructor(
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
    @InjectRepository(City)
    private readonly cityRepository: Repository<City>,
  ) {}

  async create(createBranchDto: CreateBranchDto) {
    const city = await this.cityRepository.findOneBy({ id: createBranchDto.cityId });
    if (!city) {
      throw new NotFoundException(`City with id ${createBranchDto.cityId} not found`);
    }

    const branch = this.branchRepository.create(createBranchDto);
    return await this.branchRepository.save(branch);
  }

  async findAll() {
    return await this.branchRepository.find({
      relations: { city: true },
      order: { id: 'ASC' },
    });
  }

  async findOne(id: number) {
    const branch = await this.branchRepository.findOne({
      where: { id },
      relations: { city: true },
    });
    if (!branch) {
      throw new NotFoundException(`Branch with id ${id} not found`);
    }
    return branch;
  }

  async update(id: number, updateBranchDto: UpdateBranchDto) {
    const branch = await this.findOne(id);
    
    if (updateBranchDto.cityId) {
      const city = await this.cityRepository.findOneBy({ id: updateBranchDto.cityId });
      if (!city) {
        throw new NotFoundException(`City with id ${updateBranchDto.cityId} not found`);
      }
    }

    Object.assign(branch, updateBranchDto);
    return await this.branchRepository.save(branch);
  }

  async remove(id: number) {
    const branch = await this.findOne(id);
    branch.active = false;
    return await this.branchRepository.save(branch);
  }
}
