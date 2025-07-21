#!/bin/sh
# entrypoint.sh
# Nginx entrypoint script for environment variable substitution

set -e

# Replace environment variables in nginx config files
# This allows dynamic configuration based on environment
if [ -n "$API_GATEWAY_URL" ]; then
    echo "Setting API Gateway URL to: $API_GATEWAY_URL"
    sed -i "s|server api-gateway:8080|server $API_GATEWAY_URL|g" /etc/nginx/conf.d/default.conf
fi

# Set default values for environment variables if not provided
export API_GATEWAY_URL=${API_GATEWAY_URL:-"api-gateway:8080"}
export NGINX_WORKER_PROCESSES=${NGINX_WORKER_PROCESSES:-"auto"}
export NGINX_WORKER_CONNECTIONS=${NGINX_WORKER_CONNECTIONS:-"1024"}

echo "Nginx configuration:"
echo "- API Gateway: $API_GATEWAY_URL"
echo "- Worker processes: $NGINX_WORKER_PROCESSES"
echo "- Worker connections: $NGINX_WORKER_CONNECTIONS"

# Test nginx configuration
nginx -t

echo "Starting Nginx..."
exec "$@"