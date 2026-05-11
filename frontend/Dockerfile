FROM node:20-alpine

WORKDIR /app

# Install dependencies first (for better caching)
COPY frontend/package*.json /app/
RUN if [ -f package-lock.json ]; then npm ci; \
    elif [ -f package.json ]; then npm install; \
    else echo "No package.json found"; exit 1; fi

# Copy the rest of the application
COPY frontend /app

EXPOSE 5173

# Use --host 0.0.0.0 so Vite is accessible from outside the container
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
