import express from 'express';
import pkg from 'pg';

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json());

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.get('/health', async (_req, res) => {
  try {
    const result = await pool.query('SELECT 1 AS ok');
    res.status(200).json({ ok: true, db: result.rows[0]?.ok === 1 ? 'connected' : 'unknown' });
  } catch (error) {
    console.error('Database health check failed', error);
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

app.get('/', async (_req, res) => {
  try {
    const result = await pool.query('SELECT NOW() AS now');
    res.status(200).json({ ok: true, now: result.rows[0]?.now ?? null });
  } catch (error) {
    console.error('Database query failed', error);
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

app.listen(port, () => {
  console.log(`Neon Railway example listening on http://0.0.0.0:${port}`);
});
