FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx tsc
RUN npm prune --omit=dev
RUN sed -i 's/\r$//' start.sh && chmod +x start.sh

EXPOSE 3000

CMD ["sh", "start.sh"]
