// backend/models/Disaster.js
const mongoose = require('mongoose');

// Schema for Disaster Records
const disasterSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true },
    location_name: { type: String, required: true },
    location: {
        type: {
            type: String,
            enum: ['Point'],
            required: true
        },
        coordinates: {
            type: [Number], // Stored as [longitude, latitude]
            required: true
        }
    },
    description: { type: String, required: true },
    tags: { type: [String], index: true },
    owner_id: { type: String, required: true, index: true },
}, { timestamps: true });

// 2dsphere index is crucial for geospatial queries like $near
disasterSchema.index({ location: '2dsphere' });

// Schema for Nearby Resources
const resourceSchema = new mongoose.Schema({
    name: { type: String, required: true },
    location_name: { type: String, required: true },
    location: {
        type: { type: String, enum: ['Point'], required: true },
        coordinates: { type: [Number], required: true }
    },
    type: { type: String, required: true, enum: ['shelter', 'food', 'medical', 'water'] }
}, { timestamps: true });

resourceSchema.index({ location: '2dsphere' });

// Schema for Caching API Responses
const cacheSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true, index: true },
    value: { type: String, required: true }, // Store as a JSON string
    // This TTL index automatically removes documents after the specified time
    expires_at: { type: Date, required: true, index: { expires: '1s' } }
});

const Disaster = mongoose.model('Disaster', disasterSchema);
const Resource = mongoose.model('Resource', resourceSchema);
const Cache = mongoose.model('Cache', cacheSchema);

module.exports = { Disaster, Resource, Cache };