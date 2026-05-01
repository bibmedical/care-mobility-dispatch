const { Client } = require('pg');

const client = new Client({
  user: 'postgres',
  password: 'postgres',
  host: 'localhost',
  port: 5432,
  database: 'rideflow_render'
});

async function queryTrip() {
  try {
    await client.connect();
    
    const result = await client.query(
      'SELECT id, rider_name, phone_number, alternative_phone_number, pickup_address, dropoff_address, is_roundtrip, trip_type, created_at FROM trips WHERE rider_name = $1 ORDER BY created_at DESC LIMIT 3',
      ['Test Rider Demo']
    );
    
    console.log('\n========== DATABASE VERIFICATION RESULTS ==========\n');
    console.log(`? Query executed successfully`);
    console.log(`? Found ${result.rows.length} trip(s)\n`);
    
    result.rows.forEach((row, idx) => {
      console.log(`\n--- Trip ${idx + 1} ---`);
      console.log(`  ID: ${row.id}`);
      console.log(`  Rider: ${row.rider_name}`);
      console.log(`  Primary Phone: ${row.phone_number}`);
      console.log(`  Alternative Phone: ${row.alternative_phone_number || '(NOT SET)'}`);
      console.log(`  Pickup: ${row.pickup_address}`);
      console.log(`  Dropoff: ${row.dropoff_address}`);
      console.log(`  Is Roundtrip: ${row.is_roundtrip}`);
      console.log(`  Trip Type: ${row.trip_type}`);
      console.log(`  Created: ${new Date(row.created_at).toLocaleString()}`);
    });
    
    // Feature verification
    console.log('\n========== FEATURE VERIFICATION ==========\n');
    
    if (result.rows.length > 0) {
      const latestTrip = result.rows[0];
      
      // Check alternative phone
      if (latestTrip.alternative_phone_number === '4075550456') {
        console.log('? ALTERNATIVE PHONE: WORKING CORRECTLY');
        console.log(`  Saved value: ${latestTrip.alternative_phone_number}`);
      } else if (latestTrip.alternative_phone_number) {
        console.log(`? ALTERNATIVE PHONE: SAVED BUT UNEXPECTED VALUE`);
        console.log(`  Expected: 4075550456`);
        console.log(`  Got: ${latestTrip.alternative_phone_number}`);
      } else {
        console.log('? ALTERNATIVE PHONE: NOT SAVED');
      }
      
      // Check roundtrip
      if (latestTrip.is_roundtrip === true) {
        console.log('\n? ROUNDTRIP: ENABLED');
        
        // Check if two trips exist for this rider
        const queryRoundtrips = await client.query(
          'SELECT id, trip_type FROM trips WHERE rider_name = $1 ORDER BY created_at DESC LIMIT 10',
          ['Test Rider Demo']
        );
        
        const outbound = queryRoundtrips.rows.filter(r => r.trip_type === 'Outbound').length;
        const returnLeg = queryRoundtrips.rows.filter(r => r.trip_type === 'Return').length;
        
        console.log(`  Outbound trips: ${outbound}`);
        console.log(`  Return trips: ${returnLeg}`);
        
        if (outbound >= 1 && returnLeg >= 1) {
          console.log('  ? Both legs created successfully!');
        }
      } else {
        console.log('\n? ROUNDTRIP: NOT ENABLED OR NOT YET CREATED');
      }
    }
    
  } catch (err) {
    console.error('Database error:', err.message);
  } finally {
    await client.end();
  }
}

queryTrip();
