# Build stage
FROM node:20-alpine AS build

WORKDIR /app

# Install dependencies first (for better caching)
COPY frontend/package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; \
    elif [ -f package.json ]; then npm install; \
    else echo "No package.json found"; exit 1; fi

# Copy the rest of the application
COPY frontend ./

# Build the application
RUN npm run build

# Serve stage
FROM nginx:alpine

# Copy built assets from the build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Copy a default nginx config if needed, otherwise default is usually fine
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
