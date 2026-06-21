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

        // Save user after registration
        app.post('/api/users', async (req, res) => {
            try {
                const { name, email, role, location, photo } = req.body;
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

        // Check if user exists
        app.get('/api/users/check', async (req, res) => {
            try {
                const { email } = req.query;
                const user = await usersCollection.findOne({ email });
                res.status(200).json({ exists: !!user, user });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // GET user role by email
        app.get('/api/users/role', async (req, res) => {
            try {
                const { email } = req.query;
                const user = await usersCollection.findOne({ email });
                if (!user) {
                    return res.status(404).json({ success: false, message: "User not found" });
                }
                res.status(200).json({ success: true, role: user.role });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Update user role
        app.patch('/api/users/update-role', async (req, res) => {
            try {
                const { email, role } = req.body;
                const result = await usersCollection.updateOne(
                    { email },
                    { $set: { role, updatedAt: new Date() } }
                );
                res.status(200).json({ success: true, message: "Role updated!", result });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // GET user profile by email
        app.get('/api/users/profile', async (req, res) => {
            try {
                const { email } = req.query;
                const user = await usersCollection.findOne({ email });
                if (!user) return res.status(404).json({ success: false, message: "User not found" });
                res.status(200).json({ success: true, data: user });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // UPDATE user profile
        app.patch('/api/users/profile', async (req, res) => {
            try {
                const { email, name, phone, location, photo } = req.body;
                const result = await usersCollection.updateOne(
                    { email },
                    {
                        $set: {
                            name,
                            phone: phone || "",
                            location: location || "",
                            photo: photo || "",
                            updatedAt: new Date()
                        }
                    }
                );
                res.status(200).json({ success: true, message: "Profile updated!", result });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // ---------------- WISHLIST ----------------

        // GET wishlist by user email
        app.get('/api/wishlist', async (req, res) => {
            try {
                const { email } = req.query;
                const user = await usersCollection.findOne({ email });
                if (!user) return res.status(404).json({ success: false, message: "User not found" });
                const wishlist = user.wishlist || [];
                const products = await productsCollection
                    .find({ _id: { $in: wishlist } })
                    .toArray();
                res.status(200).json({ success: true, data: products });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // ADD to wishlist
        app.post('/api/wishlist', async (req, res) => {
            try {
                const { email, productId } = req.body;
                await usersCollection.updateOne(
                    { email },
                    { $addToSet: { wishlist: productId } }
                );
                res.status(200).json({ success: true, message: "Added to wishlist!" });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // REMOVE from wishlist
        app.delete('/api/wishlist', async (req, res) => {
            try {
                const { email, productId } = req.body;
                await usersCollection.updateOne(
                    { email },
                    { $pull: { wishlist: productId } }
                );
                res.status(200).json({ success: true, message: "Removed from wishlist!" });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // ---------------- PRODUCTS ----------------

        // GET featured products (latest 8)
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

        // GET products by seller email ← BEFORE /:id
        app.get('/api/products/seller', async (req, res) => {
            try {
                const { email } = req.query;
                const products = await productsCollection
                    .find({ "sellerInfo.email": email })
                    .sort({ _id: -1 })
                    .toArray();
                res.status(200).json({ success: true, data: products });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // POST add new product ← BEFORE /:id
        app.post('/api/products/add', async (req, res) => {
            try {
                const product = {
                    ...req.body,
                    createdAt: new Date(),
                };
                const result = await productsCollection.insertOne(product);
                res.status(201).json({ success: true, message: "Product added!", result });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // DELETE product by ID ← BEFORE /:id GET
        app.delete('/api/products/:id', async (req, res) => {
            try {
                let result;
                try {
                    result = await productsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
                } catch {
                    result = await productsCollection.deleteOne({ _id: req.params.id });
                }
                if (result.deletedCount === 0) {
                    return res.status(404).json({ success: false, message: "Product not found" });
                }
                res.status(200).json({ success: true, message: "Product deleted!" });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // PATCH update product
        app.patch('/api/products/update/:id', async (req, res) => {
            try {
                let result;
                try {
                    result = await productsCollection.updateOne(
                        { _id: new ObjectId(req.params.id) },
                        { $set: { ...req.body, updatedAt: new Date() } }
                    );
                } catch {
                    result = await productsCollection.updateOne(
                        { _id: req.params.id },
                        { $set: { ...req.body, updatedAt: new Date() } }
                    );
                }
                res.status(200).json({ success: true, message: "Product updated!", result });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // GET single product by ID
        app.get('/api/products/:id', async (req, res) => {
            try {
                let product;

                // Try ObjectId first (new products added by sellers)
                try {
                    product = await productsCollection.findOne({ 
                        _id: new ObjectId(req.params.id) 
                    });
                } catch {
                    // If not valid ObjectId try string ID (old manual products)
                    product = await productsCollection.findOne({ 
                        _id: req.params.id 
                    });
                }

                if (!product) {
                    return res.status(404).json({ success: false, message: "Product not found" });
                }
                res.status(200).json({ success: true, data: product });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        
        // ---------------- ORDERS ----------------

        // GET orders by buyer email
        app.get('/api/orders', async (req, res) => {
            try {
                const { email } = req.query;
                const query = email ? { "buyerInfo.email": email } : {};
                const orders = await ordersCollection.find(query).sort({ _id: -1 }).toArray();
                res.status(200).json({ success: true, data: orders });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // POST create order
        app.post('/api/orders', async (req, res) => {
            try {
                const order = {
                    ...req.body,
                    createdAt: new Date(),
                    orderStatus: "pending",
                    paymentStatus: "pending",
                };
                const result = await ordersCollection.insertOne(order);
                res.status(201).json({ success: true, message: "Order created!", result });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // GET orders by seller email
        app.get('/api/orders/seller', async (req, res) => {
        try {
            const { email } = req.query;
            const orders = await ordersCollection
            .find({ "sellerInfo.email": email })
            .sort({ _id: -1 })
            .toArray();
            res.status(200).json({ success: true, data: orders });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
        });

        // PATCH update order status
        app.patch('/api/orders/:id', async (req, res) => {
            try {
                const { id } = req.params;
                const result = await ordersCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { ...req.body, updatedAt: new Date() } }
                );
                res.status(200).json({ success: true, message: "Order updated!", result });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // ---------------- PAYMENTS ----------------

        // GET payments by buyer email
        app.get('/api/payments', async (req, res) => {
            try {
                const { email } = req.query;
                const query = email ? { buyerEmail: email } : {};
                const payments = await paymentsCollection.find(query).sort({ _id: -1 }).toArray();
                res.status(200).json({ success: true, data: payments });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // POST save payment
        app.post('/api/payments', async (req, res) => {
            try {
                const payment = {
                    ...req.body,
                    createdAt: new Date(),
                };
                const result = await paymentsCollection.insertOne(payment);
                res.status(201).json({ success: true, message: "Payment saved!", result });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // ---------------- ADMIN ----------------

        // Admin stats
        app.get('/api/admin/stats', async (req, res) => {
            try {
                const totalUsers = await usersCollection.countDocuments();
                const totalProducts = await productsCollection.countDocuments();
                const totalOrders = await ordersCollection.countDocuments();
                const payments = await paymentsCollection.find({ paymentStatus: "success" }).toArray();
                const totalRevenue = payments.reduce((acc, payment) => acc + (payment.amount || 0), 0);
                res.status(200).json({
                    success: true,
                    data: {
                        totalUsers,
                        totalProducts,
                        totalOrders,
                        totalRevenue,
                    }
                });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // GET all users
        app.get('/api/admin/users', async (req, res) => {
        try {
            const users = await usersCollection.find().sort({ createdAt: -1 }).toArray();
            res.status(200).json({ success: true, data: users });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
        });

        // UPDATE user status (block/unblock)
        app.patch('/api/admin/users/status', async (req, res) => {
            try {
                const { email, status } = req.body;

                // Update our users collection
                await usersCollection.updateOne(
                { email },
                { $set: { status, updatedAt: new Date() } }
                );

                // Update BetterAuth user collection
                const betterAuthUsers = db.collection("user");
                await betterAuthUsers.updateOne(
                { email },
                { $set: { banned: status === "blocked" } }
                );

                res.status(200).json({ success: true, message: "User status updated!" });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // DELETE user
        // DELETE user from both collections
        app.delete('/api/admin/users', async (req, res) => {
            try {
                const { email } = req.query;

                // Delete from our users collection
                await usersCollection.deleteOne({ email });

                // Delete from BetterAuth user collection
                const betterAuthUsers = db.collection("user");
                await betterAuthUsers.deleteOne({ email });

                // Delete from BetterAuth account collection
                const betterAuthAccounts = db.collection("account");
                await betterAuthAccounts.deleteMany({ accountId: email });

                res.status(200).json({ success: true, message: "User deleted!" });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // GET all products for admin
        app.get('/api/admin/products', async (req, res) => {
            try {
                const products = await productsCollection
                .find()
                .sort({ _id: -1 })
                .toArray();
                res.status(200).json({ success: true, data: products });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // UPDATE product status (approve/reject)
        app.patch('/api/admin/products/status', async (req, res) => {
            try {
                const { id, status } = req.body;
                let result;
                try {
                result = await productsCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { status, updatedAt: new Date() } }
                );
                } catch {
                result = await productsCollection.updateOne(
                    { _id: id },
                    { $set: { status, updatedAt: new Date() } }
                );
                }
                res.status(200).json({ success: true, message: "Product status updated!", result });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // GET all orders for admin
        app.get('/api/admin/orders', async (req, res) => {
        try {
            const orders = await ordersCollection
            .find()
            .sort({ _id: -1 })
            .toArray();
            res.status(200).json({ success: true, data: orders });
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