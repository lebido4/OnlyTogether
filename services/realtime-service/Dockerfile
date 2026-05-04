FROM node:20-alpine

WORKDIR /app
ENV NODE_OPTIONS=--preserve-symlinks
COPY services/shared ./services/shared
COPY services/realtime-service/package*.json ./services/realtime-service/

WORKDIR /app/services/realtime-service
RUN npm install --omit=dev

COPY services/realtime-service ./
CMD ["node", "src/server.js"]
