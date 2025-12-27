/**
 * Utility functions for working with operator lists
 * Migrated to use SQL database instead of JSON files
 */

import * as sql from 'mssql';
import { OperatorList, OperatorListCollection } from './niche-list-types';

// Database connection pool (singleton)
let pool: sql.ConnectionPool | null = null;

/**
 * Get or create database connection pool
 */
async function getDbPool(): Promise<sql.ConnectionPool> {
  if (pool && pool.connected) {
    return pool;
  }

  // Database configuration from environment variables
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

  const dbConfig = getDbConfig();
  pool = typeof dbConfig === 'string'
    ? new sql.ConnectionPool(dbConfig)
    : new sql.ConnectionPool(dbConfig);
  
  await pool.connect();
  return pool;
}

/**
 * Convert database row to OperatorList
 */
function rowToOperatorList(row: any, operators: Record<string, string>, relatedNiches: string[]): OperatorList {
  return {
    niche: row.niche_display_name,
    description: row.description || undefined,
    lastUpdated: row.last_updated ? new Date(row.last_updated).toISOString().split('T')[0] : undefined,
    operators,
    relatedNiches: relatedNiches.length > 0 ? relatedNiches : undefined
  };
}

/**
 * Loads all operator lists from the SQL database
 */
export async function loadAllNicheLists(): Promise<OperatorListCollection> {
  try {
    const dbPool = await getDbPool();
    const collection: OperatorListCollection = {};

    // Load all niches
    const nichesQuery = 'SELECT id, niche_display_name, description, last_updated, table_name FROM niches.niches ORDER BY niche_display_name';
    const nichesResult = await dbPool.request().query(nichesQuery);

    for (const nicheRow of nichesResult.recordset) {
      const tableName = nicheRow.table_name;
      
      if (!tableName) {
        console.warn(`Niche ${nicheRow.niche_display_name} has no table_name, skipping operators`);
        continue;
      }

      // Load operators for this niche from its dedicated table
      const escapedTableName = `[${tableName}]`;
      const operatorsQuery = `SELECT operator_name, note FROM niches.${escapedTableName}`;
      const operatorsResult = await dbPool.request().query(operatorsQuery);

      const operators: Record<string, string> = {};
      for (const opRow of operatorsResult.recordset) {
        operators[opRow.operator_name] = opRow.note || '';
      }

      // Load related niches for this niche
      const nicheId = nicheRow.id;
      const relatedQuery = 'SELECT related_niche_display_name FROM niches.niche_related_niches WHERE niche_id = @niche_id';
      const relatedRequest = dbPool.request();
      relatedRequest.input('niche_id', sql.Int, nicheId);
      const relatedResult = await relatedRequest.query(relatedQuery);

      const relatedNiches: string[] = relatedResult.recordset.map((row: any) => row.related_niche_display_name);

      collection[nicheRow.niche_display_name] = rowToOperatorList(nicheRow, operators, relatedNiches);
    }

    return collection;
  } catch (error) {
    console.error('Error loading niche lists from database:', error);
    return {};
  }
}

/**
 * Loads a specific operator list by niche name from SQL database
 */
export async function loadNicheList(niche: string): Promise<OperatorList | null> {
  try {
    const dbPool = await getDbPool();
    const decodedNiche = decodeURIComponent(niche);

    // Find niche by display name (case-insensitive)
    const nicheQuery = `
      SELECT id, niche_display_name, description, last_updated, table_name 
      FROM niches.niches 
      WHERE LOWER(niche_display_name) = LOWER(@niche_name)
    `;
    const nicheRequest = dbPool.request();
    nicheRequest.input('niche_name', sql.NVarChar(255), decodedNiche);
    const nicheResult = await nicheRequest.query(nicheQuery);

    if (nicheResult.recordset.length === 0) {
      return null;
    }

    const nicheRow = nicheResult.recordset[0];
    const nicheId = nicheRow.id;
    const tableName = nicheRow.table_name;

    if (!tableName) {
      console.warn(`Niche ${nicheRow.niche_display_name} has no table_name`);
      return null;
    }

    // Load operators for this niche from its dedicated table
    const escapedTableName = `[${tableName}]`;
    const operatorsQuery = `SELECT operator_name, note FROM niches.${escapedTableName}`;
    const operatorsResult = await dbPool.request().query(operatorsQuery);

    const operators: Record<string, string> = {};
    for (const opRow of operatorsResult.recordset) {
      operators[opRow.operator_name] = opRow.note || '';
    }

    // Load related niches for this niche
    const relatedQuery = 'SELECT related_niche_display_name FROM niches.niche_related_niches WHERE niche_id = @niche_id';
    const relatedRequest = dbPool.request();
    relatedRequest.input('niche_id', sql.Int, nicheId);
    const relatedResult = await relatedRequest.query(relatedQuery);

    const relatedNiches: string[] = relatedResult.recordset.map((row: any) => row.related_niche_display_name);

    return rowToOperatorList(nicheRow, operators, relatedNiches);
  } catch (error) {
    console.error(`Error loading niche list "${niche}" from database:`, error);
    return null;
  }
}

/**
 * Saves an operator list to the SQL database
 */
export async function saveNicheList(operatorList: OperatorList): Promise<void> {
  try {
    const dbPool = await getDbPool();

    // Check if niche exists
    const checkQuery = 'SELECT id FROM niches.niches WHERE niche_display_name = @niche_name';
    const checkRequest = dbPool.request();
    checkRequest.input('niche_name', sql.NVarChar(255), operatorList.niche);
    const checkResult = await checkRequest.query(checkQuery);

    const transaction = new sql.Transaction(dbPool);
    await transaction.begin();

    try {
      let nicheId: number;

      // Generate table name from display name
      const sanitized = operatorList.niche.toLowerCase().replace(/[^a-z0-9_]/g, '_');
      const tableName = sanitized.length > 120 
        ? sanitized.substring(0, 120) + '_operators'
        : sanitized + '_operators';

      if (checkResult.recordset.length > 0) {
        // Update existing niche
        nicheId = checkResult.recordset[0].id;
        const updateRequest = new sql.Request(transaction);
        updateRequest.input('niche_id', sql.Int, nicheId);
        updateRequest.input('description', sql.NVarChar(sql.MAX), operatorList.description || null);
        updateRequest.input('last_updated', sql.Date, operatorList.lastUpdated ? new Date(operatorList.lastUpdated) : new Date());
        updateRequest.input('table_name', sql.NVarChar(255), tableName);
        await updateRequest.query(`
          UPDATE niches.niches 
          SET description = @description, last_updated = @last_updated, table_name = @table_name
          WHERE id = @niche_id
        `);
      } else {
        // Insert new niche
        const insertQuery = `
          INSERT INTO niches.niches (niche_display_name, description, last_updated, table_name)
          OUTPUT INSERTED.id
          VALUES (@niche_name, @description, @last_updated, @table_name)
        `;
        const insertRequest = new sql.Request(transaction);
        insertRequest.input('niche_name', sql.NVarChar(255), operatorList.niche);
        insertRequest.input('description', sql.NVarChar(sql.MAX), operatorList.description || null);
        insertRequest.input('last_updated', sql.Date, operatorList.lastUpdated ? new Date(operatorList.lastUpdated) : new Date());
        insertRequest.input('table_name', sql.NVarChar(255), tableName);
        const insertResult = await insertRequest.query(insertQuery);
        nicheId = insertResult.recordset[0].id;
      }

      // Ensure table exists
      const escapedTableName = `[${tableName}]`;
      const createTableSQL = `
        IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = '${tableName}' AND schema_id = SCHEMA_ID('niches'))
        BEGIN
          CREATE TABLE niches.${escapedTableName} (
            operator_name NVARCHAR(255) PRIMARY KEY,
            note NVARCHAR(MAX)
          );
        END
      `;
      await new sql.Request(transaction).query(createTableSQL);

      // Update operators
      await new sql.Request(transaction).query(`DELETE FROM niches.${escapedTableName}`);

      for (const [operatorName, note] of Object.entries(operatorList.operators)) {
        const insertOpRequest = new sql.Request(transaction);
        insertOpRequest.input('operator_name', sql.NVarChar(255), operatorName);
        insertOpRequest.input('note', sql.NVarChar(sql.MAX), note || null);
        await insertOpRequest.query(
          `INSERT INTO niches.${escapedTableName} (operator_name, note) VALUES (@operator_name, @note)`
        );
      }

      // Update related niches
      const deleteRelatedRequest = new sql.Request(transaction);
      deleteRelatedRequest.input('niche_id', sql.Int, nicheId);
      await deleteRelatedRequest.query('DELETE FROM niches.niche_related_niches WHERE niche_id = @niche_id');

      if (operatorList.relatedNiches) {
        for (const relatedNiche of operatorList.relatedNiches) {
          const insertRelatedRequest = new sql.Request(transaction);
          insertRelatedRequest.input('niche_id', sql.Int, nicheId);
          insertRelatedRequest.input('related_niche_display_name', sql.NVarChar(255), relatedNiche);
          await insertRelatedRequest.query(
            'INSERT INTO niches.niche_related_niches (niche_id, related_niche_display_name) VALUES (@niche_id, @related_niche_display_name)'
          );
        }
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error saving niche list to database:', error);
    throw error;
  }
}

/**
 * Validates that all operator IDs in an operator list exist in the operators data
 */
export function validateNicheList(operatorList: OperatorList, operatorsData: Record<string, any>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const operatorId of Object.keys(operatorList.operators)) {
    if (!operatorsData[operatorId]) {
      errors.push(`Operator ${operatorId} in ${operatorList.niche} not found in operators data`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Gets all niches (as display names) that include a specific operator
 */
export async function getNichesForOperator(operatorId: string): Promise<string[]> {
  try {
    const dbPool = await getDbPool();
    
    // Get all niches with their table names
    const nichesQuery = 'SELECT niche_display_name, table_name FROM niches.niches WHERE table_name IS NOT NULL';
    const nichesResult = await dbPool.request().query(nichesQuery);
    
    const matchingNiches: string[] = [];
    
    // Check each niche's table for the operator
    for (const nicheRow of nichesResult.recordset) {
      const tableName = nicheRow.table_name;
      const escapedTableName = `[${tableName}]`;
      
      try {
        const operatorQuery = `SELECT COUNT(*) as count FROM niches.${escapedTableName} WHERE operator_name = @operator_id`;
        const operatorRequest = dbPool.request();
        operatorRequest.input('operator_id', sql.NVarChar(255), operatorId);
        const operatorResult = await operatorRequest.query(operatorQuery);
        
        if (operatorResult.recordset[0].count > 0) {
          matchingNiches.push(nicheRow.niche_display_name);
        }
      } catch (error) {
        // Table might not exist, skip it
        continue;
      }
    }
    
    return matchingNiches;
  } catch (error) {
    console.error('Error getting niches for operator:', error);
    return [];
  }
}

/**
 * Close database connection (for cleanup)
 */
export async function closeDbConnection(): Promise<void> {
  if (pool) {
    await pool.close();
    pool = null;
  }
}
