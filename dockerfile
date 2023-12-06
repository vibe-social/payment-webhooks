FROM node:21-alpine
WORKDIR /app

COPY package.json yarn.lock tsconfig.json ./
RUN yarn install

COPY src ./src
RUN yarn build

ENTRYPOINT ["node", "dist/main.js"]