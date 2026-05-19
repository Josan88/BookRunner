FROM node:20-alpine

WORKDIR /app

COPY backend/package*.json ./
RUN npm ci --omit=dev

COPY backend/src ./src
COPY books.json /books.json

EXPOSE 3000

CMD ["npm", "start"]
