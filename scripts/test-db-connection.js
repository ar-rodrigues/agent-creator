// Load environment variables from .env file
// eslint-disable-next-line
require('dotenv').config({ path: '.env.local' });

// eslint-disable-next-line
const { Client } = require('pg');

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  console.error('❌ DATABASE_URL not found in environment variables');
  console.log('\n📋 Available DATABASE-related env vars:');
  const dbVars = Object.keys(process.env).filter(k => 
    k.includes('DATABASE') || k.includes('SUPABASE')
  );
  if (dbVars.length > 0) {
    dbVars.forEach(key => {
      const value = process.env[key];
      // Hide sensitive parts
      const hidden = value ? value.replace(/:[^:@]+@/, ':****@') : 'undefined';
      console.log(`   ${key} = ${hidden}`);
    });
  } else {
    console.log('   (none found)');
  }
  console.log('\n💡 Make sure DATABASE_URL is set in your .env.local file');
  process.exit(1);
}

console.log('🔌 Testing database connection...');
const hiddenUrl = dbUrl.replace(/:[^:@]+@/, ':****@');
console.log('📍 Connection string (password hidden):', hiddenUrl);
console.log('');

// Parse connection string to check format
let url;
try {
  url = new URL(dbUrl);
  console.log('📋 Connection details:');
  console.log('   Host:', url.hostname);
  console.log('   Port:', url.port || '5432 (default)');
  console.log('   Database:', url.pathname.split('/').filter(Boolean)[0] || 'postgres');
  console.log('');
} catch (e) {
  console.error('❌ Invalid connection string format');
  console.error('   Expected format: postgresql://user:password@host:port/database');
  process.exit(1);
}

// Check if it's a Supabase connection
const isSupabase = url.hostname.includes('supabase.co') || url.hostname.includes('supabase.com');
if (isSupabase) {
  console.log('🔍 Detected Supabase connection - using SSL');
  console.log('');
}

// Parse connection string and add SSL for Supabase
// Note: If you get ENOTFOUND errors, try using the pooler connection string instead
// Pooler format: postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
const clientConfig = {
  connectionString: dbUrl,
  ssl: isSupabase ? {
    rejectUnauthorized: false // Supabase requires SSL but uses self-signed certs
  } : false,
  // Force IPv4 if available (helps with some network configurations)
  family: 4
};

const client = new Client(clientConfig);

client.connect()
  .then(() => {
    console.log('✅ Connection successful! Password is correct.');
    console.log('');
    return client.query('SELECT version()');
  })
  .then((result) => {
    const version = result.rows[0].version.split(',')[0];
    console.log('📊 PostgreSQL version:', version);
    console.log('');
    return client.query('SELECT current_database(), current_user');
  })
  .then((result) => {
    console.log('📁 Database:', result.rows[0].current_database);
    console.log('👤 User:', result.rows[0].current_user);
    console.log('');
    return client.end();
  })
  .then(() => {
    console.log('✅ Test completed successfully!');
    console.log('💡 You can now run your database migrations (for example: npm run db:push).');
    process.exit(0);
  })
  .catch((error) => {
    console.error('');
    console.error('❌ Connection failed!');
    console.error('   Error:', error.message);
    console.error('');
    
    if (error.code === '28P01') {
      console.error('🔑 Authentication failed - Password is incorrect.');
      console.error('   Please check your DATABASE_URL in .env.local');
    } else if (error.code === 'ENOTFOUND') {
      console.error('🌐 Host not found - Check the hostname in your DATABASE_URL');
      console.error('');
      console.error('💡 Use the pooler connection string from Supabase:');
      console.error('');
      console.error('   1. Go to Supabase Dashboard → Connect to your project');
      console.error('   2. Select "Connection String" tab');
      console.error('   3. Set Method to "Transaction pooler" (port 6543) for scripts');
      console.error('   4. Copy the connection string');
      console.error('   5. Update DATABASE_URL in .env.local');
      console.error('');
      console.error('   Pooler format:');
      console.error('   postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('🚫 Connection refused - Check the port and host in your DATABASE_URL');
      console.error('   Make sure the database is accessible from your network');
    } else if (error.code === 'ETIMEDOUT') {
      console.error('⏱️  Connection timeout - The database might be unreachable');
    } else {
      console.error('   Error code:', error.code);
    }
    console.error('');
    process.exit(1);
  });
