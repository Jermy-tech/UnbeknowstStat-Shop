const express = require('express');
const crypto = require('crypto');
const { MongoClient } = require('mongodb');
require('dotenv').config();  // Load environment variables from .env

const app = express();
app.use(express.json());

// MongoDB connection settings from .env
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);
const dbName = process.env.DB_NAME;
const collectionName = process.env.COLLECTION_NAME;

// Webhook secret from .env
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

mongoose.connect(mongoAtlasUri, { serverSelectionTimeoutMS: 3000 });
const db = mongoose.connection;
db.on('error', (error) => {
    console.error('MongoDB connection error:', error);
});

// Map product names to plan levels
const PLAN_MAP = {
    'Free': 0,
    'Starter': 1,
    'Pro': 2,
    'Enterprise': 3
};

// Verify webhook authenticity
function verifySignature(payload, signature) {
    try {
        // Ensure that the payload is properly serialized to JSON
        const payloadString = JSON.stringify(payload, Object.keys(payload).sort()); // Sort keys for consistency
        const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
        hmac.update(payloadString);
        return hmac.digest('hex') === signature;
    } catch (error) {
        console.error('Error while verifying signature:', error);
        return false; // Return false on any error
    }
}

// New GET endpoint
app.get('/get', (req, res) => {
    res.send('Webhook accessible');
});

app.post('/webhook', async (req, res) => {
    console.log('Incoming request:', {
        method: req.method,
        headers: req.headers,
        body: req.body
    });

    const signature = req.headers['signature']; // Change this to 'x-sell-signature' if that's the correct header

    if (!verifySignature(req.body, signature)) {
        return res.status(400).send('Invalid signature');
    }

    const { event, data } = req.body;

    // Only process 'order.created' events
    if (event !== 'order.created') {
        return res.status(200).send('Event ignored');
    }

    const userEmail = data.payment.gateway.data.customer_email;
    const productName = data.product_variants[0].product_title;
    const planLevel = PLAN_MAP[productName] || 0;  // Default to Free if not found

    try {
        const db = client.db(dbName);
        const collection = db.collection(collectionName);

        // Find the user by email and update their plan
        const result = await collection.updateOne(
            { email: userEmail },
            { $set: { plan: planLevel } }
        );

        if (result.matchedCount === 0) {
            console.log(`User with email ${userEmail} not found.`);
            return res.status(404).send('User not found');
        }

        console.log(`User ${userEmail} upgraded to plan level ${planLevel}.`);
        res.status(200).send('Plan upgraded successfully');
    } catch (error) {
        console.error('Error updating user plan:', error);
        res.status(500).send('Internal Server Error');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
