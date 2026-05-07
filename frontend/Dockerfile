# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Upgrade packages to fix security vulnerabilities
RUN apk upgrade --no-cache

COPY package*.json ./
RUN npm ci --prefer-offline

COPY . .

# Build-time public config (safe to embed in SPA bundle).
# Defaults keep same-origin API routing via nginx /api proxy.
ARG VITE_API_BASE=/api/v1
ARG VITE_NEON_AUTH_URL=
ARG VITE_AUTH_REDIRECT_URL=
ARG VITE_AUTH_PASSWORD_RESET_REDIRECT_URL=
ARG VITE_AUTH_REFRESH_COOKIE=true
ENV VITE_API_BASE=${VITE_API_BASE}
ENV VITE_NEON_AUTH_URL=${VITE_NEON_AUTH_URL}
ENV VITE_AUTH_REDIRECT_URL=${VITE_AUTH_REDIRECT_URL}
ENV VITE_AUTH_PASSWORD_RESET_REDIRECT_URL=${VITE_AUTH_PASSWORD_RESET_REDIRECT_URL}
ENV VITE_AUTH_REFRESH_COOKIE=${VITE_AUTH_REFRESH_COOKIE}

RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:1.27-alpine

# Upgrade packages to fix security vulnerabilities
# This addresses findings in libcrypto3, libssl3, and libxml2
RUN apk update && apk upgrade --no-cache && \
    apk add --no-cache libcrypto3 libssl3 libxml2

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
