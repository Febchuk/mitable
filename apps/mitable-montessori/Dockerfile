FROM node:20.20.2-bookworm-slim

WORKDIR /app

# Install the exact package-manager version without Railpack's resolver.
RUN npm install --global pnpm@9.9.0

COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

COPY . .

# Railway supplies these public settings as Docker build arguments.
ARG NEXT_PUBLIC_APP_NAME
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_ENABLE_CAPTURE_WORKER
ARG NEXT_PUBLIC_ENABLE_LOCAL_INTENT
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_SUPABASE_URL

RUN pnpm build

ENV NODE_ENV=production
CMD ["sh", "-c", "exec pnpm exec next start -p ${PORT:-3000}"]
