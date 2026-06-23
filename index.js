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

        const usersCollection = db.collection("users");
        const productsCollection = db.collection("products");
        const ordersCollection = db.collection("orders");
        const paymentsCollection = db.collection("payments");

        // Role-based authorization middleware
        const authorizeRole = (...roles) => {
            return async (req, res, next) => {
                try {
                    const email = req.user?.email;
                    if (!email) {
                        return res.status(403).json({ success: false, message: "Unauthorized!" });
                    }
                    const user = await usersCollection.findOne({ email });
                    if (!user || !roles.includes(user.role)) {
                        return res.status(403).json({
                            success: false,
                            message: `Access denied! Only ${roles.join(" or ")} allowed.`
                        });
                    }
                    next();
                } catch (error) {
                    return res.status(500).json({ success: false, error: error.message });
                }
            };
        };

        // Test route
        app.get('/', (req, res) => {
            res.send('NestBazaar Server is Running!');
        });

        // ---------------- USERS ----------------

        // Public — Save user after registration
        app.post('/api/users', async (req, res) => {
            try {
                const { name, email, role, location, photo } = req.body;
                const existingUser = await usersCollection.findOne({ email });
                if (existingUser) {
                    return res.status(200).json({ success: true, message: "User already exists" });
                }
                const newUser = {
                    name, email,
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

        // Public — Check if user exists
        app.get('/api/users/check', async (req, res) => {
            try {
                const { email } = req.query;
                const user = await usersCollection.findOne({ email });
                res.status(200).json({ exists: !!user, user });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Public — GET user role by email
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

        // Public — Update user role
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

        // Protected — GET user profile (any logged in user)
        app.get('/api/users/profile', authenticateToken, async (req, res) => {
            try {
                const { email } = req.query;
                const user = await usersCollection.findOne({ email });
                if (!user) return res.status(404).json({ success: false, message: "User not found" });
                res.status(200).json({ success: true, data: user });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Protected — UPDATE user profile (any logged in user)
        app.patch('/api/users/profile', authenticateToken, async (req, res) => {
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

        // Protected — GET wishlist (buyer only)
        app.get('/api/wishlist', authenticateToken, authorizeRole("buyer"), async (req, res) => {
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

        // Protected — ADD to wishlist (buyer only)
        app.post('/api/wishlist', authenticateToken, authorizeRole("buyer"), async (req, res) => {
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

        // Protected — REMOVE from wishlist (buyer only)
        app.delete('/api/wishlist', authenticateToken, authorizeRole("buyer"), async (req, res) => {
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

        // Public — GET featured products
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

        // Public — GET all products with search/sort/filter/pagination
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

        // Protected — GET products by seller email (seller only)
        app.get('/api/products/seller', authenticateToken, authorizeRole("seller"), async (req, res) => {
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

        // Protected — POST add new product (seller only)
        app.post('/api/products/add', authenticateToken, authorizeRole("seller"), async (req, res) => {
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

        // Protected — PATCH update product (seller only)
        app.patch('/api/products/update/:id', authenticateToken, authorizeRole("seller"), async (req, res) => {
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

        // Protected — DELETE product (seller or admin)
        app.delete('/api/products/:id', authenticateToken, authorizeRole("seller", "admin"), async (req, res) => {
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

        // Public — GET single product by ID
        app.get('/api/products/:id', async (req, res) => {
            try {
                let product;
                try {
                    product = await productsCollection.findOne({ _id: new ObjectId(req.params.id) });
                } catch {
                    product = await productsCollection.findOne({ _id: req.params.id });
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

        // Protected — Check if order exists (buyer only)
        app.get('/api/orders/check', authenticateToken, authorizeRole("buyer"), async (req, res) => {
            try {
                const { transactionId } = req.query;
                const order = await ordersCollection.findOne({ transactionId });
                res.status(200).json({ exists: !!order });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Protected — GET orders by buyer email (buyer only)
        app.get('/api/orders', authenticateToken, authorizeRole("buyer"), async (req, res) => {
            try {
                const { email } = req.query;
                const query = email ? { "buyerInfo.email": email } : {};
                const orders = await ordersCollection.find(query).sort({ _id: -1 }).toArray();
                res.status(200).json({ success: true, data: orders });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Protected — GET orders by seller email (seller only)
        app.get('/api/orders/seller', authenticateToken, authorizeRole("seller"), async (req, res) => {
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

        // Protected — POST create order (buyer only)
        app.post('/api/orders', authenticateToken, authorizeRole("buyer"), async (req, res) => {
            try {
                const order = {
                    ...req.body,
                    createdAt: new Date(),
                    orderStatus: req.body.orderStatus || "pending",
                    paymentStatus: req.body.paymentStatus || "pending",
                };
                const result = await ordersCollection.insertOne(order);
                res.status(201).json({ success: true, message: "Order created!", result });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Protected — PATCH update order status (seller or admin)
        app.patch('/api/orders/:id', authenticateToken, authorizeRole("seller", "admin"), async (req, res) => {
            try {
                const { id } = req.params;
                let result;
                try {
                    result = await ordersCollection.updateOne(
                        { _id: new ObjectId(id) },
                        { $set: { ...req.body, updatedAt: new Date() } }
                    );
                } catch {
                    result = await ordersCollection.updateOne(
                        { _id: id },
                        { $set: { ...req.body, updatedAt: new Date() } }
                    );
                }
                res.status(200).json({ success: true, message: "Order updated!", result });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // ---------------- PAYMENTS ----------------

        // Protected — GET payments (buyer only)
        app.get('/api/payments', authenticateToken, authorizeRole("buyer"), async (req, res) => {
            try {
                const { email } = req.query;
                const query = email ? { buyerEmail: email } : {};
                const payments = await paymentsCollection.find(query).sort({ _id: -1 }).toArray();
                res.status(200).json({ success: true, data: payments });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Protected — POST save payment (buyer only)
        app.post('/api/payments', authenticateToken, authorizeRole("buyer"), async (req, res) => {
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


        // ---------------- REVIEWS ---------------- 
        app.get('/api/reviews/:productId', async (req, res) => {
            try {
                const { productId } = req.params;
                const reviews = await reviewsCollection
                    .find({ productId })
                    .sort({ _id: -1 })
                    .toArray();
                res.status(200).json({ success: true, data: reviews });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Protected — POST add review (buyer only)
        app.post('/api/reviews', authenticateToken, authorizeRole("buyer"), async (req, res) => {
            try {
                const review = {
                    ...req.body,
                    createdAt: new Date(),
                };
                const result = await reviewsCollection.insertOne(review);
                res.status(201).json({ success: true, message: "Review added!", result });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // ---------------- ADMIN ----------------

        // Protected — Admin stats (admin only)
        app.get('/api/admin/stats', authenticateToken, authorizeRole("admin"), async (req, res) => {
            try {
                const totalUsers = await usersCollection.countDocuments();
                const totalProducts = await productsCollection.countDocuments();
                const totalOrders = await ordersCollection.countDocuments();
                const payments = await paymentsCollection.find({ paymentStatus: "paid" }).toArray();
                const totalRevenue = payments.reduce((acc, payment) => acc + (payment.amount || 0), 0);
                res.status(200).json({
                    success: true,
                    data: { totalUsers, totalProducts, totalOrders, totalRevenue }
                });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Protected — GET all users (admin only)
        app.get('/api/admin/users', authenticateToken, authorizeRole("admin"), async (req, res) => {
            try {
                const users = await usersCollection.find().sort({ createdAt: -1 }).toArray();
                res.status(200).json({ success: true, data: users });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Protected — UPDATE user status (admin only)
        app.patch('/api/admin/users/status', authenticateToken, authorizeRole("admin"), async (req, res) => {
            try {
                const { email, status } = req.body;
                await usersCollection.updateOne(
                    { email },
                    { $set: { status, updatedAt: new Date() } }
                );
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

        // Protected — DELETE user (admin only)
        app.delete('/api/admin/users', authenticateToken, authorizeRole("admin"), async (req, res) => {
            try {
                const { email } = req.query;
                await usersCollection.deleteOne({ email });
                const betterAuthUsers = db.collection("user");
                await betterAuthUsers.deleteOne({ email });
                const betterAuthAccounts = db.collection("account");
                await betterAuthAccounts.deleteMany({ accountId: email });
                res.status(200).json({ success: true, message: "User deleted!" });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Protected — GET all products for admin (admin only)
        app.get('/api/admin/products', authenticateToken, authorizeRole("admin"), async (req, res) => {
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

        // Protected — UPDATE product status (admin only)
        app.patch('/api/admin/products/status', authenticateToken, authorizeRole("admin"), async (req, res) => {
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

        // Protected — GET all orders for admin (admin only)
        app.get('/api/admin/orders', authenticateToken, authorizeRole("admin"), async (req, res) => {
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

        // Protected — Update BetterAuth role (admin only)
        app.patch('/api/admin/users/update-betterauth-role', authenticateToken, authorizeRole("admin"), async (req, res) => {
            try {
                const { email, role } = req.body;
                const betterAuthUsers = db.collection("user");
                await betterAuthUsers.updateOne(
                    { email },
                    { $set: { role, updatedAt: new Date() } }
                );
                res.status(200).json({ success: true, message: "BetterAuth role updated!" });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Protected — GET all payments for admin (admin only)
        app.get('/api/admin/payments', authenticateToken, authorizeRole("admin"), async (req, res) => {
            try {
                const payments = await paymentsCollection
                    .find()
                    .sort({ _id: -1 })
                    .toArray();
                res.status(200).json({ success: true, data: payments });
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