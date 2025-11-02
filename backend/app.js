const express = require('express');
const cors = require('cors');
const nodeRoutes = require('./routes/nodeRoutes');
const qemuService = require('./services/qemuService'); // 🧩 import here

const app = express();

// Mark all nodes as stopped when backend starts
qemuService.initInventory(); // ✅ this ensures clean startup state

// Use CORS
app.use(cors({
  origin: 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use('/nodes', nodeRoutes);

const PORT = 5000;
app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
