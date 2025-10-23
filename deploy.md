# VPS Deployment Guide

## 🚀 Quick Deploy Options

### Option 1: Nixpacks (Recommended)
```bash
# Push to your repository
git add .
git commit -m "Add livestreamer"
git push origin main

# Deploy with nixpacks (automatic detection)
# Your VPS provider will automatically detect nixpacks.toml
```

### Option 2: Docker
```bash
# Build and run with Docker
docker build -t livestreamer .
docker run -p 3000:3000 livestreamer

# Or use docker-compose
docker-compose up -d
```

### Option 3: Manual VPS Setup
```bash
# Install Node.js 18+ and FFmpeg
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs ffmpeg

# Clone and setup
git clone <your-repo>
cd livestream-vps
npm ci --only=production

# Start with PM2 (recommended)
npm install -g pm2
pm2 start index.js --name livestreamer
pm2 startup
pm2 save
```

## 🔧 Configuration

### Environment Variables
- `PORT`: Server port (default: 3000)
- `NODE_ENV`: Set to "production"

### Firewall
```bash
# Allow port 3000
sudo ufw allow 3000
```

## 📊 Monitoring

### Health Checks
- **Health**: `http://your-vps-ip:3000/health`
- **Status**: `http://your-vps-ip:3000/status`
- **Control Panel**: `http://your-vps-ip:3000/`

### Logs
```bash
# With PM2
pm2 logs livestreamer

# With Docker
docker logs <container-name>
```

## 🎥 Streaming

1. Access control panel at `http://your-vps-ip:3000/`
2. Click "Start Stream" to begin streaming
3. Stream will be sent to: `rtmps://pump-prod-tg2x8veh.rtmp.livekit.cloud/x`
4. Stream key: `bFTdmGKyY9cx`

## 🔄 Auto-restart

The application includes graceful shutdown handling and will automatically restart on VPS reboot when using PM2 or Docker.
