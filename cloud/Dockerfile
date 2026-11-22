FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY cloud ./cloud
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build:cloud

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
ENV CLOUD_DATABASE_PATH=/data/cloud.sqlite
COPY --from=build --chown=node:node /app/cloud/.next/standalone ./
COPY --from=build --chown=node:node /app/cloud/.next/static ./cloud/.next/static
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3000
VOLUME ["/data"]
CMD ["node", "cloud/server.js"]
