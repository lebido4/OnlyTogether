FROM node:20-alpine

WORKDIR /app
ENV NODE_OPTIONS=--preserve-symlinks
COPY services/shared ./services/shared
COPY services/chat-service/package*.json ./services/chat-service/

WORKDIR /app/services/chat-service
RUN npm install --omit=dev

COPY services/chat-service ./
CMD ["npm", "start"]
