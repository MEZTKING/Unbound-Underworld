# Unbound Underworld game server.
#   docker build -t unbound-underworld-server server
#   docker run -d -p 7777:7777 -v uu-saves:/data --name uu unbound-underworld-server
FROM node:22-alpine
WORKDIR /app
COPY package.json relay-core.cjs lan.cjs index.cjs ./
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 7777
VOLUME ["/data"]
CMD ["node", "index.cjs", "--saves", "/data"]
