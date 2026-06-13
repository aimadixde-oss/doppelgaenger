# Doppelgänger MVP — schlankes Node-Image
FROM node:20-alpine

WORKDIR /app

# Abhängigkeiten zuerst (besseres Layer-Caching)
COPY package.json ./
RUN npm install --omit=dev

# App-Code
COPY . .

ENV PORT=3003
EXPOSE 3003

CMD ["node", "server.js"]
