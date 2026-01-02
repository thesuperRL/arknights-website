/**
 * Script to migrate niche lists from JSON files to SQL database
 * 
 * Creates a "niches" schema and migrates all niche list data
 */

// Load environment variables from .env file
import dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';
import * as sql from 'mssql';
import { OperatorList } from './niche-list-types';

// Database configuration (reuse from account-storage)
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

// SQL schema creation
const createSchemaSQL = `
-- Create niches schema
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'niches')
BEGIN
  EXEC('CREATE SCHEMA niches');
END

-- Niches table (metadata)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'niches' AND schema_id = SCHEMA_ID('niches'))
BEGIN
  CREATE TABLE niches.niches (
    id INT IDENTITY(1,1) PRIMARY KEY,
    niche_display_name NVARCHAR(255) UNIQUE NOT NULL,
    description NVARCHAR(MAX),
    last_updated DATE,
    table_name NVARCHAR(255) UNIQUE NOT NULL -- Sanitized table name for this niche's operators (e.g., 'healing_operators')
  );
END

-- Related niches table (self-referential, stores by display name)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'niche_related_niches' AND schema_id = SCHEMA_ID('niches'))
BEGIN
  CREATE TABLE niches.niche_related_niches (
    niche_id INT NOT NULL,
    related_niche_display_name NVARCHAR(255) NOT NULL,
    PRIMARY KEY (niche_id, related_niche_display_name),
    FOREIGN KEY (niche_id) REFERENCES niches.niches(id) ON DELETE CASCADE
  );
END

-- Create indexes
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_niches_display_name' AND object_id = OBJECT_ID('niches.niches'))
BEGIN
  CREATE INDEX idx_niches_display_name ON niches.niches(niche_display_name);
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_niche_related_niches_niche_id' AND object_id = OBJECT_ID('niches.niche_related_niches'))
BEGIN
  CREATE INDEX idx_niche_related_niches_niche_id ON niches.niche_related_niches(niche_id);
END
`;

/**
 * Sanitize a display name to be a valid SQL table name
 */
function sanitizeTableName(displayName: string): string {
  // Replace invalid characters with underscores
  let sanitized = displayName.replace(/[^a-zA-Z0-9_]/g, '_');
  // Ensure it starts with a letter or underscore
  if (!/^[a-zA-Z_]/.test(sanitized)) {
    sanitized = 'niche_' + sanitized;
  }
  // Ensure it's not too long (SQL Server limit is 128 characters, but we'll use 120 to be safe)
  if (sanitized.length > 120) {
    sanitized = sanitized.substring(0, 120);
  }
  // Append _operators suffix
  sanitized = sanitized + '_operators';
  return sanitized.toLowerCase();
}

/**
 * Check if a column exists in a table
 */
async function columnExists(pool: sql.ConnectionPool, schema: string, table: string, column: string): Promise<boolean> {
  try {
    const result = await pool.request().query(`
      SELECT COUNT(*) as count
      FROM sys.columns
      WHERE object_id = OBJECT_ID('${schema}.${table}')
      AND name = '${column}'
    `);
    return result.recordset[0].count > 0;
  } catch (error) {
    return false;
  }
}

/**
 * Create a table for a specific niche's operators
 */
async function createNicheOperatorsTable(pool: sql.ConnectionPool, tableName: string): Promise<void> {
  const escapedTableName = `[${tableName}]`;
  const createTableSQL = `
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = '${tableName}' AND schema_id = SCHEMA_ID('niches'))
    BEGIN
      CREATE TABLE niches.${escapedTableName} (
        operator_name NVARCHAR(255) PRIMARY KEY,
        note NVARCHAR(MAX)
      );
      
      CREATE INDEX idx_${tableName}_operator_name ON niches.${escapedTableName}(operator_name);
    END
  `;
  await pool.request().query(createTableSQL);
}

async function createSchema(pool: sql.ConnectionPool): Promise<void> {
  console.log('Creating niches schema and base tables...');
  await pool.request().query(createSchemaSQL);
  
  // Add table_name column if it doesn't exist (migration from old schema)
  const hasTableNameColumn = await columnExists(pool, 'niches', 'niches', 'table_name');
  
  if (!hasTableNameColumn) {
    console.log('Migrating existing table: adding table_name column...');
    try {
      // Add the column as nullable first
      await pool.request().query(`
        ALTER TABLE niches.niches ADD table_name NVARCHAR(255) NULL;
      `);
      
      // Update existing rows to have table_name based on their display names
      const updateResult = await pool.request().query(`
        SELECT id, niche_display_name 
        FROM niches.niches 
        WHERE table_name IS NULL
      `);
      
      for (const row of updateResult.recordset) {
        const tableName = sanitizeTableName(row.niche_display_name);
        const updateRequest = pool.request();
        updateRequest.input('id', sql.Int, row.id);
        updateRequest.input('table_name', sql.NVarChar(255), tableName);
        await updateRequest.query(`
          UPDATE niches.niches 
          SET table_name = @table_name 
          WHERE id = @id
        `);
      }
      
      // Make table_name NOT NULL after populating it
      await pool.request().query(`
        ALTER TABLE niches.niches 
        ALTER COLUMN table_name NVARCHAR(255) NOT NULL;
      `);
      
      // Add unique constraint
      try {
        await pool.request().query(`
          ALTER TABLE niches.niches 
          ADD CONSTRAINT UQ_niches_table_name UNIQUE (table_name);
        `);
      } catch (error: any) {
        // Constraint might already exist, that's okay
        if (!error.message?.includes('already exists') && !error.message?.includes('duplicate')) {
          throw error;
        }
      }
      
      console.log('  Migration completed: table_name column added and populated');
    } catch (error: any) {
      console.error('Warning: Could not migrate table_name column:', error.message);
      throw error;
    }
  }
  
  console.log('Schema and base tables created successfully');
}

async function clearExistingData(pool: sql.ConnectionPool): Promise<void> {
  console.log('Clearing existing niche data...');
  
  // Get all niche table names (check if column exists first)
  try {
    const tablesQuery = 'SELECT table_name FROM niches.niches WHERE table_name IS NOT NULL';
    const tablesResult = await pool.request().query(tablesQuery);
    
    // Delete from all niche operator tables
    for (const row of tablesResult.recordset) {
      const tableName = row.table_name;
      const escapedTableName = `[${tableName}]`;
      try {
        await pool.request().query(`DELETE FROM niches.${escapedTableName}`);
        // Drop the table
        await pool.request().query(`DROP TABLE IF EXISTS niches.${escapedTableName}`);
      } catch (error) {
        // Table might not exist yet, that's okay
      }
    }
  } catch (error) {
    // table_name column might not exist yet, that's okay
    console.log('  Skipping table cleanup (table_name column may not exist yet)');
  }
  
  await pool.request().query('DELETE FROM niches.niche_related_niches');
  await pool.request().query('DELETE FROM niches.niches');
  console.log('Existing data cleared');
}

async function insertNiche(pool: sql.ConnectionPool, nicheList: OperatorList): Promise<{ id: number; tableName: string }> {
  const tableName = sanitizeTableName(nicheList.niche);
  
  const insertSQL = `
    INSERT INTO niches.niches (niche_display_name, description, last_updated, table_name)
    OUTPUT INSERTED.id, INSERTED.table_name
    VALUES (@niche_display_name, @description, @last_updated, @table_name)
  `;

  const request = pool.request();
  request.input('niche_display_name', sql.NVarChar(255), nicheList.niche);
  request.input('description', sql.NVarChar(sql.MAX), nicheList.description || null);
  request.input('last_updated', sql.Date, nicheList.lastUpdated ? new Date(nicheList.lastUpdated) : null);
  request.input('table_name', sql.NVarChar(255), tableName);

  const result = await request.query(insertSQL);
  return {
    id: result.recordset[0].id,
    tableName: result.recordset[0].table_name
  };
}

async function insertNicheOperators(pool: sql.ConnectionPool, tableName: string, operators: Record<string, string>): Promise<void> {
  if (Object.keys(operators).length === 0) return;

  // Create the table if it doesn't exist
  await createNicheOperatorsTable(pool, tableName);

  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    
    const escapedTableName = `[${tableName}]`;
    
    // Clear existing operators for this niche
    await new sql.Request(transaction).query(`DELETE FROM niches.${escapedTableName}`);

    // Insert all operators
    for (const [operatorName, note] of Object.entries(operators)) {
      const insertRequest = new sql.Request(transaction);
      insertRequest.input('operator_name', sql.NVarChar(255), operatorName);
      insertRequest.input('note', sql.NVarChar(sql.MAX), note || null);
      await insertRequest.query(`INSERT INTO niches.${escapedTableName} (operator_name, note) VALUES (@operator_name, @note)`);
    }
    
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function insertRelatedNiches(pool: sql.ConnectionPool, nicheId: number, relatedNiches: string[]): Promise<void> {
  if (relatedNiches.length === 0) return;

  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();

    // Clear existing related niches for this niche
    const deleteRequest = new sql.Request(transaction);
    deleteRequest.input('niche_id', sql.Int, nicheId);
    await deleteRequest.query('DELETE FROM niches.niche_related_niches WHERE niche_id = @niche_id');

    // Insert all related niches
    for (const relatedNiche of relatedNiches) {
      const insertRequest = new sql.Request(transaction);
      insertRequest.input('niche_id', sql.Int, nicheId);
      insertRequest.input('related_niche_display_name', sql.NVarChar(255), relatedNiche);
      await insertRequest.query(
        'INSERT INTO niches.niche_related_niches (niche_id, related_niche_display_name) VALUES (@niche_id, @related_niche_display_name)'
      );
    }

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function migrateNiches(): Promise<void> {
  const nicheListsDir = path.join(__dirname, '..', 'data', 'niche-lists');

  if (!fs.existsSync(nicheListsDir)) {
    console.error(`Error: niche-lists directory not found at ${nicheListsDir}`);
    process.exit(1);
  }

  console.log(`Reading niche lists from ${nicheListsDir}...`);
  const files = fs.readdirSync(nicheListsDir);
  const jsonFiles = files.filter(file =>
    file.endsWith('.json') && file !== 'README.md'
  );

  console.log(`Found ${jsonFiles.length} niche list files to migrate`);

  if (jsonFiles.length === 0) {
    console.log('No niche lists to migrate');
    return;
  }

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
    console.log('Connected successfully');

    // Create schema and migrate if needed
    await createSchema(pool);

    // Clear existing data (optional - set CLEAR_EXISTING=false to preserve)
    // Note: This should run AFTER createSchema which ensures table_name column exists
    const shouldClear = process.env.CLEAR_EXISTING !== 'false';
    if (shouldClear) {
      await clearExistingData(pool);
    }

    // Migrate niche lists
    console.log('\nMigrating niche lists...');
    for (const file of jsonFiles) {
      const filePath = path.join(nicheListsDir, file);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const nicheList: OperatorList = JSON.parse(content);

        if (!nicheList.operators || !nicheList.niche) {
          console.log(`  Skipping ${file} - invalid structure`);
          continue;
        }

        console.log(`  Migrating ${nicheList.niche}...`);

        const { id: nicheId, tableName } = await insertNiche(pool, nicheList);
        console.log(`    - Niche ID: ${nicheId}, Table: niches.${tableName}`);

        // Flatten rating-grouped structure to flat name-description pairs
        const flattenedOperators: Record<string, string> = {};
        if (nicheList.operators) {
          for (const operatorsInRating of Object.values(nicheList.operators)) {
            if (operatorsInRating) {
              Object.assign(flattenedOperators, operatorsInRating);
            }
          }
        }

        await insertNicheOperators(pool, tableName, flattenedOperators);
        console.log(`    - Added ${Object.keys(flattenedOperators).length} operators`);

        if (nicheList.relatedNiches && nicheList.relatedNiches.length > 0) {
          await insertRelatedNiches(pool, nicheId, nicheList.relatedNiches);
          console.log(`    - Added ${nicheList.relatedNiches.length} related niches`);
        }
      } catch (error: any) {
        console.error(`  Error migrating ${file}:`, error.message);
      }
    }

    console.log('\n✅ Successfully migrated all niche lists to the database!');

    // Print summary
    const result = await pool.request().query('SELECT COUNT(*) as count FROM niches.niches');
    console.log(`\nTotal niches in database: ${result.recordset[0].count}`);

    // Count operators across all niche tables
    const tablesQuery = 'SELECT table_name FROM niches.niches WHERE table_name IS NOT NULL';
    const tablesResult = await pool.request().query(tablesQuery);
    let totalOperators = 0;
    for (const row of tablesResult.recordset) {
      const tableName = row.table_name;
      const escapedTableName = `[${tableName}]`;
      try {
        const countResult = await pool.request().query(`SELECT COUNT(*) as count FROM niches.${escapedTableName}`);
        totalOperators += countResult.recordset[0].count;
      } catch (error) {
        // Table might not exist
      }
    }
    console.log(`Total niche-operator relationships: ${totalOperators}`);

    const relatedResult = await pool.request().query('SELECT COUNT(*) as count FROM niches.niche_related_niches');
    console.log(`Total related niche relationships: ${relatedResult.recordset[0].count}`);

  } catch (error: any) {
    console.error('Error migrating niches:', error);
    throw error;
  } finally {
    await pool.close();
    console.log('\nDatabase connection closed');
  }
}

// Run the migration
migrateNiches()
  .then(() => {
    console.log('\nMigration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nMigration failed:', error);
    process.exit(1);
  });

