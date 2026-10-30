# Stage 1 builds the React client with every dependency (Vite is a dev dependency).
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2 runs Express with production dependencies only, serving the built client.
FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY src ./src
COPY migrations ./migrations
COPY scripts/migrate.js scripts/seed.js ./scripts/
USER node
EXPOSE 3000
# Pending migrations run before the server starts, so a deploy is a push and nothing else.
CMD ["sh", "-c", "node scripts/migrate.js && node src/server.js"]
