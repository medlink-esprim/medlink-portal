FROM node:20-slim
WORKDIR /app
COPY package*.json ./

# Build deps for native modules (argon2 / node-gyp)
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

RUN npm install --no-audit --no-fund
COPY . .
EXPOSE 3000
CMD ["node", "src/server.js"]
