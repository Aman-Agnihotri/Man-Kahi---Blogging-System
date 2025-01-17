FROM node:22.13.0-alpine

WORKDIR /app
COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

EXPOSE 3001
CMD ["npm", "run", "start"]