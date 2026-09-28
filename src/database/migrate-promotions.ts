import { DataSource } from 'typeorm';
import { ConfigModule } from '@nestjs/config';

ConfigModule.forRoot();

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || '7722794',
  database: process.env.DB_DATABASE || 'ecommerce_ropa',
});

async function run() {
  await dataSource.initialize();
  
  console.log('Running backfill migration...');
  try {
    await dataSource.query(`ALTER TABLE promotions ADD COLUMN "type" VARCHAR(20) DEFAULT 'PERCENTAGE'`);
    await dataSource.query(`ALTER TABLE promotions ADD COLUMN "value" DECIMAL(10,2) DEFAULT 0`);
  } catch (e: any) {
    console.log('Columns might already exist', e.message);
  }
  try {
    await dataSource.query(`UPDATE promotions SET type = 'PERCENTAGE', value = "discountPercentage"`);
  } catch(e: any) {
    console.log('discountPercentage not found for update, maybe already migrated');
  }
  
  try {
    await dataSource.query(`ALTER TABLE promotions DROP COLUMN "discountPercentage"`);
    console.log('Dropped discountPercentage column');
  } catch (e: any) {
    console.log('Column discountPercentage might not exist', e.message);
  }
  
  console.log('Migration complete.');
  await dataSource.destroy();
}

run().catch(console.error);
