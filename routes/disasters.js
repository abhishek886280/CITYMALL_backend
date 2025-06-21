// backend/routes/disasters.js
const express = require('express');
const { Disaster, Resource, Cache } = require('../models/Disaster');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const NodeGeocoder = require('node-geocoder');
const cheerio = require('cheerio');

const router = express.Router();

// --- Service Implementations (Included directly in this file) ---

const geminiService = {
    extractLocationFromText: async (text) => {
        try {
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            // CORRECTED: Using a current, valid model name to prevent 404 errors.
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
            const prompt = `From the text, extract only the most specific, real-world location (e.g., city, well-known place). Example: from "Heavy flooding in Varanasi", extract "Varanasi". If no location is found, return "null". Text: "${text}"`;
            const result = await model.generateContent(prompt);
            return result.response.text().trim().replace(/^"|"$/g, '');
        } catch (error) {
            console.error("Gemini API error:", error);
            // Propagate the error to be handled by the route's catch block
            throw error;
        }
    }
};

const geocodingService = {
    getGeocodedLocation: async (locationName) => {
        try {
            const geocoder = NodeGeocoder({ provider: 'openstreetmap' });
            const res = await geocoder.geocode(locationName);
            return res.length > 0 ? { latitude: res[0].latitude, longitude: res[0].longitude } : null;
        } catch (error) {
            console.error("Geocoding service error:", error);
            return null;
        }
    }
};

const scrapingService = {
    scrapeFema: async () => {
        try {
            const { data } = await axios.get('https://www.fema.gov/disasters');
            const $ = cheerio.load(data);
            const updates = [];
            $('.views-row').slice(0, 3).each((i, el) => {
                const title = $(el).find('h2').text().trim();
                const link = 'https://www.fema.gov' + $(el).find('h2 a').attr('href');
                if (title && link) updates.push({ title, link, source: 'FEMA' });
            });
            return updates;
        } catch (error) { return []; }
    },
    scrapeRedCross: async () => {
        try {
            const { data } = await axios.get('https://www.redcross.org/get-help/disaster-relief-and-recovery-services.html');
             const $ = cheerio.load(data);
             const updates = [];
             $('a.related-links-title').slice(0, 3).each((i, el) => {
                 const title = $(el).text().trim();
                 const link = 'https://www.redcross.org' + $(el).attr('href');
                 if (title && link) updates.push({ title, link, source: 'Red Cross' });
             });
             return updates;
        } catch (error) { return []; }
    }
};


// --- Middleware for Caching ---
const getFromCache = async (req, res, next) => {
    const key = req.originalUrl;
    try {
        const cachedData = await Cache.findOne({ key });
        if (cachedData) {
            console.log(`Cache HIT for key: ${key}`);
            return res.json(JSON.parse(cachedData.value));
        }
        console.log(`Cache MISS for key: ${key}`);
        next();
    } catch (error) {
        next();
    }
};

const setInCache = async (key, data, ttlSeconds) => {
    try {
        const expires_at = new Date(Date.now() + ttlSeconds * 1000);
        await Cache.findOneAndUpdate({ key }, { value: JSON.stringify(data), expires_at }, { upsert: true });
    } catch (error) {
        console.error("Cache write error:", error);
    }
};


// --- Geocoding Route ---
router.post('/geocode', async (req, res) => {
    const { text } = req.body;
    if (!text) return res.status(400).json({ message: 'Text for geocoding is required.' });

    try {
        const locationName = await geminiService.extractLocationFromText(text);
        if (!locationName || locationName.toLowerCase() === 'null') {
            return res.status(404).json({ message: "Could not extract a specific location from the text." });
        }

        const locationData = await geocodingService.getGeocodedLocation(locationName);
        if (!locationData) {
            return res.status(404).json({ message: `Could not find coordinates for "${locationName}".` });
        }
        res.json({ locationName, locationData });
    } catch (error) {
        res.status(500).json({ message: 'An error occurred with the AI or geocoding service.' });
    }
});


// --- Disaster Routes ---
router.post('/disasters', async (req, res) => {
    try {
        const { title, location_name, location, description, tags } = req.body;
        const newDisaster = new Disaster({
            title, location_name, description, tags,
            location: { type: 'Point', coordinates: location.coordinates },
            owner_id: process.env.MOCK_USER_ID,
        });
        const savedDisaster = await newDisaster.save();
        res.status(201).json(savedDisaster);
    } catch (error) {
        res.status(500).json({ message: "Error creating disaster." });
    }
});

router.get('/disasters', async (req, res) => {
    try {
        const disasters = await Disaster.find({}).sort({ createdAt: -1 });
        res.json(disasters);
    } catch (error) {
        res.status(500).json({ message: "Error fetching disasters." });
    }
});


// --- Disaster-Specific Detail Routes ---

router.get('/disasters/:id/resources', async (req, res) => {
    try {
        const { lat, lon, radius = 10000 } = req.query; // 10km radius
        const resources = await Resource.find({
            location: {
                $near: {
                    $geometry: { type: "Point", coordinates: [parseFloat(lon), parseFloat(lat)] },
                    $maxDistance: parseInt(radius)
                }
            }
        });
        res.json(resources);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching resources.' });
    }
});

router.get('/disasters/:id/social-media', getFromCache, async (req, res) => {
    try {
        const mockApiUrl = `${req.protocol}://${req.get('host')}/api/mock-social-media`;
        const response = await axios.get(mockApiUrl);
        await setInCache(req.originalUrl, response.data, 600); // Cache for 10 minutes
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching social media updates.' });
    }
});


router.get('/disasters/:id/official-updates', getFromCache, async (req, res) => {
    try {
        const fema = await scrapingService.scrapeFema();
        const redCross = await scrapingService.scrapeRedCross();
        const updates = { fema, redCross };
        await setInCache(req.originalUrl, updates, 3600); // Cache for 1 hour
        res.json(updates);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching official updates.' });
    }
});

// --- Self-hosted Mock Social Media Route used by other routes ---
router.get('/mock-social-media', (req, res) => {
    res.json([
        { post: "#floodrelief Need food and water in downtown Varanasi.", user: "citizen1", timestamp: new Date() },
        { post: "Anyone have a boat near Assi Ghat? #varanasiflood", user: "helper2", timestamp: new Date() },
    ]);
});


module.exports = router;
