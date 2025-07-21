# Multi-stage Docker build for React TypeScript frontend
# Following pattern from /examples/docker/multi-stage.Dockerfile

# Stage 1: Build stage
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files first for better cache utilization
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci --only=production=false

# Copy source code
COPY public/ ./public/
COPY src/ ./src/
COPY tsconfig.json ./

# Build the application
ENV NODE_ENV=production
ENV GENERATE_SOURCEMAP=false
RUN npm run build

# Stage 2: Runtime stage with Nginx
FROM nginx:alpine AS runtime

# Install curl for health checks
RUN apk add --no-cache curl

# Copy custom nginx configuration
COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

# Copy built application from builder stage
COPY --from=builder /app/build /usr/share/nginx/html

# Copy nginx entrypoint script
COPY nginx/entrypoint.sh /docker-entrypoint.d/

# Make entrypoint script executable
RUN chmod +x /docker-entrypoint.d/entrypoint.sh

# Create non-root user for Nginx
RUN addgroup -g 1001 -S appuser && \
    adduser -S -u 1001 -G appuser appuser

# Set permissions for Nginx directories
RUN chown -R appuser:appuser /var/cache/nginx && \
    chown -R appuser:appuser /var/log/nginx && \
    chown -R appuser:appuser /etc/nginx/conf.d && \
    touch /var/run/nginx.pid && \
    chown -R appuser:appuser /var/run/nginx.pid && \
    chown -R appuser:appuser /usr/share/nginx/html

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD curl -f http://localhost/health || exit 1

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]