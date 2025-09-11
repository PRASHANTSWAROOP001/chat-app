# 📱 WhatsApp Mini

## Introduction

I’ve always been fascinated by how WhatsApp works under the hood. When I learned that **WebSockets** power its real-time communication, I decided to build a **teeny tiny WhatsApp clone** to understand the engineering challenges at scale.

This project doesn’t implement every WhatsApp feature, but it does cover the **core backend mechanics** that make WhatsApp reliable, fast, and resilient — even across multiple servers.

---

## 🚀 Core Features

* **Block / Unblock (at scale)**
  Fast checks before every message delivery — just like WhatsApp.

* **Online Status (anti-ghost mode)**
  Ensures blocked users can’t fake presence. No false “online” statuses for offline users.

* **Reliable Messaging + Cross-Server Delivery**

  * Works even when users are on different servers.
  * Offline messages are re-delivered once the recipient reconnects.
  * Achieves \~99% delivery success (assuming at least one live server).

* **Delivered Receipts**
  Like WhatsApp’s double tick ✅ (read receipts depend on frontend).

---

## 🛠️ Tech Stack

* 🧠 **Redis** → Used as an in-memory database for:

  * Fast user lookups
  * Tracking **last seen** status
  * Managing **blocked/unblocked** state

* 📜 **Redis Streams** → Reliable message queue with:

  * Consumer groups + `XACK` / `XDEL` for quick handling of pending/undelivered messages
  * Each message is first stored in the stream → only then forwarded to the recipient socket
  * Preserved until a **delivery ACK** is received from the receiver

* 🐘 **PostgreSQL** → Persistent database for:

  * Login / Logout events
  * **(No chat logs stored)** → by design, to avoid insecure plain-text storage
  * Future scope: using pub/sub to push messages to a **Go microservice** for encryption (public/private key) without overloading the main server

* ⚡ **Node.js + TypeScript** → Core backend runtime & type safety

* 🔌 **ws (WebSocket Library)** → Handles real-time, bidirectional communication

* 🛠️ **Prisma** → Database ORM for Postgres

* 📖 **Pino** → Structured logging for better observability

---

## 🏗️ Architecture Diagram
<img width="994" height="1189" alt="Architecture Diagram" src="https://github.com/user-attachments/assets/1dded0cd-d9d0-45eb-9f7c-dc5c55141de5" />




---

## ⚙️ Feature Design

### 1. 🔒 Block / Unblock Feature

**Problem**

* Every message must check if the **sender is blocked** by the recipient.
* At scale, this check must be extremely fast.
* The only data we initially have about the recipient is their **mobile number**, which makes lookup tricky.

**Solution**

* Using Redis instead of a database (faster at scale).
* Naïve approach:

  * 1 lookup to translate mobile → user ID.
  * 1 lookup to check block status.
  * ❌ Two round trips = overhead.
* Optimized approach:

  * Store block data as:

    ```
    blockedUser:${blockerMobileNo} → Set(blockedIds)
    ```
  * Sender’s ID is carried in JWT, so we directly check with:

    ```redis
    SISMEMBER blockedUser:1234 5678
    ```
  * ✅ O(1) lookup with a single Redis operation.

**Outcome**

* Saved one Redis round trip per message.
* Scales smoothly under high message volume.

---

### 2. 🟢 Reliable Online Status

**Problem**

* WebSockets are fragile: connections can silently drop.
* If we rely only on `onConnect` / `onClose`, users may appear online for a long time after disconnecting.

**Solution**

* Use WebSocket **ping/pong** frames:

  * Server sends `ping`.
  * Client must reply with `pong`.
* If 2 consecutive pings (\~60s) fail → connection dropped.
* At that time, update status from **Online → Last Seen**.

**Outcome**

* Removes dead/unhealthy connections from server.
* Maintains online/last seen status with \~1 min accuracy.
* Much more reliable than naive connect/disconnect checks.

---

### 3. 🔄 Cross-Server Communication (Redis Pub/Sub)

**Problem**

* WebSockets suffer from **sticky connections**: once connected to a server, a client cannot easily hop to another.
* If sender and receiver are on different servers, direct delivery breaks.

**Solution**

* Store each user’s `serverId` in Redis.
* **Case 1: Same Server** → Deliver instantly in `O(1)` via in-memory map.
* **Case 2: Different Servers** → Use **Redis Pub/Sub**:

  * Message published to Redis.
  * Only the recipient’s server (matching `serverId`) consumes it.
  * That server forwards the payload via WebSocket.

**Outcome**

* Efficient cross-server messaging with minimal latency.
* Prevents broadcasting to all servers → reduces risk of leaks.
* Horizontally scalable → adding servers doesn’t break messaging.

---

### 4. 📩 Reliable Messaging (Redis Streams + ACKs)

**Problem**

* WebSockets alone are unreliable (connection may drop mid-delivery).
* Messages need to persist until the recipient explicitly acknowledges receipt.

**Solution**

* Use **Redis Streams** + ACK mechanism:

  * Message stored in stream **before** sending.
  * Delivered via WebSocket.
  * Recipient replies with ACK → server safely deletes from stream.
* If recipient never ACKs, message remains in stream → retried until delivered.
* Redis Streams allow:

  * Consumer groups → multiple servers safely reading.
  * Pending messages → automatically retried.

**Outcome**

* At-most-once reliable delivery with retries.
* Offline messaging supported (pending messages delivered once user reconnects).
* Stream growth managed with **capped size** based on infra scale.

---

## 📡 API Documentation

#### 🔑 Authentication

##### **1. Create Account (Signup)**

```http
POST /auth/signin
```

**Description:** Create a new account.

**Payload**

```json
{
  "name": "string",
  "mobileNo": "string",
  "password": "string"
}
```

**Response**

```json
{
  "success": true,
  "message": "account created successfully",
  "id": "string"
}
```

---

##### **2. Login**

```http
POST /auth/login
```

**Description:** Login with mobile number and password.

**Payload**

```json
{
  "mobileNo": "string",
  "password": "string"
}
```

**Response**

```json
{
  "success": true,
  "message": "login successful",
  "token": "auth_token"
}
```

---

#### 🚫 Block / Unblock Actions

##### **3. Block User**

```http
POST /block-action/block
```

**Description:** Block a user by mobile number (requires Bearer token).

**Payload**

```json
{
  "blockedUserMobileNo": "string"
}
```

**Response**

```json
{
  "success": true,
  "message": "User blocked successfully"
}
```

---

##### **4. Unblock User**

```http
DELETE /block-action/unblock?mobileNo=10digitNo
```

**Description:** Unblock a user (requires Bearer token).

**Response**

```json
{
  "success": true,
  "message": "User unblocked successfully"
}
```

---

#### 👤 Profile

##### **5. Get Last Seen**

```http
GET /profile/lastseen?mobileNo=10digitNo
```

**Description:** Fetch last seen status of a user (requires Bearer token).

**Response**

```json
{
  "success": true,
  "data": {
    "username": "string",
    "mobileNo": "string",
    "lastSeen": "string (optional)"
  }
}
```

---


### 🚀 Quick Start

Follow these steps to run **WhatsApp Mini** locally:

#### 1️⃣ Clone the repository

```bash
git clone https://github.com/PRASHANTSWAROOP001/chat-app.git
cd chat-app
```

#### 2️⃣ Install dependencies & build

```bash
npm install
npm run build
```

#### 3️⃣ Start dependencies (Postgres + Redis)

Using Docker Compose:

```bash
docker compose up -d
```

> ⚠️ Don’t forget to run `docker compose down` when done, otherwise containers will keep running in the background.

#### 4️⃣ Start the server

```bash
npm run dev
```

Your backend is now running on **[http://localhost:5000](http://localhost:5000)** 🎉


---

### 📂 Project Structure

```bash
├── dist                  # Compiled JS output (after build)
├── logs                  # Application logs
├── node_modules          # Dependencies
├── prisma                # Prisma schema & migrations
├── src                   # Application source code
│   ├── controller        # Route controllers
│   ├── middleware        # Express middleware
│   ├── routes            # API routes
│   ├── socketHandler     # WebSocket event handling
│   ├── types             # TypeScript types/interfaces
│   ├── utils             # Utility functions/helpers
│   └── server.ts         # Application entry point
├── .dockerignore         # Docker ignore rules
├── .env                  # Local environment variables
├── .env.sample           # Sample env vars for setup
├── .gitignore            # Git ignore rules
├── docker-compose.yml    # Redis + Postgres services
├── Dockerfile            # App container definition
├── package-lock.json     
├── package.json          
├── readme.md             # Project documentation
├── tsconfig.json         # TypeScript config
└── tsconfig.tsbuildinfo  # TS incremental build info
```

---