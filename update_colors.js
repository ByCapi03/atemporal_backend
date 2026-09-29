const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:7722794@localhost:5432/ecommerce_ropa' });
async function run() {
  await client.connect();
  await client.query(`UPDATE colors SET "hexCode" = '#eae3b8' WHERE id = 6`);
  await client.query(`UPDATE colors SET "hexCode" = '#e7a6b5' WHERE id = 11`);
  console.log('UPDATED');
  await client.end();
}
run().catch(console.error);
