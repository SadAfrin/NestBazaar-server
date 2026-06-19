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
        // Save user after registration
        app.post('/api/users', async (req, res) => {
            try {
                const { name, email, role, location, photo } = req.body;
                
                // Check if user already exists
                const existingUser = await usersCollection.findOne({ email });
                if (existingUser) {
                return res.status(200).json({ success: true, message: "User already exists" });
                }

                const newUser = {
                name,
                email,
                photo: photo || "",
                role: role || "buyer",
                location: location || "",
                phone: "",
                status: "active",
                createdAt: new Date(),
                };

                const result = await usersCollection.insertOne(newUser);
                res.status(201).json({ success: true, message: "User saved!", result });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // ---------------- PRODUCTS ----------------
        // TODO: add product routes here
        // GET all products (latest 8 for featured section)
        app.get('/api/products', async (req, res) => {
            try {
                const products = await productsCollection
                .find({ status: "available" })
                .sort({ _id: -1 })
                .limit(8)
                .toArray();
                res.status(200).json({ success: true, data: products });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // GET all products (with search, sort, filter, pagination)
        app.get('/api/products/all', async (req, res) => {
            try {
                const { search, category, condition, sort, page = 1, limit = 9 } = req.query;

                let query = { status: "available" };
                if (search) query.title = { $regex: search, $options: "i" };
                if (category) query.category = category;
                if (condition) query.condition = condition;

                let sortOption = { _id: -1 };
                if (sort === "price_low") sortOption = { price: 1 };
                if (sort === "price_high") sortOption = { price: -1 };

                const skip = (parseInt(page) - 1) * parseInt(limit);
                const total = await productsCollection.countDocuments(query);

                const products = await productsCollection
                    .find(query)
                    .sort(sortOption)
                    .skip(skip)
                    .limit(parseInt(limit))
                    .toArray();

                res.status(200).json({
                    success: true,
                    data: products,
                    total,
                    page: parseInt(page),
                    totalPages: Math.ceil(total / parseInt(limit)),
                });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // GET single product by ID
        app.get('/api/products/:id', async (req, res) => {
            try {
                const product = await productsCollection.findOne({
                _id: req.params.id
                });
                if (!product) {
                return res.status(404).json({ success: false, message: "Product not found" });
                }
                res.status(200).json({ success: true, data: product });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // ---------------- ORDERS ----------------
        // TODO: add order routes here

        // ---------------- PAYMENTS ----------------
        // TODO: add payment routes here

        // ---------------- Admin ----------------
        // Admin stats
        app.get('/api/admin/stats', async (req, res) => {
            try {
                const totalUsers = await usersCollection.countDocuments();
                const totalProducts = await productsCollection.countDocuments();
                const totalOrders = await ordersCollection.countDocuments();
                res.status(200).json({
                success: true,
                data: {
                    totalUsers,
                    totalProducts,
                    totalOrders,
                    totalRevenue: 0,
                }
                });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        console.log("Connected to MongoDB!");

    } finally {}
}

run().catch(console.dir);

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});