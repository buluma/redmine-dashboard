FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache sqlite

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run prisma:generate
RUN npm run build

EXPOSE 3000

CMD ["sh", "-c", "npm run db:init && npm run start"]
