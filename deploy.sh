#!/bin/bash

# System Monitor v2.29.0 Deployment Script
# Usage: ./deploy.sh [--skip-build] [--local]

set -e  # Exit on error

VERSION="v2.29.0"
IMAGE_NAME="localhost:30500/system-monitor:${VERSION}"
NAMESPACE="deployer-dev"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}System Monitor Deployment Script${NC}"
echo -e "${GREEN}Version: ${VERSION}${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${RED}Error: .env file not found${NC}"
    echo -e "${YELLOW}Please create .env file from .env.example${NC}"
    echo "cp .env.example .env"
    echo "nano .env  # Fill in your credentials"
    exit 1
fi

# Check required env vars
echo -e "${YELLOW}Checking environment variables...${NC}"
if ! grep -q "GOOGLE_CLIENT_ID=" .env || ! grep -q "JWT_SECRET=" .env; then
    echo -e "${RED}Error: Missing required environment variables${NC}"
    echo "Required: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, JWT_SECRET"
    exit 1
fi
echo -e "${GREEN}✓ Environment variables OK${NC}"

# Parse arguments
SKIP_BUILD=false
LOCAL_ONLY=false

for arg in "$@"; do
    case $arg in
        --skip-build)
            SKIP_BUILD=true
            ;;
        --local)
            LOCAL_ONLY=true
            ;;
    esac
done

# Build frontend
if [ "$SKIP_BUILD" = false ]; then
    echo -e "\n${YELLOW}Building frontend...${NC}"
    npm run build
    echo -e "${GREEN}✓ Frontend built${NC}"
fi

# Local deployment
if [ "$LOCAL_ONLY" = true ]; then
    echo -e "\n${YELLOW}Starting local server...${NC}"
    NODE_ENV=production npm start &
    SERVER_PID=$!

    echo -e "${GREEN}✓ Server started (PID: $SERVER_PID)${NC}"
    echo -e "${YELLOW}Access at: http://localhost:3000${NC}"
    echo -e "${YELLOW}Press Ctrl+C to stop${NC}"

    # Wait for Ctrl+C
    trap "kill $SERVER_PID; exit 0" INT
    wait $SERVER_PID
    exit 0
fi

# Docker deployment
echo -e "\n${YELLOW}Building Docker image...${NC}"
sudo docker build -t ${IMAGE_NAME} .
echo -e "${GREEN}✓ Docker image built${NC}"

echo -e "\n${YELLOW}Pushing to registry...${NC}"
sudo docker push ${IMAGE_NAME}
echo -e "${GREEN}✓ Image pushed${NC}"

echo -e "\n${YELLOW}Updating Kubernetes deployment...${NC}"
sudo kubectl set image deployment/system-monitor \
    system-monitor=${IMAGE_NAME} \
    -n ${NAMESPACE}

echo -e "\n${YELLOW}Waiting for rollout...${NC}"
sudo kubectl rollout status deployment/system-monitor -n ${NAMESPACE}

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}✓ Deployment completed successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e ""
echo -e "Access at: ${YELLOW}https://monitor.ko.unieai.com${NC}"
echo -e ""
echo -e "Verify deployment:"
echo -e "  ${YELLOW}sudo kubectl get pods -n ${NAMESPACE} -l app=system-monitor${NC}"
echo -e ""
echo -e "View logs:"
echo -e "  ${YELLOW}sudo kubectl logs -f -l app=system-monitor -n ${NAMESPACE}${NC}"
