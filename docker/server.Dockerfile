# openmake API + sync + MCP server (self-host)
FROM node:22-alpine

RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .npmrc ./
COPY packages ./packages
COPY apps/server ./apps/server

RUN pnpm install --frozen-lockfile
# install scripts are globally blocked (supply-chain hardening); generate Prisma client explicitly
RUN pnpm --filter @openmake/database db:generate

ENV NODE_ENV=production
EXPOSE 8080
CMD ["pnpm", "--filter", "@openmake/server", "start"]
