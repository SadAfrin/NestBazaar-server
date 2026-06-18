const dns = require('node:dns');
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { createRemoteJWKSet, jwtVerify } = require('jose-cjs');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// CORS
app.use(cors({
    origin: process.env.CLIENT_URL,
    credentials: true
}));
app.use(express.json());

// JWT Middleware
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
        return res.status(401).json({ success: false, message: "No token provided." });
    }

    try {
        const JWKS = createRemoteJWKSet(
            new URL(`${process.env.CLIENT_URL}/api/auth/jwks`)
        );
        const { payload } = await jwtVerify(token, JWKS, {
            issuer: process.env.CLIENT_URL,
            audience: process.env.CLIENT_URL,
        });
        req.user = payload;
        next();
    } catch (error) {
        return res.status(403).json({ success: false, message: "Invalid or expired token." });
    }
};

// MongoDB
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        const db = client.db("nest-bazaar-db");

        // Collections
        const usersCollection = db.collection("users");
        const productsCollection = db.collection("products");
        const ordersCollection = db.collection("orders");
        const reviewsCollection = db.collection("reviews");
        const paymentsCollection = db.collection("payments");

        // ✅ Test route
        app.get('/', (req, res) => {
            res.send('NestBazaar Server is Running!');
        });

        // ---------------- USERS ----------------
        // TODO: add user routes here

        // ---------------- PRODUCTS ----------------
        // TODO: add product routes here

        // ---------------- ORDERS ----------------
        // TODO: add order routes here

        // ---------------- PAYMENTS ----------------
        // TODO: add payment routes here

        console.log("Connected to MongoDB!");

    } finally {}
}

run().catch(console.dir);

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});