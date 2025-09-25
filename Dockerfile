## Multi-stage build for whatsapp-sync
FROM node:20-alpine AS build
WORKDIR /app
# Copy dependency manifests and install all deps (including dev for build)
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src-ts ./src-ts
COPY docs ./docs
RUN npm run build
# Remove dev dependencies for slimmer runtime layer
RUN npm prune --omit=dev

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Create non-root user
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/docs ./docs
USER app
ENTRYPOINT ["node", "dist/index.js"]
CMD ["--help"]