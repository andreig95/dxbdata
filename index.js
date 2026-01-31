const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const JWT_SECRET = process.env.JWT_SECRET || 'dxbdata-secret-change-in-production';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

// Generate JWT
const generateToken = (user) => jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });

// Auth middleware
const auth = async (req, res, next) => {
  try {
    // Check for API key first
    const apiKey = req.headers['x-api-key'];
    if (apiKey) {
      const result = await pool.query('SELECT * FROM users WHERE api_key = $1', [apiKey]);
      if (result.rows.length > 0) { req.user = result.rows[0]; return next(); }
    }
    
    // Check for JWT token
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, JWT_SECRET);
      const result = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.id]);
      if (result.rows.length > 0) { req.user = result.rows[0]; return next(); }
    }
    
    res.status(401).json({ error: 'Authentication required' });
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Optional auth (for public endpoints that can be enhanced with auth)
const optionalAuth = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];
    const authHeader = req.headers.authorization;
    
    if (apiKey) {
      const result = await pool.query('SELECT * FROM users WHERE api_key = $1', [apiKey]);
      if (result.rows.length > 0) req.user = result.rows[0];
    } else if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, JWT_SECRET);
      const result = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.id]);
      if (result.rows.length > 0) req.user = result.rows[0];
    }
  } catch (err) { /* ignore auth errors for optional auth */ }
  next();
};

// Health check
app.get('/api/health', async (req, res) => {
  const txCount = await pool.query('SELECT COUNT(*) FROM transactions');
  const rentCount = await pool.query('SELECT COUNT(*) FROM rentals');
  res.json({ 
    status: 'ok', 
    service: 'dxbdata',
    transactions: parseInt(txCount.rows[0].count),
    rentals: parseInt(rentCount.rows[0].count)
  });
});

// ============ AUTHENTICATION ============

// Register with email/password
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    // Check if email exists
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) return res.status(400).json({ error: 'Email already registered' });

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, name, auth_provider, email_verified) 
       VALUES ($1, $2, $3, 'email', false) RETURNING id, email, name, api_key, created_at`,
      [email, passwordHash, name]
    );
    
    const user = result.rows[0];
    const token = generateToken(user);
    
    res.json({ user: { id: user.id, email: user.email, name: user.name, api_key: user.api_key }, token });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Login with email/password
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    
    const user = result.rows[0];
    if (!user.password_hash) return res.status(401).json({ error: 'Please login with Google' });
    
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = generateToken(user);
    res.json({ 
      user: { id: user.id, email: user.email, name: user.name, api_key: user.api_key, avatar_url: user.avatar_url }, 
      token 
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Google Sign-In
app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential, access_token } = req.body;
    
    let payload;
    
    if (credential) {
      // Verify Google ID token
      if (!googleClient) return res.status(500).json({ error: 'Google auth not configured' });
      const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
      payload = ticket.getPayload();
    } else if (access_token) {
      // Verify access token by fetching user info
      const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${access_token}` }
      });
      if (!response.ok) return res.status(401).json({ error: 'Invalid access token' });
      payload = await response.json();
      payload.sub = payload.sub || payload.id;
    } else {
      return res.status(400).json({ error: 'Google credential or access_token required' });
    }

    const { sub: googleId, email, name, picture } = payload;

    // Check if user exists
    let result = await pool.query('SELECT * FROM users WHERE google_id = $1', [googleId]);
    
    if (result.rows.length === 0) {
      // Check if email exists (link accounts)
      result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
      
      if (result.rows.length > 0) {
        // Link Google to existing account
        await pool.query(
          'UPDATE users SET google_id = $1, name = COALESCE(name, $2), avatar_url = $3, email_verified = true WHERE id = $4',
          [googleId, name, picture, result.rows[0].id]
        );
        result = await pool.query('SELECT * FROM users WHERE id = $1', [result.rows[0].id]);
      } else {
        // Create new user
        result = await pool.query(
          `INSERT INTO users (email, google_id, name, avatar_url, auth_provider, email_verified) 
           VALUES ($1, $2, $3, $4, 'google', true) RETURNING *`,
          [email, googleId, name, picture]
        );
      }
    }

    const user = result.rows[0];
    const token = generateToken(user);
    
    res.json({ 
      user: { id: user.id, email: user.email, name: user.name, api_key: user.api_key, avatar_url: user.avatar_url }, 
      token 
    });
  } catch (err) { 
    console.error('Google auth error:', err);
    res.status(500).json({ error: err.message }); 
  }
});

// Get current user
app.get('/api/auth/me', auth, (req, res) => {
  res.json({ 
    id: req.user.id, 
    email: req.user.email, 
    name: req.user.name,
    api_key: req.user.api_key,
    avatar_url: req.user.avatar_url,
    telegram_chat_id: req.user.telegram_chat_id
  });
});

// Update profile
app.patch('/api/auth/me', auth, async (req, res) => {
  try {
    const { name, telegram_chat_id } = req.body;
    const updates = [];
    const params = [req.user.id];
    let p = 1;

    if (name !== undefined) { p++; updates.push(`name = $${p}`); params.push(name); }
    if (telegram_chat_id !== undefined) { p++; updates.push(`telegram_chat_id = $${p}`); params.push(telegram_chat_id); }

    if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });

    const result = await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $1 RETURNING id, email, name, telegram_chat_id, api_key, avatar_url`,
      params
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Change password
app.post('/api/auth/change-password', auth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!new_password || new_password.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    // If user has password, verify current
    if (req.user.password_hash) {
      if (!current_password) return res.status(400).json({ error: 'Current password required' });
      const valid = await bcrypt.compare(current_password, req.user.password_hash);
      if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const passwordHash = await bcrypt.hash(new_password, 12);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, req.user.id]);
    
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Regenerate API key
app.post('/api/auth/regenerate-api-key', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE users SET api_key = gen_random_uuid() WHERE id = $1 RETURNING api_key',
      [req.user.id]
    );
    res.json({ api_key: result.rows[0].api_key });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ WATCHLISTS ============

app.get('/api/watchlists', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM watchlists WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/watchlists', auth, async (req, res) => {
  try {
    const { name, area_name, building_name, property_type, min_size, max_size } = req.body;
    if (!name) return res.status(400).json({ error: 'Watchlist name required' });

    const result = await pool.query(
      `INSERT INTO watchlists (user_id, name, area_name, building_name, property_type, min_size, max_size) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.user.id, name, area_name, building_name, property_type, min_size, max_size]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/watchlists/:id', auth, async (req, res) => {
  try {
    const wl = await pool.query('SELECT * FROM watchlists WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (wl.rows.length === 0) return res.status(404).json({ error: 'Watchlist not found' });
    
    const watchlist = wl.rows[0];
    let query = 'SELECT * FROM transactions WHERE 1=1';
    const params = [];
    let p = 0;

    if (watchlist.area_name) { p++; query += ` AND LOWER(area_name_en) LIKE LOWER($${p})`; params.push(`%${watchlist.area_name}%`); }
    if (watchlist.building_name) { p++; query += ` AND LOWER(building_name_en) LIKE LOWER($${p})`; params.push(`%${watchlist.building_name}%`); }
    if (watchlist.property_type) { p++; query += ` AND LOWER(property_type_en) = LOWER($${p})`; params.push(watchlist.property_type); }
    if (watchlist.min_size) { p++; query += ` AND procedure_area >= $${p}`; params.push(watchlist.min_size); }
    if (watchlist.max_size) { p++; query += ` AND procedure_area <= $${p}`; params.push(watchlist.max_size); }

    query += ' ORDER BY instance_date DESC LIMIT 50';
    const txs = await pool.query(query, params);
    res.json({ watchlist, recent_transactions: txs.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/watchlists/:id', auth, async (req, res) => {
  try {
    await pool.query('DELETE FROM watchlists WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ PRICE ALERTS ============

app.get('/api/alerts', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM price_alerts WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/alerts', auth, async (req, res) => {
  try {
    const { area_name, building_name, property_type, alert_type, threshold } = req.body;
    
    const validTypes = ['price_below', 'price_above', 'price_sqm_below', 'price_sqm_above', 'new_transaction'];
    if (!validTypes.includes(alert_type)) {
      return res.status(400).json({ error: `Invalid alert_type. Must be one of: ${validTypes.join(', ')}` });
    }
    
    if (alert_type !== 'new_transaction' && !threshold) {
      return res.status(400).json({ error: 'Threshold required for price alerts' });
    }

    const result = await pool.query(
      `INSERT INTO price_alerts (user_id, area_name, building_name, property_type, alert_type, threshold) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.user.id, area_name, building_name, property_type, alert_type, threshold]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/alerts/:id', auth, async (req, res) => {
  try {
    const { is_active, threshold } = req.body;
    const updates = [];
    const params = [req.params.id, req.user.id];
    let p = 2;

    if (is_active !== undefined) { p++; updates.push(`is_active = $${p}`); params.push(is_active); }
    if (threshold !== undefined) { p++; updates.push(`threshold = $${p}`); params.push(threshold); }

    if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });

    const result = await pool.query(
      `UPDATE price_alerts SET ${updates.join(', ')} WHERE id = $1 AND user_id = $2 RETURNING *`,
      params
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Alert not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/alerts/:id', auth, async (req, res) => {
  try {
    await pool.query('DELETE FROM price_alerts WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/alerts/:id/history', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT at.*, t.area_name_en, t.building_name_en, t.actual_worth, t.meter_sale_price, t.procedure_area
      FROM alert_triggers at
      JOIN price_alerts pa ON at.alert_id = pa.id
      LEFT JOIN transactions t ON at.transaction_id = t.id
      WHERE pa.id = $1 AND pa.user_id = $2
      ORDER BY at.triggered_at DESC LIMIT 50
    `, [req.params.id, req.user.id]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ TRANSACTIONS ============

app.get('/api/transactions', optionalAuth, async (req, res) => {
  try {
    const { limit = 100, offset = 0, area, building, property_type, min_price, max_price,
            min_size, max_size, from_date, to_date, sort = 'instance_date', order = 'DESC' } = req.query;

    let query = 'SELECT * FROM transactions WHERE 1=1';
    const params = [];
    let p = 0;

    if (area) { p++; query += ` AND LOWER(area_name_en) LIKE LOWER($${p})`; params.push(`%${area}%`); }
    if (building) { p++; query += ` AND LOWER(building_name_en) LIKE LOWER($${p})`; params.push(`%${building}%`); }
    if (property_type) { p++; query += ` AND LOWER(property_type_en) = LOWER($${p})`; params.push(property_type); }
    if (min_price) { p++; query += ` AND actual_worth >= $${p}`; params.push(parseFloat(min_price)); }
    if (max_price) { p++; query += ` AND actual_worth <= $${p}`; params.push(parseFloat(max_price)); }
    if (min_size) { p++; query += ` AND procedure_area >= $${p}`; params.push(parseFloat(min_size)); }
    if (max_size) { p++; query += ` AND procedure_area <= $${p}`; params.push(parseFloat(max_size)); }
    if (from_date) { p++; query += ` AND instance_date >= $${p}`; params.push(from_date); }
    if (to_date) { p++; query += ` AND instance_date <= $${p}`; params.push(to_date); }

    const allowedSorts = ['instance_date', 'actual_worth', 'meter_sale_price', 'procedure_area'];
    const sortCol = allowedSorts.includes(sort) ? sort : 'instance_date';
    query += ` ORDER BY ${sortCol} ${order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'} NULLS LAST`;
    
    p++; query += ` LIMIT $${p}`; params.push(Math.min(parseInt(limit), 500));
    p++; query += ` OFFSET $${p}`; params.push(parseInt(offset));

    const result = await pool.query(query, params);
    res.json({ total: result.rowCount, limit: parseInt(limit), offset: parseInt(offset), data: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/transactions/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM transactions WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ RENTALS ============

app.get('/api/rentals', async (req, res) => {
  try {
    const { limit = 100, offset = 0, area, property_type, min_rent, max_rent,
            min_size, max_size, from_date, to_date, sort = 'contract_start_date', order = 'DESC' } = req.query;

    let query = 'SELECT * FROM rentals WHERE 1=1';
    const params = [];
    let p = 0;

    if (area) { p++; query += ` AND LOWER(area_name_en) LIKE LOWER($${p})`; params.push(`%${area}%`); }
    if (property_type) { p++; query += ` AND LOWER(property_type_en) = LOWER($${p})`; params.push(property_type); }
    if (min_rent) { p++; query += ` AND annual_amount >= $${p}`; params.push(parseFloat(min_rent)); }
    if (max_rent) { p++; query += ` AND annual_amount <= $${p}`; params.push(parseFloat(max_rent)); }
    if (min_size) { p++; query += ` AND actual_area >= $${p}`; params.push(parseFloat(min_size)); }
    if (max_size) { p++; query += ` AND actual_area <= $${p}`; params.push(parseFloat(max_size)); }
    if (from_date) { p++; query += ` AND contract_start_date >= $${p}`; params.push(from_date); }
    if (to_date) { p++; query += ` AND contract_start_date <= $${p}`; params.push(to_date); }

    const allowedSorts = ['contract_start_date', 'annual_amount', 'actual_area'];
    const sortCol = allowedSorts.includes(sort) ? sort : 'contract_start_date';
    query += ` ORDER BY ${sortCol} ${order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'} NULLS LAST`;
    
    p++; query += ` LIMIT $${p}`; params.push(Math.min(parseInt(limit), 500));
    p++; query += ` OFFSET $${p}`; params.push(parseInt(offset));

    const result = await pool.query(query, params);
    res.json({ total: result.rowCount, limit: parseInt(limit), offset: parseInt(offset), data: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/rentals/stats', async (req, res) => {
  try {
    const { area, property_type, year } = req.query;
    let where = 'WHERE 1=1';
    const params = [];
    let p = 0;

    if (area) { p++; where += ` AND LOWER(area_name_en) LIKE LOWER($${p})`; params.push(`%${area}%`); }
    if (property_type) { p++; where += ` AND LOWER(property_type_en) = LOWER($${p})`; params.push(property_type); }
    if (year) { p++; where += ` AND EXTRACT(YEAR FROM contract_start_date) = $${p}`; params.push(parseInt(year)); }

    const result = await pool.query(`
      SELECT COUNT(*) as total_contracts, AVG(annual_amount) as avg_annual_rent,
             AVG(annual_amount / NULLIF(actual_area, 0)) as avg_rent_sqm,
             MIN(annual_amount) as min_rent, MAX(annual_amount) as max_rent
      FROM rentals ${where}
    `, params);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ AREAS ============

app.get('/api/areas', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT area_name_en, COUNT(*) as transaction_count,
             AVG(meter_sale_price) as avg_price_sqm, AVG(actual_worth) as avg_price
      FROM transactions WHERE area_name_en IS NOT NULL AND area_name_en != ''
      GROUP BY area_name_en ORDER BY transaction_count DESC
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/areas/compare', async (req, res) => {
  try {
    const { areas, years = 3 } = req.query;
    if (!areas) return res.status(400).json({ error: 'areas parameter required' });

    const areaList = areas.split(',').map(a => a.trim().toLowerCase());
    const placeholders = areaList.map((_, i) => `$${i + 1}`).join(',');

    const salesResult = await pool.query(`
      SELECT area_name_en, COUNT(*) as total_transactions, AVG(actual_worth) as avg_price,
             AVG(meter_sale_price) as avg_price_sqm
      FROM transactions 
      WHERE LOWER(area_name_en) IN (${placeholders})
        AND instance_date >= NOW() - INTERVAL '${parseInt(years)} years'
      GROUP BY area_name_en
    `, areaList);

    const rentalResult = await pool.query(`
      SELECT area_name_en, COUNT(*) as total_contracts, AVG(annual_amount) as avg_annual_rent
      FROM rentals 
      WHERE LOWER(area_name_en) IN (${placeholders})
        AND contract_start_date >= NOW() - INTERVAL '${parseInt(years)} years'
      GROUP BY area_name_en
    `, areaList);

    const comparison = areaList.map(area => {
      const sales = salesResult.rows.find(r => r.area_name_en?.toLowerCase() === area) || {};
      const rentals = rentalResult.rows.find(r => r.area_name_en?.toLowerCase() === area) || {};
      const avgPrice = parseFloat(sales.avg_price) || 0;
      const avgRent = parseFloat(rentals.avg_annual_rent) || 0;
      return {
        area,
        sales: { transactions: parseInt(sales.total_transactions) || 0, avg_price: avgPrice, avg_price_sqm: parseFloat(sales.avg_price_sqm) || 0 },
        rentals: { contracts: parseInt(rentals.total_contracts) || 0, avg_annual_rent: avgRent },
        gross_yield_pct: avgPrice > 0 && avgRent > 0 ? ((avgRent / avgPrice) * 100).toFixed(2) : null
      };
    });
    res.json({ years: parseInt(years), comparison });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/areas/top-yields', async (req, res) => {
  try {
    const { min_transactions = 50, years = 2 } = req.query;
    const result = await pool.query(`
      WITH sales AS (
        SELECT area_name_en, AVG(actual_worth) as avg_price, COUNT(*) as tx_count
        FROM transactions WHERE instance_date >= NOW() - INTERVAL '${parseInt(years)} years' AND actual_worth > 0
        GROUP BY area_name_en HAVING COUNT(*) >= $1
      ),
      rents AS (
        SELECT area_name_en, AVG(annual_amount) as avg_rent
        FROM rentals WHERE contract_start_date >= NOW() - INTERVAL '${parseInt(years)} years' AND annual_amount > 0
        GROUP BY area_name_en
      )
      SELECT s.area_name_en as area, s.avg_price, s.tx_count, r.avg_rent,
             ROUND((r.avg_rent / s.avg_price * 100)::numeric, 2) as gross_yield_pct
      FROM sales s JOIN rents r ON LOWER(s.area_name_en) = LOWER(r.area_name_en)
      WHERE r.avg_rent > 0 AND s.avg_price > 0
      ORDER BY gross_yield_pct DESC LIMIT 20
    `, [parseInt(min_transactions)]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ BUILDINGS ============

app.get('/api/buildings', async (req, res) => {
  try {
    const { area, min_transactions = 5 } = req.query;
    let where = "WHERE building_name_en IS NOT NULL AND building_name_en != ''";
    const params = [parseInt(min_transactions)];
    
    if (area) { params.push(`%${area}%`); where += ` AND LOWER(area_name_en) LIKE LOWER($2)`; }

    const result = await pool.query(`
      SELECT building_name_en, area_name_en, COUNT(*) as transaction_count,
             AVG(meter_sale_price) as avg_price_sqm, AVG(actual_worth) as avg_price
      FROM transactions ${where}
      GROUP BY building_name_en, area_name_en HAVING COUNT(*) >= $1
      ORDER BY transaction_count DESC LIMIT 100
    `, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ STATS & TRENDS ============

app.get('/api/stats', async (req, res) => {
  try {
    const { area, property_type, year } = req.query;
    let where = 'WHERE 1=1';
    const params = [];
    let p = 0;

    if (area) { p++; where += ` AND LOWER(area_name_en) LIKE LOWER($${p})`; params.push(`%${area}%`); }
    if (property_type) { p++; where += ` AND LOWER(property_type_en) = LOWER($${p})`; params.push(property_type); }
    if (year) { p++; where += ` AND EXTRACT(YEAR FROM instance_date) = $${p}`; params.push(parseInt(year)); }

    const result = await pool.query(`
      SELECT COUNT(*) as total_transactions, SUM(actual_worth) as total_value,
             AVG(actual_worth) as avg_price, AVG(meter_sale_price) as avg_price_sqm
      FROM transactions ${where}
    `, params);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/trends', async (req, res) => {
  try {
    const { area, property_type, years = 5 } = req.query;
    let where = `WHERE instance_date >= NOW() - INTERVAL '${parseInt(years)} years'`;
    const params = [];
    let p = 0;

    if (area) { p++; where += ` AND LOWER(area_name_en) LIKE LOWER($${p})`; params.push(`%${area}%`); }
    if (property_type) { p++; where += ` AND LOWER(property_type_en) = LOWER($${p})`; params.push(property_type); }

    const result = await pool.query(`
      SELECT DATE_TRUNC('month', instance_date) as month, COUNT(*) as transactions,
             AVG(meter_sale_price) as avg_price_sqm, SUM(actual_worth) as total_value
      FROM transactions ${where}
      GROUP BY DATE_TRUNC('month', instance_date) ORDER BY month
    `, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/property-types', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT property_type_en, property_sub_type_en, COUNT(*) as count
      FROM transactions WHERE property_type_en IS NOT NULL
      GROUP BY property_type_en, property_sub_type_en ORDER BY count DESC
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
// ============ OFF-PLAN TRACKER ============

// Get all off-plan projects with stats
app.get('/api/offplan/projects', async (req, res) => {
  try {
    const { area, developer, min_units = 5, sort = 'total_sales', order = 'DESC' } = req.query;
    
    let where = "WHERE reg_type_en = 'Off-plan Properties' OR reg_type_en ILIKE '%off%plan%'";
    const params = [parseInt(min_units)];
    let p = 1;

    if (area) { p++; where += ` AND LOWER(area_name_en) LIKE LOWER($${p})`; params.push(`%${area}%`); }
    if (developer) { p++; where += ` AND LOWER(master_project_en) LIKE LOWER($${p})`; params.push(`%${developer}%`); }

    const result = await pool.query(`
      SELECT 
        project_name_en as project,
        master_project_en as developer,
        area_name_en as area,
        COUNT(*) as total_sales,
        MIN(instance_date) as first_sale,
        MAX(instance_date) as latest_sale,
        ROUND(AVG(meter_sale_price)::numeric, 2) as avg_price_sqm,
        ROUND(MIN(meter_sale_price)::numeric, 2) as min_price_sqm,
        ROUND(MAX(meter_sale_price)::numeric, 2) as max_price_sqm,
        ROUND(SUM(actual_worth)::numeric, 2) as total_value,
        ROUND(AVG(procedure_area)::numeric, 2) as avg_size_sqm
      FROM transactions 
      ${where}
        AND project_name_en IS NOT NULL 
        AND project_name_en != ''
      GROUP BY project_name_en, master_project_en, area_name_en
      HAVING COUNT(*) >= $1
      ORDER BY ${sort === 'price_change' ? 'avg_price_sqm' : sort === 'latest_sale' ? 'latest_sale' : 'total_sales'} ${order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'}
      LIMIT 100
    `, params);

    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get specific project details with price history
app.get('/api/offplan/projects/:name', async (req, res) => {
  try {
    const projectName = req.params.name;
    
    // Get project summary
    const summary = await pool.query(`
      SELECT 
        project_name_en as project,
        master_project_en as developer,
        area_name_en as area,
        COUNT(*) as total_sales,
        MIN(instance_date) as first_sale,
        MAX(instance_date) as latest_sale,
        ROUND(AVG(meter_sale_price)::numeric, 2) as avg_price_sqm,
        ROUND(AVG(actual_worth)::numeric, 2) as avg_price,
        ROUND(SUM(actual_worth)::numeric, 2) as total_value
      FROM transactions 
      WHERE LOWER(project_name_en) LIKE LOWER($1)
        AND (reg_type_en = 'Off-plan Properties' OR reg_type_en ILIKE '%off%plan%')
      GROUP BY project_name_en, master_project_en, area_name_en
    `, [`%${projectName}%`]);

    if (summary.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Get price history by quarter
    const priceHistory = await pool.query(`
      SELECT 
        DATE_TRUNC('quarter', instance_date) as quarter,
        COUNT(*) as sales,
        ROUND(AVG(meter_sale_price)::numeric, 2) as avg_price_sqm,
        ROUND(AVG(actual_worth)::numeric, 2) as avg_price
      FROM transactions 
      WHERE LOWER(project_name_en) LIKE LOWER($1)
        AND (reg_type_en = 'Off-plan Properties' OR reg_type_en ILIKE '%off%plan%')
      GROUP BY DATE_TRUNC('quarter', instance_date)
      ORDER BY quarter
    `, [`%${projectName}%`]);

    // Calculate price change from launch
    const firstPrice = priceHistory.rows[0]?.avg_price_sqm || 0;
    const latestPrice = priceHistory.rows[priceHistory.rows.length - 1]?.avg_price_sqm || 0;
    const priceChangePct = firstPrice > 0 ? ((latestPrice - firstPrice) / firstPrice * 100).toFixed(2) : null;

    // Get unit breakdown by type
    const unitTypes = await pool.query(`
      SELECT 
        property_sub_type_en as unit_type,
        rooms_en as bedrooms,
        COUNT(*) as count,
        ROUND(AVG(meter_sale_price)::numeric, 2) as avg_price_sqm,
        ROUND(AVG(procedure_area)::numeric, 2) as avg_size
      FROM transactions 
      WHERE LOWER(project_name_en) LIKE LOWER($1)
        AND (reg_type_en = 'Off-plan Properties' OR reg_type_en ILIKE '%off%plan%')
      GROUP BY property_sub_type_en, rooms_en
      ORDER BY count DESC
    `, [`%${projectName}%`]);

    res.json({
      summary: summary.rows[0],
      price_change_from_launch_pct: priceChangePct,
      price_history: priceHistory.rows,
      unit_breakdown: unitTypes.rows
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Compare off-plan prices: launch vs current
app.get('/api/offplan/price-changes', async (req, res) => {
  try {
    const { area, min_sales = 10, months_ago = 12 } = req.query;
    
    let areaFilter = '';
    const params = [parseInt(min_sales), parseInt(months_ago)];
    
    if (area) {
      params.push(`%${area}%`);
      areaFilter = `AND LOWER(area_name_en) LIKE LOWER($3)`;
    }

    const result = await pool.query(`
      WITH project_prices AS (
        SELECT 
          project_name_en,
          area_name_en,
          master_project_en,
          instance_date,
          meter_sale_price,
          ROW_NUMBER() OVER (PARTITION BY project_name_en ORDER BY instance_date ASC) as sale_rank_asc,
          ROW_NUMBER() OVER (PARTITION BY project_name_en ORDER BY instance_date DESC) as sale_rank_desc,
          COUNT(*) OVER (PARTITION BY project_name_en) as total_sales
        FROM transactions
        WHERE (reg_type_en = 'Off-plan Properties' OR reg_type_en ILIKE '%off%plan%')
          AND project_name_en IS NOT NULL
          AND meter_sale_price > 0
          ${areaFilter}
      ),
      launch_prices AS (
        SELECT project_name_en, AVG(meter_sale_price) as launch_price
        FROM project_prices WHERE sale_rank_asc <= 5 GROUP BY project_name_en
      ),
      current_prices AS (
        SELECT project_name_en, area_name_en, master_project_en, total_sales,
               AVG(meter_sale_price) as current_price, MAX(instance_date) as latest_sale
        FROM project_prices 
        WHERE sale_rank_desc <= 5 
          AND instance_date >= NOW() - INTERVAL '1 month' * $2
        GROUP BY project_name_en, area_name_en, master_project_en, total_sales
      )
      SELECT 
        c.project_name_en as project,
        c.area_name_en as area,
        c.master_project_en as developer,
        c.total_sales,
        ROUND(l.launch_price::numeric, 2) as launch_price_sqm,
        ROUND(c.current_price::numeric, 2) as current_price_sqm,
        ROUND(((c.current_price - l.launch_price) / l.launch_price * 100)::numeric, 2) as price_change_pct,
        c.latest_sale
      FROM current_prices c
      JOIN launch_prices l ON c.project_name_en = l.project_name_en
      WHERE c.total_sales >= $1
      ORDER BY price_change_pct DESC
      LIMIT 50
    `, params);

    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Detect potential handover delays (projects with old off-plan sales but no ready sales)
app.get('/api/offplan/delayed', async (req, res) => {
  try {
    const { years_threshold = 4 } = req.query;

    const result = await pool.query(`
      WITH offplan_projects AS (
        SELECT 
          project_name_en,
          area_name_en,
          master_project_en,
          MIN(instance_date) as first_sale,
          MAX(instance_date) as latest_sale,
          COUNT(*) as total_offplan_sales
        FROM transactions
        WHERE (reg_type_en = 'Off-plan Properties' OR reg_type_en ILIKE '%off%plan%')
          AND project_name_en IS NOT NULL
        GROUP BY project_name_en, area_name_en, master_project_en
        HAVING MIN(instance_date) < NOW() - INTERVAL '1 year' * $1
      ),
      ready_projects AS (
        SELECT DISTINCT project_name_en
        FROM transactions
        WHERE reg_type_en = 'Existing Properties'
          AND project_name_en IS NOT NULL
      )
      SELECT 
        o.project_name_en as project,
        o.area_name_en as area,
        o.master_project_en as developer,
        o.first_sale as first_offplan_sale,
        o.latest_sale as latest_offplan_sale,
        o.total_offplan_sales,
        EXTRACT(YEAR FROM AGE(NOW(), o.first_sale))::int as years_since_launch,
        CASE WHEN r.project_name_en IS NULL THEN 'No ready sales - potential delay' ELSE 'Has ready sales' END as status
      FROM offplan_projects o
      LEFT JOIN ready_projects r ON o.project_name_en = r.project_name_en
      WHERE r.project_name_en IS NULL
      ORDER BY o.first_sale ASC
      LIMIT 50
    `, [parseInt(years_threshold)]);

    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ RENTAL DEMAND SIGNALS ============

// Rental velocity by area (how fast units rent)
app.get('/api/rentals/demand', async (req, res) => {
  try {
    const { year, min_contracts = 50 } = req.query;
    
    let yearFilter = '';
    const params = [parseInt(min_contracts)];
    
    if (year) {
      params.push(parseInt(year));
      yearFilter = `AND EXTRACT(YEAR FROM contract_start_date) = $2`;
    }

    const result = await pool.query(`
      SELECT 
        area_name_en as area,
        COUNT(*) as total_contracts,
        ROUND(AVG(annual_amount)::numeric, 2) as avg_annual_rent,
        ROUND(AVG(annual_amount / NULLIF(actual_area, 0))::numeric, 2) as avg_rent_sqm,
        COUNT(DISTINCT DATE_TRUNC('month', contract_start_date)) as active_months,
        ROUND((COUNT(*)::float / NULLIF(COUNT(DISTINCT DATE_TRUNC('month', contract_start_date)), 0))::numeric, 2) as contracts_per_month
      FROM rentals
      WHERE area_name_en IS NOT NULL ${yearFilter}
      GROUP BY area_name_en
      HAVING COUNT(*) >= $1
      ORDER BY contracts_per_month DESC
    `, params);

    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Seasonal rental patterns
app.get('/api/rentals/seasonal', async (req, res) => {
  try {
    const { area, years = 3 } = req.query;
    
    let areaFilter = '';
    const params = [parseInt(years)];
    
    if (area) {
      params.push(`%${area}%`);
      areaFilter = `AND LOWER(area_name_en) LIKE LOWER($2)`;
    }

    const result = await pool.query(`
      SELECT 
        EXTRACT(MONTH FROM contract_start_date)::int as month,
        TO_CHAR(TO_DATE(EXTRACT(MONTH FROM contract_start_date)::text, 'MM'), 'Mon') as month_name,
        COUNT(*) as total_contracts,
        ROUND(AVG(annual_amount)::numeric, 2) as avg_rent,
        ROUND((COUNT(*)::float / (SELECT COUNT(*) FROM rentals 
          WHERE contract_start_date >= NOW() - INTERVAL '1 year' * $1 ${areaFilter}) * 100)::numeric, 2) as pct_of_yearly
      FROM rentals
      WHERE contract_start_date >= NOW() - INTERVAL '1 year' * $1
        ${areaFilter}
      GROUP BY EXTRACT(MONTH FROM contract_start_date)
      ORDER BY month
    `, params);

    // Calculate seasonal index (100 = average month)
    const avgContracts = result.rows.reduce((sum, r) => sum + parseInt(r.total_contracts), 0) / 12;
    const withIndex = result.rows.map(r => ({
      ...r,
      seasonal_index: Math.round((parseInt(r.total_contracts) / avgContracts) * 100)
    }));

    res.json({
      data: withIndex,
      insights: {
        peak_month: withIndex.reduce((max, r) => r.seasonal_index > max.seasonal_index ? r : max, withIndex[0]),
        low_month: withIndex.reduce((min, r) => r.seasonal_index < min.seasonal_index ? r : min, withIndex[0])
      }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Rental market trends (YoY comparison)
app.get('/api/rentals/trends', async (req, res) => {
  try {
    const { area, property_type } = req.query;
    
    let filters = '';
    const params = [];
    let p = 0;

    if (area) { p++; filters += ` AND LOWER(area_name_en) LIKE LOWER($${p})`; params.push(`%${area}%`); }
    if (property_type) { p++; filters += ` AND LOWER(property_type_en) = LOWER($${p})`; params.push(property_type); }

    const result = await pool.query(`
      SELECT 
        EXTRACT(YEAR FROM contract_start_date)::int as year,
        COUNT(*) as total_contracts,
        ROUND(AVG(annual_amount)::numeric, 2) as avg_rent,
        ROUND(AVG(annual_amount / NULLIF(actual_area, 0))::numeric, 2) as avg_rent_sqm
      FROM rentals
      WHERE contract_start_date >= NOW() - INTERVAL '5 years'
        ${filters}
      GROUP BY EXTRACT(YEAR FROM contract_start_date)
      ORDER BY year
    `, params);

    // Calculate YoY changes
    const withChanges = result.rows.map((r, i) => {
      if (i === 0) return { ...r, yoy_rent_change_pct: null, yoy_volume_change_pct: null };
      const prev = result.rows[i - 1];
      return {
        ...r,
        yoy_rent_change_pct: ((r.avg_rent - prev.avg_rent) / prev.avg_rent * 100).toFixed(2),
        yoy_volume_change_pct: ((r.total_contracts - prev.total_contracts) / prev.total_contracts * 100).toFixed(2)
      };
    });

    res.json(withChanges);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Vacancy indicators (areas with dropping rental activity)
app.get('/api/rentals/vacancy-signals', async (req, res) => {
  try {
    const { min_contracts = 100 } = req.query;

    const result = await pool.query(`
      WITH recent AS (
        SELECT area_name_en, COUNT(*) as recent_contracts, AVG(annual_amount) as recent_avg_rent
        FROM rentals
        WHERE contract_start_date >= NOW() - INTERVAL '6 months'
        GROUP BY area_name_en
      ),
      previous AS (
        SELECT area_name_en, COUNT(*) as prev_contracts, AVG(annual_amount) as prev_avg_rent
        FROM rentals
        WHERE contract_start_date >= NOW() - INTERVAL '12 months'
          AND contract_start_date < NOW() - INTERVAL '6 months'
        GROUP BY area_name_en
      )
      SELECT 
        r.area_name_en as area,
        r.recent_contracts,
        p.prev_contracts,
        ROUND(((r.recent_contracts::float - p.prev_contracts) / NULLIF(p.prev_contracts, 0) * 100)::numeric, 2) as volume_change_pct,
        ROUND(r.recent_avg_rent::numeric, 2) as recent_avg_rent,
        ROUND(p.prev_avg_rent::numeric, 2) as prev_avg_rent,
        ROUND(((r.recent_avg_rent - p.prev_avg_rent) / NULLIF(p.prev_avg_rent, 0) * 100)::numeric, 2) as rent_change_pct,
        CASE 
          WHEN (r.recent_contracts::float - p.prev_contracts) / NULLIF(p.prev_contracts, 0) < -0.2 
               AND (r.recent_avg_rent - p.prev_avg_rent) / NULLIF(p.prev_avg_rent, 0) < -0.05
          THEN 'High vacancy risk'
          WHEN (r.recent_contracts::float - p.prev_contracts) / NULLIF(p.prev_contracts, 0) < -0.1
          THEN 'Moderate vacancy risk'
          WHEN (r.recent_contracts::float - p.prev_contracts) / NULLIF(p.prev_contracts, 0) > 0.2
          THEN 'High demand'
          ELSE 'Stable'
        END as signal
      FROM recent r
      JOIN previous p ON r.area_name_en = p.area_name_en
      WHERE p.prev_contracts >= $1
      ORDER BY volume_change_pct ASC
    `, [parseInt(min_contracts)]);

    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Rental yield by area (combines sales + rental data)
app.get('/api/rentals/yields', async (req, res) => {
  try {
    const { property_type, min_data = 30 } = req.query;
    
    let typeFilter = '';
    const params = [parseInt(min_data)];
    
    if (property_type) {
      params.push(property_type);
      typeFilter = `AND LOWER(t.property_type_en) = LOWER($2)`;
    }

    const result = await pool.query(`
      WITH sales AS (
        SELECT area_name_en, AVG(actual_worth) as avg_price, COUNT(*) as sale_count
        FROM transactions t
        WHERE instance_date >= NOW() - INTERVAL '2 years'
          AND actual_worth > 0
          ${typeFilter}
        GROUP BY area_name_en
      ),
      rents AS (
        SELECT area_name_en, AVG(annual_amount) as avg_rent, COUNT(*) as rent_count
        FROM rentals
        WHERE contract_start_date >= NOW() - INTERVAL '2 years'
          AND annual_amount > 0
        GROUP BY area_name_en
      )
      SELECT 
        s.area_name_en as area,
        ROUND(s.avg_price::numeric, 2) as avg_purchase_price,
        ROUND(r.avg_rent::numeric, 2) as avg_annual_rent,
        ROUND((r.avg_rent / s.avg_price * 100)::numeric, 2) as gross_yield_pct,
        s.sale_count,
        r.rent_count
      FROM sales s
      JOIN rents r ON s.area_name_en = r.area_name_en
      WHERE s.sale_count >= $1 AND r.rent_count >= $1
      ORDER BY gross_yield_pct DESC
    `, params);

    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ FLIP ANALYSIS ============

// Find flipped properties (same unit sold multiple times)
app.get('/api/flips', async (req, res) => {
  try {
    const { area, min_profit, max_hold_years = 3, min_flips = 2, limit = 100 } = req.query;

    let areaFilter = '';
    const params = [parseInt(max_hold_years), parseInt(min_flips)];
    let p = 2;

    if (area) { p++; areaFilter = `AND LOWER(t1.area_name_en) LIKE LOWER($${p})`; params.push(`%${area}%`); }

    // Find properties sold multiple times (matching on building + approximate size)
    const result = await pool.query(`
      WITH property_sales AS (
        SELECT 
          building_name_en,
          area_name_en,
          property_sub_type_en,
          rooms_en,
          ROUND(procedure_area) as unit_size,
          instance_date,
          actual_worth,
          meter_sale_price,
          ROW_NUMBER() OVER (
            PARTITION BY building_name_en, ROUND(procedure_area), rooms_en 
            ORDER BY instance_date
          ) as sale_num,
          COUNT(*) OVER (
            PARTITION BY building_name_en, ROUND(procedure_area), rooms_en
          ) as total_sales
        FROM transactions
        WHERE building_name_en IS NOT NULL 
          AND building_name_en != ''
          AND actual_worth > 0
          AND procedure_area > 0
          ${areaFilter}
      ),
      flips AS (
        SELECT 
          ps1.building_name_en,
          ps1.area_name_en,
          ps1.property_sub_type_en,
          ps1.rooms_en,
          ps1.unit_size,
          ps1.instance_date as buy_date,
          ps1.actual_worth as buy_price,
          ps2.instance_date as sell_date,
          ps2.actual_worth as sell_price,
          ps2.actual_worth - ps1.actual_worth as profit,
          ROUND(((ps2.actual_worth - ps1.actual_worth) / ps1.actual_worth * 100)::numeric, 2) as profit_pct,
          (ps2.instance_date - ps1.instance_date) as hold_days
        FROM property_sales ps1
        JOIN property_sales ps2 ON 
          ps1.building_name_en = ps2.building_name_en
          AND ps1.unit_size = ps2.unit_size
          AND ps1.rooms_en = ps2.rooms_en
          AND ps2.sale_num = ps1.sale_num + 1
        WHERE ps1.total_sales >= $2
          AND ps2.instance_date - ps1.instance_date <= 365 * $1
          AND ps2.instance_date > ps1.instance_date
      )
      SELECT * FROM flips
      ${min_profit ? `WHERE profit >= ${parseInt(min_profit)}` : ''}
      ORDER BY profit_pct DESC
      LIMIT ${parseInt(limit)}
    `, params);

    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Flip statistics by area
app.get('/api/flips/by-area', async (req, res) => {
  try {
    const { max_hold_years = 3, min_flips = 10 } = req.query;

    const result = await pool.query(`
      WITH property_sales AS (
        SELECT 
          building_name_en,
          area_name_en,
          ROUND(procedure_area) as unit_size,
          rooms_en,
          instance_date,
          actual_worth,
          ROW_NUMBER() OVER (
            PARTITION BY building_name_en, ROUND(procedure_area), rooms_en 
            ORDER BY instance_date
          ) as sale_num
        FROM transactions
        WHERE building_name_en IS NOT NULL 
          AND building_name_en != ''
          AND actual_worth > 0
          AND procedure_area > 0
      ),
      flips AS (
        SELECT 
          ps1.area_name_en,
          ps2.actual_worth - ps1.actual_worth as profit,
          ((ps2.actual_worth - ps1.actual_worth) / ps1.actual_worth * 100) as profit_pct,
          (ps2.instance_date - ps1.instance_date) as hold_days
        FROM property_sales ps1
        JOIN property_sales ps2 ON 
          ps1.building_name_en = ps2.building_name_en
          AND ps1.unit_size = ps2.unit_size
          AND ps1.rooms_en = ps2.rooms_en
          AND ps2.sale_num = ps1.sale_num + 1
        WHERE ps2.instance_date - ps1.instance_date <= 365 * $1
          AND ps2.instance_date > ps1.instance_date
      )
      SELECT 
        area_name_en as area,
        COUNT(*) as total_flips,
        ROUND(AVG(profit)::numeric, 2) as avg_profit_aed,
        ROUND(AVG(profit_pct)::numeric, 2) as avg_profit_pct,
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY profit_pct)::numeric, 2) as median_profit_pct,
        ROUND(AVG(hold_days)::numeric, 0) as avg_hold_days,
        ROUND(MIN(profit_pct)::numeric, 2) as worst_flip_pct,
        ROUND(MAX(profit_pct)::numeric, 2) as best_flip_pct,
        SUM(CASE WHEN profit > 0 THEN 1 ELSE 0 END) as profitable_flips,
        ROUND((SUM(CASE WHEN profit > 0 THEN 1 ELSE 0 END)::float / COUNT(*) * 100)::numeric, 1) as success_rate_pct
      FROM flips
      WHERE area_name_en IS NOT NULL
      GROUP BY area_name_en
      HAVING COUNT(*) >= $2
      ORDER BY avg_profit_pct DESC
    `, [parseInt(max_hold_years), parseInt(min_flips)]);

    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Best buildings for flipping
app.get('/api/flips/top-buildings', async (req, res) => {
  try {
    const { area, max_hold_years = 3, min_flips = 5 } = req.query;

    let areaFilter = '';
    const params = [parseInt(max_hold_years), parseInt(min_flips)];
    
    if (area) {
      params.push(`%${area}%`);
      areaFilter = `AND LOWER(ps1.area_name_en) LIKE LOWER($3)`;
    }

    const result = await pool.query(`
      WITH property_sales AS (
        SELECT 
          building_name_en,
          area_name_en,
          ROUND(procedure_area) as unit_size,
          rooms_en,
          instance_date,
          actual_worth,
          ROW_NUMBER() OVER (
            PARTITION BY building_name_en, ROUND(procedure_area), rooms_en 
            ORDER BY instance_date
          ) as sale_num
        FROM transactions
        WHERE building_name_en IS NOT NULL 
          AND building_name_en != ''
          AND actual_worth > 0
      ),
      flips AS (
        SELECT 
          ps1.building_name_en,
          ps1.area_name_en,
          ps2.actual_worth - ps1.actual_worth as profit,
          ((ps2.actual_worth - ps1.actual_worth) / ps1.actual_worth * 100) as profit_pct
        FROM property_sales ps1
        JOIN property_sales ps2 ON 
          ps1.building_name_en = ps2.building_name_en
          AND ps1.unit_size = ps2.unit_size
          AND ps1.rooms_en = ps2.rooms_en
          AND ps2.sale_num = ps1.sale_num + 1
        WHERE ps2.instance_date - ps1.instance_date <= 365 * $1
          AND ps2.instance_date > ps1.instance_date
          ${areaFilter}
      )
      SELECT 
        building_name_en as building,
        area_name_en as area,
        COUNT(*) as total_flips,
        ROUND(AVG(profit)::numeric, 2) as avg_profit_aed,
        ROUND(AVG(profit_pct)::numeric, 2) as avg_profit_pct,
        ROUND((SUM(CASE WHEN profit > 0 THEN 1 ELSE 0 END)::float / COUNT(*) * 100)::numeric, 1) as success_rate_pct
      FROM flips
      GROUP BY building_name_en, area_name_en
      HAVING COUNT(*) >= $2
      ORDER BY avg_profit_pct DESC
      LIMIT 50
    `, params);

    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ NEIGHBORHOOD INTEL ============

// Area overview with nearby amenities
app.get('/api/neighborhoods/:area', async (req, res) => {
  try {
    const area = req.params.area;

    // Get area stats
    const areaStats = await pool.query(`
      SELECT 
        area_name_en as area,
        COUNT(*) as total_transactions,
        COUNT(DISTINCT building_name_en) as buildings,
        COUNT(DISTINCT project_name_en) as projects,
        ROUND(AVG(actual_worth)::numeric, 2) as avg_price,
        ROUND(AVG(meter_sale_price)::numeric, 2) as avg_price_sqm,
        MIN(instance_date) as first_transaction,
        MAX(instance_date) as latest_transaction
      FROM transactions
      WHERE LOWER(area_name_en) LIKE LOWER($1)
      GROUP BY area_name_en
    `, [`%${area}%`]);

    if (areaStats.rows.length === 0) {
      return res.status(404).json({ error: 'Area not found' });
    }

    // Get nearby metros
    const metros = await pool.query(`
      SELECT DISTINCT nearest_metro_en as metro, COUNT(*) as properties
      FROM transactions
      WHERE LOWER(area_name_en) LIKE LOWER($1)
        AND nearest_metro_en IS NOT NULL AND nearest_metro_en != ''
      GROUP BY nearest_metro_en
      ORDER BY properties DESC
      LIMIT 5
    `, [`%${area}%`]);

    // Get nearby malls
    const malls = await pool.query(`
      SELECT DISTINCT nearest_mall_en as mall, COUNT(*) as properties
      FROM transactions
      WHERE LOWER(area_name_en) LIKE LOWER($1)
        AND nearest_mall_en IS NOT NULL AND nearest_mall_en != ''
      GROUP BY nearest_mall_en
      ORDER BY properties DESC
      LIMIT 5
    `, [`%${area}%`]);

    // Get nearby landmarks
    const landmarks = await pool.query(`
      SELECT DISTINCT nearest_landmark_en as landmark, COUNT(*) as properties
      FROM transactions
      WHERE LOWER(area_name_en) LIKE LOWER($1)
        AND nearest_landmark_en IS NOT NULL AND nearest_landmark_en != ''
      GROUP BY nearest_landmark_en
      ORDER BY properties DESC
      LIMIT 5
    `, [`%${area}%`]);

    // Get property mix
    const propertyMix = await pool.query(`
      SELECT 
        property_type_en,
        property_sub_type_en,
        COUNT(*) as count,
        ROUND(AVG(meter_sale_price)::numeric, 2) as avg_price_sqm
      FROM transactions
      WHERE LOWER(area_name_en) LIKE LOWER($1)
      GROUP BY property_type_en, property_sub_type_en
      ORDER BY count DESC
      LIMIT 10
    `, [`%${area}%`]);

    // Get top developers in area
    const developers = await pool.query(`
      SELECT 
        master_project_en as developer,
        COUNT(*) as projects_sold,
        ROUND(AVG(meter_sale_price)::numeric, 2) as avg_price_sqm
      FROM transactions
      WHERE LOWER(area_name_en) LIKE LOWER($1)
        AND master_project_en IS NOT NULL AND master_project_en != ''
      GROUP BY master_project_en
      ORDER BY projects_sold DESC
      LIMIT 10
    `, [`%${area}%`]);

    res.json({
      stats: areaStats.rows[0],
      nearby: {
        metros: metros.rows,
        malls: malls.rows,
        landmarks: landmarks.rows
      },
      property_mix: propertyMix.rows,
      top_developers: developers.rows
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// List all metros with nearby areas
app.get('/api/neighborhoods/metros', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        nearest_metro_en as metro,
        COUNT(DISTINCT area_name_en) as areas_served,
        COUNT(*) as total_transactions,
        ROUND(AVG(meter_sale_price)::numeric, 2) as avg_price_sqm,
        ARRAY_AGG(DISTINCT area_name_en ORDER BY area_name_en) FILTER (WHERE area_name_en IS NOT NULL) as areas
      FROM transactions
      WHERE nearest_metro_en IS NOT NULL AND nearest_metro_en != ''
      GROUP BY nearest_metro_en
      ORDER BY total_transactions DESC
    `);

    res.json(result.rows.map(r => ({
      ...r,
      areas: r.areas?.slice(0, 10) // Limit areas array
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// List all malls with nearby areas
app.get('/api/neighborhoods/malls', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        nearest_mall_en as mall,
        COUNT(DISTINCT area_name_en) as areas_served,
        COUNT(*) as total_transactions,
        ROUND(AVG(meter_sale_price)::numeric, 2) as avg_price_sqm
      FROM transactions
      WHERE nearest_mall_en IS NOT NULL AND nearest_mall_en != ''
      GROUP BY nearest_mall_en
      ORDER BY total_transactions DESC
      LIMIT 50
    `);

    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Infrastructure impact - price premium near metros
app.get('/api/neighborhoods/metro-premium', async (req, res) => {
  try {
    const result = await pool.query(`
      WITH metro_areas AS (
        SELECT 
          area_name_en,
          nearest_metro_en,
          AVG(meter_sale_price) as with_metro_price,
          COUNT(*) as with_metro_count
        FROM transactions
        WHERE nearest_metro_en IS NOT NULL AND nearest_metro_en != ''
          AND meter_sale_price > 0
          AND instance_date >= NOW() - INTERVAL '2 years'
        GROUP BY area_name_en, nearest_metro_en
      ),
      area_avg AS (
        SELECT 
          area_name_en,
          AVG(meter_sale_price) as area_avg_price
        FROM transactions
        WHERE meter_sale_price > 0
          AND instance_date >= NOW() - INTERVAL '2 years'
        GROUP BY area_name_en
        HAVING COUNT(*) >= 50
      )
      SELECT 
        m.area_name_en as area,
        m.nearest_metro_en as metro,
        ROUND(m.with_metro_price::numeric, 2) as near_metro_price_sqm,
        ROUND(a.area_avg_price::numeric, 2) as area_avg_price_sqm,
        ROUND(((m.with_metro_price - a.area_avg_price) / a.area_avg_price * 100)::numeric, 2) as metro_premium_pct,
        m.with_metro_count as transactions
      FROM metro_areas m
      JOIN area_avg a ON m.area_name_en = a.area_name_en
      WHERE m.with_metro_count >= 20
      ORDER BY metro_premium_pct DESC
      LIMIT 30
    `);

    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Area comparison by amenities
app.get('/api/neighborhoods/compare', async (req, res) => {
  try {
    const { areas } = req.query;
    if (!areas) return res.status(400).json({ error: 'areas parameter required (comma-separated)' });

    const areaList = areas.split(',').map(a => a.trim());
    const results = [];

    for (const area of areaList) {
      const data = await pool.query(`
        SELECT 
          area_name_en as area,
          COUNT(*) as transactions,
          ROUND(AVG(meter_sale_price)::numeric, 2) as avg_price_sqm,
          COUNT(DISTINCT nearest_metro_en) FILTER (WHERE nearest_metro_en IS NOT NULL AND nearest_metro_en != '') as metro_stations,
          COUNT(DISTINCT nearest_mall_en) FILTER (WHERE nearest_mall_en IS NOT NULL AND nearest_mall_en != '') as malls,
          MODE() WITHIN GROUP (ORDER BY nearest_metro_en) as primary_metro,
          MODE() WITHIN GROUP (ORDER BY nearest_mall_en) as primary_mall
        FROM transactions
        WHERE LOWER(area_name_en) LIKE LOWER($1)
          AND instance_date >= NOW() - INTERVAL '2 years'
        GROUP BY area_name_en
      `, [`%${area}%`]);

      if (data.rows.length > 0) {
        results.push(data.rows[0]);
      }
    }

    res.json(results);
  } catch (err) { res.status(500).json({ error: err.message }); }
});


const PORT = process.env.PORT || 3003;
app.listen(PORT, () => console.log(`DXBData API running on port ${PORT}`));
