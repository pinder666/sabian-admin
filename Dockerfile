FROM node:20-alpine

# System deps for any native build steps
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Layer-cache: install deps before copying code so rebuilds skip npm install when code-only changes
COPY package*.json ./
RUN npm install --omit=dev

# Copy all application files
COPY . .

# Never embed secrets — all env vars passed via Railway / docker run -e
# .dockerignore excludes .env, keys/, and local caches

EXPOSE ${PORT:-5000}

CMD ["node", "sabian_api.cjs"]
