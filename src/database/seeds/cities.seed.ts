import { DataSource } from 'typeorm';
import { City } from '../../modules/branches/entities/cities/city.entity';

export const seedCities = async (dataSource: DataSource) => {
  const cityRepository = dataSource.getRepository(City);

  const cities = [
    { id: 1, name: 'Santa Cruz de la Sierra' },
    { id: 2, name: 'Cochabamba' },
    { id: 3, name: 'La Paz' }
  ];

  for (const cityData of cities) {
    const exists = await cityRepository.findOneBy({ id: cityData.id });
    if (!exists) {
      const city = cityRepository.create(cityData);
      await cityRepository.save(city);
      console.log(`City ${city.name} created.`);
    } else {
      console.log(`City ${exists.name} already exists.`);
    }
  }
};
