const express = require('express');
const crypto = require('crypto');
const { MongoClient } = require('mongodb');
require('dotenv').config(); // Load environment variables from .env

const app = express();
app.use(express.json({ limit: '1mb' })); // Increased body size limit if needed

// MongoDB connection settings from .env
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);
const dbName = process.env.DB_NAME;
const collectionName = process.env.COLLECTION_NAME;

// Webhook secret from .env
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

// Map product names to plan levels
const PLAN_MAP = {
  'Free': 0,
  'Starter': 1,
  'Pro': 2,
  'Enterprise': 3
};

// Verify webhook authenticity
function verifySignature(payload, signature) {
    const computedSignature = crypto
        .createHmac('sha256', WEBHOOK_SECRET)
        .update(payload) // Use raw payload
        .digest('hex');

    return crypto.timingSafeEqual(Buffer.from(computedSignature), Buffer.from(signature));
}

// New GET endpoint
app.get('/get', (req, res) => {
    res.send('Webhook accessible');
});

app.post('/webhook', async (req, res) => {
    const signature = req.headers['HTTP_SIGNATURE'];
    
    // Read the raw request body as a string
    const rawPayload = JSON.stringify(req.body);

    // Log for debugging
    console.log('Received payload:', rawPayload);
    console.log('Received signature:', signature);

    // Verify signature
    if (!verifySignature(rawPayload, signature)) {
        return res.status(400).send('Invalid signature');
    }

    const { event, data } = req.body;

    // Only process 'order.created' events
    if (event !== 'order.created') {
        return res.status(200).send('Event ignored');
    }

    const userEmail = data.payment.gateway.data.customer_email;
    const productName = data.product_variants[0].product_title;
    const planLevel = PLAN_MAP[productName] || 0; // Default to Free if not found

    try {
        await client.connect();
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
    } finally {
        await client.close();
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
