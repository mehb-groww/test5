ARG BASE_IMAGE
FROM $BASE_IMAGE
WORKDIR /app
COPY SuperBot/package.json /app
RUN npm install
COPY SuperBot /app
CMD node index.js
EXPOSE 3000