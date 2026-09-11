FROM node:22.19-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json tsconfig.json next.config.ts next-env.d.ts postcss.config.mjs ./
COPY src ./src
# Empty = same-origin through the Caddy edge (recommended for Compose).
ARG NEXT_PUBLIC_CONTROL_URL=
ENV NEXT_PUBLIC_CONTROL_URL=$NEXT_PUBLIC_CONTROL_URL
RUN npm ci && npm run build
ENV NODE_ENV=production
EXPOSE 3000
HEALTHCHECK --interval=5s --timeout=3s --start-period=15s --retries=12 \
  CMD node -e "fetch('http://127.0.0.1:3000').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm", "run", "start"]
