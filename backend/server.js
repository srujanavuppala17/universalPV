import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import obj2gltf from 'obj2gltf';
import { stlToGltf } from 'stl-to-gltf';
import { Pool } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use('/models', express.static(path.join(__dirname, 'public/models')));

// Database setup
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://user:password@localhost:5432/universalpv'
});

// JWT helper
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads')),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// Auth endpoints
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const result = await pool.query('SELECT id, password_hash FROM users WHERE username=$1', [username]);
  if (!result.rows.length) return res.status(401).json({ error: 'User not found' });
  const user = result.rows[0];
  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ id: user.id, username }, JWT_SECRET, { expiresIn: '1h' });
  res.json({ token });
});

// File upload and conversion
app.post('/api/upload', authMiddleware, upload.single('model'), async (req, res) => {
  const filePath = req.file.path;
  const ext = path.extname(req.file.originalname).toLowerCase();
  const outDir = path.join(__dirname, 'public/models');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, path.basename(filePath, ext) + '.gltf');
  try {
    if (ext === '.obj') {
      const gltf = await obj2gltf(filePath);
      fs.writeFileSync(outPath, JSON.stringify(gltf));
    } else if (ext === '.stl') {
      const gltf = await stlToGltf(filePath);
      fs.writeFileSync(outPath, JSON.stringify(gltf));
    } else if (ext === '.dwg') {
      return res.status(501).json({ error: 'DWG conversion not implemented' });
    } else {
      return res.status(400).json({ error: 'Unsupported format' });
    }
    res.json({ url: `/models/${path.basename(outPath)}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Conversion failed' });
  }
});

// Metadata fetch
app.get('/api/metadata/:id', authMiddleware, async (req, res) => {
  const result = await pool.query('SELECT * FROM components WHERE id=$1', [req.params.id]);
  res.json(result.rows[0] || {});
});

// Search
app.get('/api/search', authMiddleware, async (req, res) => {
  const { type, pressureMin } = req.query;
  const result = await pool.query(
    'SELECT id FROM components WHERE type=$1 AND pressure > $2',
    [type, pressureMin]
  );
  res.json(result.rows.map(r => r.id));
});

// Annotations
app.get('/api/annotations', authMiddleware, async (req, res) => {
  const result = await pool.query('SELECT * FROM annotations');
  res.json(result.rows);
});

app.post('/api/annotations', authMiddleware, async (req, res) => {
  const { x, y, z, note } = req.body;
  const result = await pool.query(
    'INSERT INTO annotations (x, y, z, note) VALUES ($1,$2,$3,$4) RETURNING *',
    [x, y, z, note]
  );
  res.json(result.rows[0]);
});

// Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
