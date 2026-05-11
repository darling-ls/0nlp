FROM node:20-alpine

WORKDIR /app

COPY frontend /app
RUN if [ -f package-lock.json ]; then npm ci; \
    elif [ -f package.json ]; then npm install; \
    else echo "No frontend/package.json found; React app not scaffolded in ./frontend."; fi

EXPOSE 5173
CMD ["sh", "-lc", "npm install && npm run dev -- --host 0.0.0.0 --port 5173"]
