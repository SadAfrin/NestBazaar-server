const dns = require('node:dns'); 
dns.setServers(["8.8.8.8", "8.8.4.4"]);
// --------------------------------------------------------------------

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
// MODIFICATION: jose-cjs import
const { createRemoteJWKSet, jwtVerify } = require('jose-cjs');
// -----------------------------------------------------------------------
dotenv.config();

const app = express();
const PORT = process.env.PORT;

// CORS Configuration
app.use(cors({ origin: `${process.env.CLIENT_URL}`, credentials: true }));
app.use(express.json());

// ---------------- JWT Middleware ----------------
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
        return res.status(401).json({ success: false, message: "No token provided." });
    }

    try {
        const JWKS = createRemoteJWKSet(new URL(`${process.env.CLIENT_URL}/api/auth/jwks`));
        const { payload } = await jwtVerify(token, JWKS, {
            issuer: `${process.env.CLIENT_URL}`,
            audience: `${process.env.CLIENT_URL}`,
        });
        req.user = payload;
        next();
    } catch (error) {
        return res.status(403).json({ success: false, message: "Invalid or expired token." });
    }
};
// ---------------------------------------------------------------

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
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
        
        // await client.connect();
        // console.log("Connected to MongoDB successfully!");
        const db = client.db("doc-appoint-project-db");
        const appointmentsCollection = db.collection("appointments");
        const usersCollection = db.collection("user");
        const doctorsCollection = db.collection("doctors");

        // ---------------- BOOKINGS ----------------------------------------------------------------------------
        app.post('/api/bookings', authenticateToken, async (req, res) => {
            try {
                const result = await appointmentsCollection.insertOne(req.body);
                res.status(201).json({ success: true, message: "Appointment booked successfully!", result });
            } catch (error) {
                res.status(500).json({ success: false, message: "Failed to book appointment", error: error.message });
            }
        });

        app.get('/api/bookings', authenticateToken, async (req, res) => {
            try {
                const { email } = req.query;
                const query = email ? { userEmail: email } : {};
                const result = await appointmentsCollection.find(query).toArray();
                res.status(200).json({ success: true, result });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        app.patch('/api/bookings/:id', authenticateToken, async (req, res) => {
            try {
                const { id } = req.params;
                const updateDoc = { $set: req.body };
                const result = await appointmentsCollection.updateOne({ _id: new ObjectId(id) }, updateDoc);
                res.status(200).json({ success: true, message: "Appointment updated!", result });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        app.delete('/api/bookings/:id', authenticateToken, async (req, res) => {
            try {
                const { id } = req.params;
                const result = await appointmentsCollection.deleteOne({ _id: new ObjectId(id) });
                res.status(200).json({ success: true, message: "Deleted successfully!" });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // ---------------- USERS ---------------------------------------------------------------------------------
        app.patch('/api/users/update-profile', authenticateToken, async (req, res) => {
            try {
                const { email, name, image } = req.body;
                const result = await usersCollection.updateOne({ email }, { $set: { name, image } });
                res.status(200).json({ success: true, message: "Profile updated!", result });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // ---------------- DOCTORS ----------------------------------------------------------------------------------
        
        app.post("/api/doctors/add", authenticateToken, async (req, res) => {
            try {
                const { adminEmail, doctorData } = req.body;
                if (adminEmail !== process.env.ADMIN_EMAIL) {
                    return res.status(403).json({ success: false, message: "Unauthorized access" });
                }
                const result = await doctorsCollection.insertOne(doctorData);
                res.status(201).json({ success: true, data: result });
            } catch (err) {
                res.status(500).json({ success: false, error: err.message });
            }
        });

        app.get("/api/doctors", async (req, res) => {
            try {
                const { search } = req.query;
                const query = search ? { name: { $regex: search, $options: "i" } } : {};
                const doctors = await doctorsCollection.find(query).toArray();
                res.status(200).json({ success: true, data: doctors });
            } catch (err) {
                res.status(500).json({ success: false, error: err.message });
            }
        });

        app.get("/api/doctors/:id", authenticateToken, async (req, res) => {
            try {
                const doctor = await doctorsCollection.findOne({ _id: new ObjectId(req.params.id) });
                res.status(200).json({ success: true, data: doctor });
            } catch (err) {
                res.status(500).json({ success: false, error: err.message });
            }
        });

        app.patch("/api/doctors/:id", authenticateToken, async (req, res) => {
            try {
                const result = await doctorsCollection.updateOne(
                    { _id: new ObjectId(req.params.id) },
                    { $set: { experience: req.body.experience } }
                );
                res.status(200).json({ success: true, message: "Experience updated", result });
            } catch (err) {
                res.status(500).json({ success: false, error: err.message });
            }
        });

        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
// ----------------------------------------------------------------------------------------
run().catch(console.dir);
//-----------------------------------------------------------------------------------------

app.get('/', (req, res) => {
    res.send('Server is Running Smoothly!');
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});