# -------- STAGE 1: Build --------
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Compile TS -> JS
RUN npm run build

# Generate Prisma Client
RUN npx prisma generate


# -------- STAGE 2: Runtime --------
FROM node:22-alpine AS runtime

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

# Copy compiled dist + prisma client
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

RUN mkdir -p /app/logs
VOLUME ["/app/logs"]

EXPOSE 3000
CMD ["node", "dist/server.js"]
