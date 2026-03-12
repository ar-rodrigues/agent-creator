// Load environment variables from .env file
// eslint-disable-next-line
require('dotenv').config({ path: '.env.local' });

// eslint-disable-next-line
const { Client } = require('pg');
// eslint-disable-next-line
const fs = require('fs');
// eslint-disable-next-line
const path = require('path');

// Get database connection string
const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  console.error('❌ DATABASE_URL not found in environment variables');
  console.error('\n📋 Available DATABASE-related env vars:');
  const dbVars = Object.keys(process.env).filter((k) =>
    k.includes('DATABASE') || k.includes('SUPABASE')
  );
  if (dbVars.length > 0) {
    dbVars.forEach((key) => {
      const value = process.env[key];
      const hidden = value ? value.replace(/:[^:@]+@/, ':****@') : 'undefined';
      console.error(`   ${key} = ${hidden}`);
    });
  } else {
    console.error('   (none found)');
  }
  console.error('\n💡 Make sure DATABASE_URL is set in your .env.local file');
  process.exit(1);
}

// Parse connection string so we can detect Supabase and configure SSL correctly
let url;
try {
  url = new URL(dbUrl);
} catch (e) {
  console.error('❌ Invalid connection string format in DATABASE_URL');
  console.error('   Expected format: postgresql://user:password@host:port/database');
  process.exit(1);
}

const isSupabase =
  url.hostname.includes('supabase.co') || url.hostname.includes('supabase.com');

const clientConfig = {
  connectionString: dbUrl,
  ssl: isSupabase
    ? {
        // Supabase requires SSL but uses self-signed certs
        rejectUnauthorized: false
      }
    : false,
  // Force IPv4 if available (helps with some network configurations)
  family: 4
};

const client = new Client(clientConfig);

async function runMigration(migrationFileName) {
  try {
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected successfully\n');

    // Determine migrations directory (prefer Supabase CLI folder if present)
    const supabaseMigrationsDir = path.join(__dirname, '..', 'supabase', 'migrations');
    const legacyMigrationsDir = path.join(__dirname, '..', 'sql', 'migrations');
    const migrationsDir = fs.existsSync(supabaseMigrationsDir)
      ? supabaseMigrationsDir
      : legacyMigrationsDir;

    if (!fs.existsSync(migrationsDir)) {
      console.error('❌ Error: No migrations directory found.');
      console.error('   Looked for:');
      console.error(`     - ${supabaseMigrationsDir}`);
      console.error(`     - ${legacyMigrationsDir}`);
      console.error('\n💡 If you are using Supabase CLI, your SQL files should be under a supabase/migrations folder.');
      process.exit(1);
    }

    if (!migrationFileName) {
      console.error('❌ Error: No migration file name provided.');
      console.error('   Usage: node scripts/run-migration.js <migration-file.sql>');
      console.error('\n   Available migrations:');
      const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
      if (files.length === 0) {
        console.error('     (no .sql files found)');
      } else {
        files.forEach((f) => console.error(`     - ${f}`));
      }
      process.exit(1);
    }

    const migrationPath = path.join(migrationsDir, migrationFileName);

    // Check if file exists
    if (!fs.existsSync(migrationPath)) {
      console.error(`❌ Error: Migration file not found: ${migrationPath}`);
      process.exit(1);
    }

    console.log('📄 Reading migration file...');
    console.log(`   File: ${migrationPath}\n`);
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    console.log('✅ Migration file read successfully\n');

    console.log('🚀 Running migration...\n');

    // Execute migration
    await client.query(migrationSQL);

    console.log('✅ Migration completed successfully!\n');
    console.log('📝 Next steps:');
    console.log('   1. If you are using Supabase CLI, keep migrations in the supabase/migrations folder.');
    console.log('   2. To apply all migrations normally, prefer using: npm run db:push');

  } catch (error) {
    console.error('\n❌ Error running migration:', error.message);
    if (error.code) {
      console.error(`   Error code: ${error.code}`);
    }
    if (error.position) {
      console.error(`   Position: ${error.position}`);
    }
    if (error.detail) {
      console.error(`   Detail: ${error.detail}`);
    }
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Get migration file name from command line arguments
const migrationFileName = process.argv[2];
runMigration(migrationFileName);
