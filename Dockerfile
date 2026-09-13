# build
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
# --ignore-scripts: root postinstall builds @lanmap/shared, whose sources
# are only copied in the next step. The explicit build below covers it.
RUN npm install --no-audit --no-fund --ignore-scripts
COPY shared/ shared/
COPY backend/ backend/
COPY frontend/ frontend/
COPY tsconfig.base.json ./
RUN npm run build -w @lanmap/shared && npm run build -w lanmap-backend && npm run build -w lanmap-frontend
RUN npm prune --omit=dev --no-audit --no-fund

# runtime — same major Node as build (node:sqlite needs Node 22+)
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends iputils-ping iproute2 ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/shared ./shared
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/package.json ./backend/package.json
COPY --from=build /app/frontend/dist ./frontend-dist
ENV PORT=8081 DATA_DIR=/data NODE_ENV=production
EXPOSE 8081
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]
USER node
CMD ["node", "/app/backend/dist/index.js"]
