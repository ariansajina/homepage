# Build the static site with Node, then serve dist/ with Caddy. Railway builds this
# Dockerfile (see railway.json) and passes service variables to matching ARGs.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Public base URL of the R2 bucket and the canonical site URL (Railway service variables).
ARG PUBLIC_MEDIA_URL
ARG SITE_URL
# Feature flags (see src/lib/features.ts): unset or "false" keeps a feature off.
ARG FEATURE_TRACES
# Origin of the Sveltia CMS sign-in Worker (optional; see README → Editing with the CMS).
ARG CMS_AUTH_URL
RUN test -n "$PUBLIC_MEDIA_URL" || (echo "PUBLIC_MEDIA_URL must be set" && exit 1)
RUN npm run build

FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
