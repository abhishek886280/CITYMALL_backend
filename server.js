
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const connectDB = require('./config/db');
const apiRoutes = require('./routes/disasters'); 

const app = express();


connectDB();



app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:1234" }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));


app.use('/api', apiRoutes);


const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
    console.log(`Backend server is running on http://localhost:${PORT}`);
});
