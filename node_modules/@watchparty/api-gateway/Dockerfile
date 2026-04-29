FROM node:20-alpine

WORKDIR /app
ENV NODE_OPTIONS=--preserve-symlinks
COPY services/shared ./services/shared
COPY services/api-gateway/package*.json ./services/api-gateway/

WORKDIR /app/services/api-gateway
RUN npm install --omit=dev

COPY services/api-gateway ./
CMD ["npm", "start"]
