FROM node:20-alpine

WORKDIR /app
ENV NODE_OPTIONS=--preserve-symlinks
COPY services/shared ./services/shared
COPY database ./database
COPY services/auth-service/package*.json ./services/auth-service/

WORKDIR /app/services/auth-service
RUN npm install --omit=dev

COPY services/auth-service ./
ENTRYPOINT ["node", "src/cli.js"]
CMD ["server"]
