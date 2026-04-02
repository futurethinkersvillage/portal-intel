FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx tsc
RUN npm prune --omit=dev

EXPOSE 3000

RUN sed -i 's/\r$//' start.sh && chmod +x start.sh

CMD ["sh", "start.sh"]
