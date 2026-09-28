# syntax=docker/dockerfile:1
# Production image for any container host (Railway, Render, Fly, ECS, Kubernetes…)
FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM base AS build
# The Content-Security-Policy is compiled at build time and must allow the
# storage origin: docker build --build-arg STORAGE_PUBLIC_URL=https://cdn.example.com .
ARG STORAGE_PUBLIC_URL=""
ENV STORAGE_PUBLIC_URL=${STORAGE_PUBLIC_URL}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build && npm prune --omit=dev

FROM base AS runner
ENV NODE_ENV=production PORT=3000
RUN groupadd -r app && useradd -r -g app app
COPY --from=build --chown=app:app /app/.next ./.next
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/prisma ./prisma
COPY --from=build --chown=app:app /app/package.json ./package.json
COPY --from=build --chown=app:app /app/next.config.ts ./next.config.ts
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Apply pending migrations; for hosted demo deployments optionally load the
# demo data into an EMPTY database (never re-seeds existing data); then start.
CMD ["sh", "-c", "npx prisma migrate deploy && if [ \"$SEED_DEMO_DATA_IF_EMPTY\" = true ]; then SEED_IF_EMPTY=1 npx tsx prisma/seed.ts; fi && npx next start -p ${PORT}"]
