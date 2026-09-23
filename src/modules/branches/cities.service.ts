import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { City } from './city.entity';
import { CreateCityDto, UpdateCityDto } from './city.dto';

@Injectable()
export class CitiesService {
  constructor(
    @InjectRepository(City)
    private readonly cityRepository: Repository<City>,
  ) {}

  async create(createCityDto: CreateCityDto) {
    const city = this.cityRepository.create(createCityDto);
    return await this.cityRepository.save(city);
  }

  async findAll() {
    return await this.cityRepository.find({
      order: { id: 'ASC' },
    });
  }

  async findOne(id: number) {
    const city = await this.cityRepository.findOneBy({ id });
    if (!city) {
      throw new NotFoundException(`City with id ${id} not found`);
    }
    return city;
  }

  async update(id: number, updateCityDto: UpdateCityDto) {
    const city = await this.findOne(id);
    Object.assign(city, updateCityDto);
    return await this.cityRepository.save(city);
  }

  async remove(id: number) {
    const city = await this.findOne(id);
    city.active = false;
    return await this.cityRepository.save(city);
  }
}
