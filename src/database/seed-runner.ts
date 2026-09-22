import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import { seedRoles } from './seeds/roles.seed';
import { seedCities } from './seeds/cities.seed';

async function runSeed() {
  console.log('Initializing Seed Runner...');
  const app = await NestFactory.createApplicationContext(AppModule);
  
  try {
    const dataSource = app.get(DataSource);
    
    console.log('Seeding Roles...');
    await seedRoles(dataSource);
    
    console.log('Seeding Cities...');
    await seedCities(dataSource);
    
    console.log('Seeding completed successfully.');
  } catch (error) {
    console.error('Error during seeding:', error);
  } finally {
    await app.close();
  }
}

runSeed();
