/**
 * Script to migrate niche lists from SQL database back to JSON files
 * 
 * Reads all niche data from the SQL database and writes them to JSON files
 */

// Load environment variables from .env file
import dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';
import * as sql from 'mssql';
import { OperatorList } from './niche-list-types';

// Database configuration
function getDbConfig(): string | sql.config {
  if (process.env.AZURE_SQL_CONNECTION_STRING) {
    return process.env.AZURE_SQL_CONNECTION_STRING;
  }

  let server = process.env.AZURE_SQL_SERVER || '';
  const database = process.env.AZURE_SQL_DATABASE || '';
  const user = process.env.AZURE_SQL_USER || '';
  const password = process.env.AZURE_SQL_PASSWORD || '';
  
  let port = parseInt(process.env.AZURE_SQL_PORT || '1433', 10);
  if (server.includes(':')) {
    const parts = server.split(':');
    server = parts[0];
    if (parts[1] && !process.env.AZURE_SQL_PORT) {
      port = parseInt(parts[1], 10);
    }
  }

  if (!server || !database || !user || !password) {
    throw new Error('Missing required database configuration. Please set AZURE_SQL_SERVER, AZURE_SQL_DATABASE, AZURE_SQL_USER, and AZURE_SQL_PASSWORD environment variables.');
  }

  return {
    server,
    database,
    user,
    password,
    port,
    options: {
      encrypt: true,
      trustServerCertificate: false,
      enableArithAbort: true
    }
  };
}

/**
 * Converts a table name back to a filename
 * Tables are stored as "healing_operators", "arts_dps_operators", etc.
 * We need to convert back to "healing.json", "arts-dps.json", etc.
 */
function tableNameToFilename(tableName: string, displayName: string): string {
  // Remove _operators suffix
  let filename = tableName.replace(/_operators$/, '');
  
  // Convert underscores to hyphens (most table names use underscores)
  filename = filename.replace(/_/g, '-');
  
  // If the result is empty or doesn't look right, fall back to display name conversion
  if (!filename || filename.length < 2) {
    filename = displayName
      .toLowerCase()
      .replace(/\s+operators?$/gi, '')
      .replace(/\s+/g, '-')
      .replace(/\//g, '-')
      .replace(/[^a-z0-9-]/g, '');
  }
  
  return filename;
}

/**
 * Migrates a single niche from SQL to JSON
 */
async function migrateNicheToJson(
  pool: sql.ConnectionPool,
  nicheRow: any,
  outputDir: string
): Promise<void> {
  const tableName = nicheRow.table_name;
  
  if (!tableName) {
    console.warn(`  Skipping ${nicheRow.niche_display_name} - no table_name`);
    return;
  }

  // Load operators for this niche
  const escapedTableName = `[${tableName}]`;
  let operators: Record<string, string> = {};
  
  try {
    const operatorsQuery = `SELECT operator_name, note FROM niches.${escapedTableName} ORDER BY operator_name`;
    const operatorsResult = await pool.request().query(operatorsQuery);

    for (const opRow of operatorsResult.recordset) {
      operators[opRow.operator_name] = opRow.note || '';
    }
  } catch (error: any) {
    console.warn(`  Warning: Could not load operators from niches.${tableName}:`, error.message);
  }

  // Load related niches
  const nicheId = nicheRow.id;
  const relatedQuery = 'SELECT related_niche_display_name FROM niches.niche_related_niches WHERE niche_id = @niche_id ORDER BY related_niche_display_name';
  const relatedRequest = pool.request();
  relatedRequest.input('niche_id', sql.Int, nicheId);
  const relatedResult = await relatedRequest.query(relatedQuery);

  const relatedNiches: string[] = relatedResult.recordset.map((row: any) => row.related_niche_display_name);

  // Create the operator list object
  const operatorList: OperatorList = {
    niche: nicheRow.niche_display_name,
    description: nicheRow.description || undefined,
    lastUpdated: nicheRow.last_updated ? new Date(nicheRow.last_updated).toISOString().split('T')[0] : undefined,
    operators,
    relatedNiches: relatedNiches.length > 0 ? relatedNiches : undefined
  };

  // Determine filename from table name
  const filename = tableNameToFilename(tableName, nicheRow.niche_display_name);

  const filePath = path.join(outputDir, `${filename}.json`);

  // Write JSON file
  fs.writeFileSync(filePath, JSON.stringify(operatorList, null, 2));
  console.log(`  ✅ Migrated to ${filename}.json (${Object.keys(operators).length} operators)`);
}

async function migrateNichesFromSql(): Promise<void> {
  const outputDir = path.join(__dirname, '..', 'data', 'niche-lists');

  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`Created output directory: ${outputDir}`);
  }

  console.log(`Output directory: ${outputDir}\n`);

  const dbConfig = getDbConfig();
  const pool = typeof dbConfig === 'string'
    ? new sql.ConnectionPool(dbConfig)
    : new sql.ConnectionPool(dbConfig);

  try {
    const serverName = typeof dbConfig === 'string'
      ? dbConfig.split('Server=')[1]?.split(';')[0] || 'Azure SQL'
      : dbConfig.server;
    const databaseName = typeof dbConfig === 'string'
      ? dbConfig.split('Database=')[1]?.split(';')[0] || 'database'
      : dbConfig.database;

    console.log(`Connecting to Azure SQL Database: ${databaseName} on ${serverName}...`);
    await pool.connect();
    console.log('Connected successfully\n');

    // Check if niches schema exists
    const schemaCheck = await pool.request().query(`
      SELECT COUNT(*) as count 
      FROM sys.schemas 
      WHERE name = 'niches'
    `);

    if (schemaCheck.recordset[0].count === 0) {
      console.error('Error: niches schema does not exist in the database.');
      console.log('Nothing to migrate.');
      process.exit(0);
    }

    // Load all niches
    console.log('Loading niches from database...');
    const nichesQuery = 'SELECT id, niche_display_name, description, last_updated, table_name FROM niches.niches ORDER BY niche_display_name';
    const nichesResult = await pool.request().query(nichesQuery);

    if (nichesResult.recordset.length === 0) {
      console.log('No niches found in the database.');
      process.exit(0);
    }

    console.log(`Found ${nichesResult.recordset.length} niches to migrate\n`);

    // Migrate each niche
    console.log('Migrating niches to JSON files...\n');
    for (const nicheRow of nichesResult.recordset) {
      console.log(`Migrating ${nicheRow.niche_display_name}...`);
      try {
        await migrateNicheToJson(pool, nicheRow, outputDir);
      } catch (error: any) {
        console.error(`  ❌ Error migrating ${nicheRow.niche_display_name}:`, error.message);
      }
    }

    console.log(`\n✅ Successfully migrated ${nichesResult.recordset.length} niche(s) to JSON files!`);
    console.log(`Files written to: ${outputDir}`);

  } catch (error: any) {
    console.error('Error migrating niches from SQL:', error);
    throw error;
  } finally {
    await pool.close();
    console.log('\nDatabase connection closed');
  }
}

// Run the migration
migrateNichesFromSql()
  .then(() => {
    console.log('\nMigration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nMigration failed:', error);
    process.exit(1);
  });

