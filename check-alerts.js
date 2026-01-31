const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function checkAlerts() {
  console.log('Checking price alerts...');
  
  // Get all active alerts
  const alerts = await pool.query('SELECT * FROM price_alerts WHERE is_active = true');
  
  for (const alert of alerts.rows) {
    let query = 'SELECT * FROM transactions WHERE instance_date > COALESCE(, NOW() - INTERVAL \'1 day\')';
    const params = [alert.last_triggered_at];
    let p = 1;

    if (alert.area_name) { p++; query += ` AND LOWER(area_name_en) LIKE LOWER($${p})`; params.push(`%${alert.area_name}%`); }
    if (alert.building_name) { p++; query += ` AND LOWER(building_name_en) LIKE LOWER($${p})`; params.push(`%${alert.building_name}%`); }
    if (alert.property_type) { p++; query += ` AND LOWER(property_type_en) = LOWER($${p})`; params.push(alert.property_type); }

    // Add price condition
    if (alert.alert_type === 'price_below') {
      p++; query += ` AND actual_worth < $${p}`; params.push(alert.threshold);
    } else if (alert.alert_type === 'price_above') {
      p++; query += ` AND actual_worth > $${p}`; params.push(alert.threshold);
    } else if (alert.alert_type === 'price_sqm_below') {
      p++; query += ` AND meter_sale_price < $${p}`; params.push(alert.threshold);
    } else if (alert.alert_type === 'price_sqm_above') {
      p++; query += ` AND meter_sale_price > $${p}`; params.push(alert.threshold);
    }

    const matches = await pool.query(query, params);
    
    if (matches.rows.length > 0) {
      console.log(`Alert ${alert.id} triggered: ${matches.rows.length} matching transactions`);
      
      for (const tx of matches.rows) {
        await pool.query(
          'INSERT INTO alert_triggers (alert_id, transaction_id) VALUES (, )',
          [alert.id, tx.id]
        );
      }
      
      await pool.query(
        'UPDATE price_alerts SET last_triggered_at = NOW() WHERE id = ',
        [alert.id]
      );

      // Get user for notification
      const user = await pool.query('SELECT * FROM users WHERE id = ', [alert.user_id]);
      if (user.rows[0]?.telegram_chat_id) {
        console.log(`TODO: Send Telegram notification to ${user.rows[0].telegram_chat_id}`);
        // Telegram notification would go here
      }
    }
  }
  
  console.log('Alert check complete');
  process.exit(0);
}

checkAlerts().catch(err => {
  console.error(err);
  process.exit(1);
});
