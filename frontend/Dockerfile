FROM node:20-alpine

WORKDIR /app

COPY frontend /app
RUN if [ -f package-lock.json ]; then npm ci; \
    elif [ -f package.json ]; then npm install; \
    else echo "No frontend/package.json found; scaffold Angular app in ./frontend first."; fi

EXPOSE 4200
CMD ["sh", "-lc", "npm start -- --host 0.0.0.0 --port 4200"]
