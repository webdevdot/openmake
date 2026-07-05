# openmake editor web app (self-host, static build behind nginx)
FROM node:22-alpine AS build

ARG VITE_API_URL=http://localhost:8080
ENV VITE_API_URL=$VITE_API_URL

RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .npmrc ./
COPY packages ./packages
COPY apps/editor ./apps/editor

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @openmake/editor build

FROM nginx:alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/editor/dist /usr/share/nginx/html
EXPOSE 80
