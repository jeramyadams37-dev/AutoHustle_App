FROM node:22-slim
WORKDIR /app
COPY package*.json ./
COPY plugins ./plugins
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production
CMD ["npx", "tsx", "server.ts"]
