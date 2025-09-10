# 📱 WhatsApp Mini

### Introduction

I’ve always been fascinated by how WhatsApp works under the hood. When I learned that **WebSockets** power its real-time communication, I decided to build a **teeny tiny WhatsApp clone** to understand the engineering challenges at scale.

This project doesn’t implement every WhatsApp feature, but it does cover the **core backend mechanics** that make WhatsApp reliable, fast, and resilient — even across multiple servers.

---

### 🚀 Core Features

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

* 🔌 **ws (WebSocket Library)** → Handles real-time, bidirectional communication between clients and server with low overhead.

* 🛠️ **Prisma** → Database ORM for Postgres

* 📖 **Pino** → Structured logging for better observability

---



