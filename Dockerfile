FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY dist/ ./dist/

ENV VENT_DIR=.vents

ENTRYPOINT ["node", "/app/dist/vent-widget.js"]
