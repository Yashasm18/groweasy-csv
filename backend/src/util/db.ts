import { Pool } from "pg";
import { config } from "../config";
import { logger } from "./logger";
import { CrmLead } from "../domain/crm";

let pool: Pool | null = null;

export const initDb = async () => {
  if (!config.DATABASE_URL) {
    logger.warn("No DATABASE_URL provided. Database persistence is disabled.");
    return;
  }

  try {
    pool = new Pool({
      connectionString: config.DATABASE_URL,
      // Render PostgreSQL requires SSL in production usually, but we don't know the environment.
      // A common pattern is to allow unauthorized SSL if it's not localhost.
      ssl: config.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
    });

    // Create table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id SERIAL PRIMARY KEY,
        created_at VARCHAR(255),
        name VARCHAR(255),
        email VARCHAR(255),
        country_code VARCHAR(10),
        mobile_without_country_code VARCHAR(50),
        company VARCHAR(255),
        city VARCHAR(255),
        state VARCHAR(255),
        country VARCHAR(255),
        lead_owner VARCHAR(255),
        crm_status VARCHAR(50),
        crm_note TEXT,
        data_source VARCHAR(100),
        possession_time VARCHAR(255),
        description TEXT,
        imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    logger.info("Database initialized and connected successfully.");
  } catch (error: any) {
    logger.error("Failed to connect to database or create tables", { error: error.message });
    pool = null; // Disable persistence if connection fails
  }
};

export const saveLeadsToDb = async (leads: CrmLead[]) => {
  if (!pool || leads.length === 0) return;

  const client = await pool.connect();
  try {
    // Insert leads in a transaction for safety and speed
    await client.query('BEGIN');
    
    for (const lead of leads) {
      await client.query(`
        INSERT INTO leads (
          created_at, name, email, country_code, mobile_without_country_code,
          company, city, state, country, lead_owner, crm_status, crm_note,
          data_source, possession_time, description
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      `, [
        lead.created_at, lead.name, lead.email, lead.country_code, lead.mobile_without_country_code,
        lead.company, lead.city, lead.state, lead.country, lead.lead_owner, lead.crm_status, lead.crm_note,
        lead.data_source, lead.possession_time, lead.description
      ]);
    }
    
    await client.query('COMMIT');
    logger.info(`Successfully saved ${leads.length} leads to database.`);
  } catch (error: any) {
    await client.query('ROLLBACK');
    logger.error("Failed to save leads to database", { error: error.message });
    throw error;
  } finally {
    client.release();
  }
};
