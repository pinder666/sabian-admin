FROM node:18
WORKDIR /app
COPY . .
COPY db_connection.cjs .
RUN npm install
CMD ["node", "sabian_wizard.cjs"]
