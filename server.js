// backend/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const connectDB = require('./config/db');
const apiRoutes = require('./routes/disasters'); // Simplified routing

const app = express();

// Connect to Database
connectDB();


// ...

// --- Middleware ---
app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:1234" }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// --- API Routes ---
app.use('/api', apiRoutes);

// --- Start Server ---
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
    console.log(`Backend server is running on http://localhost:${PORT}`);
});
