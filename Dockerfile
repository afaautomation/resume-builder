FROM node:22-slim

# Run as the unprivileged user the image already provides
WORKDIR /usr/src/app
RUN chown node:node /usr/src/app
USER node

# Install exactly the locked production dependencies
COPY --chown=node:node backend/package*.json ./backend/
WORKDIR /usr/src/app/backend
RUN npm ci --omit=dev --no-audit --no-fund

# Copy the rest of the application code
WORKDIR /usr/src/app
COPY --chown=node:node backend/ ./backend/
COPY --chown=node:node frontend/ ./frontend/
COPY --chown=node:node resume.html ./resume.html

ENV NODE_ENV=production
# Cloud Run sets PORT at runtime (default 8080); the server reads it.
ENV PORT=8080
EXPOSE 8080

# Start the server only. Templates are seeded once per release with
# `npm run seed`, not on every container start (Cloud Run starts many).
WORKDIR /usr/src/app/backend
CMD ["node", "src/server.js"]
