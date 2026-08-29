FROM node:20-alpine AS base

WORKDIR /app

# Install dependencies needed for node-gyp or alpine build tools if needed
RUN apk add --no-cache libc6-compat

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Generate Prisma client if needed
RUN npx prisma generate || true

RUN mkdir -p /app/data

ENV NODE_ENV=production

CMD ["node", "src/app.js"]
