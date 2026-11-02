FROM mcr.microsoft.com/playwright:v1.56.1-noble
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && (npx playwright install chrome || echo "chrome yo'q, chromium ishlatiladi")
COPY . .
ENV NODE_ENV=production PORT=10000
EXPOSE 10000
CMD ["node","server.js"]
