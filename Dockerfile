# -------- STAGE 1: Build --------
FROM node:22-alpine AS builder

# Set working dir
WORKDIR /app

# Copy only package files first for better caching
COPY package*.json ./

# Install all deps (including dev, needed for TypeScript + Prisma)
RUN npm ci

# Copy the rest of the source
COPY . .

# Compile TS -> JS
RUN npm run build

# Generate Prisma Client
RUN npx prisma generate

# Prune devDependencies (keep only prod deps)
RUN npm prune --omit=dev


# -------- STAGE 2: Runtime --------
FROM node:22-alpine AS runtime

WORKDIR /app

# Copy node_modules (already pruned to prod-only)
COPY --from=builder /app/node_modules ./node_modules

# Copy dist (compiled JS)
COPY --from=builder /app/dist ./dist

# Copy Prisma schema + migrations (needed by client at runtime)
COPY --from=builder /app/prisma ./prisma

# Logs folder
RUN mkdir -p /app/logs
VOLUME ["/app/logs"]

# App port
EXPOSE 3000

# Start command
CMD ["node", "dist/server.js"]
