FROM node:18-slim

# Create app directory
WORKDIR /usr/src/app

# Set up SQLite data directory and ensure proper permissions for Hugging Face (user 1000)
RUN mkdir -p /usr/src/app/backend/data && \
    chown -R 1000:1000 /usr/src/app

# Switch to the non-root user required by Hugging Face Spaces
USER 1000

# Install backend dependencies
COPY --chown=1000:1000 backend/package*.json ./backend/
WORKDIR /usr/src/app/backend
RUN npm install

# Copy the rest of the application code
WORKDIR /usr/src/app
COPY --chown=1000:1000 backend/ ./backend/
COPY --chown=1000:1000 frontend/ ./frontend/

# Expose port 7860 as required by Hugging Face Spaces
ENV PORT=7860
EXPOSE 7860

# Run the app from the backend directory
WORKDIR /usr/src/app/backend

# Start the server
CMD ["npm", "start"]
