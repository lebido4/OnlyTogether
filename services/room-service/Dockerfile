FROM node:20-alpine

WORKDIR /app
ENV NODE_OPTIONS=--preserve-symlinks
COPY services/shared ./services/shared
COPY services/room-service/package*.json ./services/room-service/

WORKDIR /app/services/room-service
RUN npm install --omit=dev

COPY services/room-service ./
CMD ["npm", "start"]
