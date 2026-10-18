FROM node:24-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --omit=optional --ignore-scripts --registry=https://registry.npmjs.org --fetch-timeout=30000 --fetch-retries=2 && npm cache clean --force
RUN npm install --prefix /tmp/nomads-native --no-save --package-lock=false --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org --fetch-timeout=30000 --fetch-retries=1 node-addon-require-builtin-linux-x64-gnu@0.1.9 @deepseek-ai/node-addon-system-linux-x64@0.1.2 && mkdir -p node_modules/@deepseek-ai && cp -R /tmp/nomads-native/node_modules/node-addon-require-builtin-linux-x64-gnu node_modules/ && cp -R /tmp/nomads-native/node_modules/@deepseek-ai/node-addon-system-linux-x64 node_modules/@deepseek-ai/ && rm -rf /tmp/nomads-native
COPY agent ./agent
COPY src ./src
COPY public/modules ./public/modules
RUN node -e "require('node-addon-require-builtin')" && mkdir -p .data/agent && chown -R node:node /app
USER node
EXPOSE 8789
CMD ["node", "agent/server.mjs"]
