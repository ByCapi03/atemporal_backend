import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import { seedRoles } from './seeds/roles.seed';
import { Size } from '../modules/catalog/size.entity';
import { Color } from '../modules/catalog/color.entity';

const sizes = [
  { name: 'XS' }, { name: 'S' }, { name: 'M' },
  { name: 'L' }, { name: 'XL' }, { name: 'XXL' }, { name: 'ÚNICA' }
];

const colors = [
  { name: 'Negro' }, { name: 'Blanco' }, { name: 'Rojo' },
  { name: 'Azul' }, { name: 'Verde' }, { name: 'Amarillo' },
  { name: 'Gris' }, { name: 'Beige' }, { name: 'Café' }
];

async function runSeed() {
  console.log('Initializing Seed Runner...');
  const app = await NestFactory.createApplicationContext(AppModule);
  
  try {
    const dataSource = app.get(DataSource);
    
    console.log('Seeding Roles...');
    await seedRoles(dataSource);

    console.log('Seeding Sizes and Colors...');
    const sizeRepo = dataSource.getRepository(Size);
    const colorRepo = dataSource.getRepository(Color);

    for (const s of sizes) {
      if (!(await sizeRepo.findOneBy({ name: s.name }))) {
        await sizeRepo.save(sizeRepo.create(s));
      }
    }
    for (const c of colors) {
      if (!(await colorRepo.findOneBy({ name: c.name }))) {
        await colorRepo.save(colorRepo.create(c));
      }
    }
    
    console.log('Seeding completed successfully.');
  } catch (error) {
    console.error('Error during seeding:', error);
  } finally {
    await app.close();
  }
}

runSeed();
