# Stage 1: Build the frontend
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy all files for build
COPY . .

# Build the project (Vite will output to /app/dist)
RUN npm run build

# Stage 2: Serve with a thin runtime
FROM node:20-slim

WORKDIR /app

# Copy only what we need for the server
COPY package.json ./
COPY server.js ./
COPY --from=builder /app/dist ./dist

# Set the port (Cloud Run defaults to 8080)
EXPOSE 8080

# Environment variables (Gemini API Key should be provided at runtime)
# ENV GEMINI_API_KEY=YOUR_KEY_HERE (Recommended to use Cloud Run Secrets)

# Run the server
CMD ["node", "server.js"]
