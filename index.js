const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose'); // Ensure Mongoose is imported
require('dotenv').config();  // Load environment variables from .env

const app = express();
app.use(express.json());

// MongoDB connection settings from .env
const mongoAtlasUri = process.env.MONGODB_URI; // Ensure this variable is defined in .env
const dbName = process.env.DB_NAME; // Ensure this variable is defined in .env

// Webhook secret from .env
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET; // Ensure this variable is defined in .env

// Connect to MongoDB using Mongoose
mongoose.connect(mongoAtlasUri, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('MongoDB connected successfully'))
    .catch(error => console.error('MongoDB connection error:', error));

// Define a Mongoose schema and model
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    plan: { type: Number, default: 0 } // Assuming plan is an integer
});

const User = mongoose.model('User', userSchema);

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

    const { event, data } = req.body;

    // Only process 'order.created' events
    if (event !== 'order.created') {
        return res.status(200).send('Event ignored');
    }

    const userEmail = data.payment.gateway.data.customer_email;
    const productName = data.product_variants[0].product_title;
    const planLevel = PLAN_MAP[productName] || 0;  // Default to Free if not found

    try {
        // Find the user by email and update their plan
        const result = await User.updateOne(
            { email: userEmail },
            { $set: { plan: planLevel } },
            { new: true, upsert: true } // Create the user if not found
        );

        if (result.matchedCount === 0) {
            console.log(`User with email ${userEmail} not found and created.`);
        } else {
            console.log(`User ${userEmail} upgraded to plan level ${planLevel}.`);
        }

        res.status(200).send('Plan upgraded successfully');
    } catch (error) {
        console.error('Error updating user plan:', error);
        res.status(500).send('Internal Server Error');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
