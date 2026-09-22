ARG BUILD_FROM
FROM $BUILD_FROM

RUN apk add --no-cache nodejs npm

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY tools.mjs sse-server.mjs addon-entrypoint.mjs ./

CMD [ "node", "addon-entrypoint.mjs" ]
