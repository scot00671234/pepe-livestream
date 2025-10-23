# Livestreamer

A simple Node.js application for streaming video content to LiveKit RTMP endpoints.

## Features

- Streams video from Dropbox URL to LiveKit RTMP
- Optimized for speed with 30fps and reduced quality settings
- Web-based control panel
- Health check endpoints
- Graceful shutdown handling

## Configuration

The application is pre-configured with:
- **Source**: Dropbox video URL
- **Destination**: LiveKit RTMP endpoint
- **Stream Key**: bFTdmGKyY9cx
- **Quality**: Optimized for speed (CRF 28, 1Mbps max bitrate)
- **Frame Rate**: 30fps

## Deployment

This application is configured for deployment with nixpacks on VPS platforms.

### Environment Variables

- `PORT`: Server port (default: 3000)

### Endpoints

- `GET /` - Control panel
- `GET /health` - Health check
- `GET /status` - Stream status
- `POST /start` - Start streaming
- `POST /stop` - Stop streaming

## Usage

1. Deploy to your VPS using nixpacks
2. Access the control panel at `http://your-vps-ip:3000/`
3. Click "Start Stream" to begin streaming
4. Click "Stop Stream" to stop streaming

## Requirements

- Node.js 18+
- FFmpeg
- Network access to Dropbox and LiveKit RTMP endpoint
