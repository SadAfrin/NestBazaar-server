# NestBazaar Server — REST API

Express.js backend server for NestBazaar second-hand marketplace.

🔧 **Live Server:** [https://nest-bazaar-server.vercel.app](https://nest-bazaar-server.vercel.app)
🌐 **Client:** [https://nest-bazaar-client.vercel.app](https://nest-bazaar-client.vercel.app)

---

## 🛠️ Tech Stack

| Technology | Purpose |
|------------|---------|
| Express.js | REST API framework |
| MongoDB Atlas | Database |
| jose-cjs | JWT token verification |
| Stripe | Payment processing |
| dotenv | Environment variables |

---

## 🔐 Security

- JWT token verification on all private routes
- Role-based authorization — buyer, seller, admin
- CORS configured for client URL only

---

## 📡 API Routes

### Public
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/products` | Featured products |
| GET | `/api/products/all` | All products with search/filter/sort/pagination |
| GET | `/api/products/:id` | Single product |
| POST | `/api/users` | Save new user |
| GET | `/api/users/check` | Check if user exists |
| GET | `/api/users/role` | Get user role |
| GET | `/api/reviews/:productId` | Get product reviews |

### Protected — Buyer
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/orders` | Get buyer orders |
| POST | `/api/orders` | Create order |
| GET | `/api/payments` | Get payment history |
| POST | `/api/payments` | Save payment |
| GET | `/api/wishlist` | Get wishlist |
| POST | `/api/wishlist` | Add to wishlist |
| DELETE | `/api/wishlist` | Remove from wishlist |
| POST | `/api/reviews` | Add review |

### Protected — Seller
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/products/seller` | Get seller products |
| POST | `/api/products/add` | Add product |
| PATCH | `/api/products/update/:id` | Update product |
| GET | `/api/orders/seller` | Get seller orders |

### Protected — Seller or Admin
| Method | Route | Description |
|--------|-------|-------------|
| PATCH | `/api/orders/:id` | Update order status |
| DELETE | `/api/products/:id` | Delete product |

### Protected — Admin
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/admin/stats` | Platform statistics |
| GET | `/api/admin/users` | All users |
| PATCH | `/api/admin/users/status` | Block/unblock user |
| DELETE | `/api/admin/users` | Delete user |
| GET | `/api/admin/products` | All products |
| PATCH | `/api/admin/products/status` | Approve/reject product |
| GET | `/api/admin/orders` | All orders |
| GET | `/api/admin/payments` | All payments |

---

## ⚙️ Environment Variables

```env
MONGODB_URI=
CLIENT_URL=
PORT=5000
```

---

## Run Locally

```bash
git clone https://github.com/SadAfrin/NestBazaar-server.git
cd NestBazaar-server
npm install
node index.js
```

---

## Developer

**Sadia Afrin** — PH-L1 | Assignment 10