const { Client } = require('pg');

const client = new Client({
  user: 'postgres',
  password: 'postgres',
  host: 'localhost',
  port: 5432,
  database: 'postgres'
});

async function listDatabases() {
  try {
    await client.connect();
    
    const result = await client.query(
      'SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname'
    );
    
    console.log('Available databases:');
    result.rows.forEach(row => {
      console.log(`  - ${row.datname}`);
    });
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}

listDatabases();
