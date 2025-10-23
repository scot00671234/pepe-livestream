const ffmpeg = require('fluent-ffmpeg');
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration
const DROPBOX_URL = 'https://www.dropbox.com/scl/fi/esjfz5uujwgafvcjidx0g/generated_video-10.mp4?rlkey=isfdeugfzv1p4t9fqne9g48pm&st=btbst1gu&dl=1';
const RTMP_URL = 'rtmps://pump-prod-tg2x8veh.rtmp.livekit.cloud/x';
const STREAM_KEY = 'bFTdmGKyY9cx';

let streamProcess = null;
let isStreaming = false;

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    streaming: isStreaming,
    timestamp: new Date().toISOString()
  });
});

// Start streaming endpoint
app.post('/start', (req, res) => {
  if (isStreaming) {
    return res.json({ message: 'Stream is already running' });
  }

  console.log('Starting livestream...');
  
  try {
    streamProcess = ffmpeg()
      .input(DROPBOX_URL)
      .inputOptions([
        '-re', // Read input at native frame rate
        '-stream_loop', '-1' // Loop the video indefinitely
      ])
      .outputOptions([
        '-c:v', 'libx264', // Video codec
        '-preset', 'ultrafast', // Fast encoding
        '-tune', 'zerolatency', // Low latency
        '-crf', '28', // Lower quality for speed (18-28 range, higher = lower quality)
        '-maxrate', '1M', // Max bitrate 1Mbps
        '-bufsize', '2M', // Buffer size
        '-g', '60', // Keyframe interval (2 seconds at 30fps)
        '-keyint_min', '60',
        '-sc_threshold', '0',
        '-c:a', 'aac', // Audio codec
        '-b:a', '128k', // Audio bitrate
        '-ar', '44100', // Audio sample rate
        '-f', 'flv' // Output format
      ])
      .output(`${RTMP_URL}/${STREAM_KEY}`)
      .on('start', (commandLine) => {
        console.log('FFmpeg command:', commandLine);
        isStreaming = true;
        console.log('Stream started successfully');
      })
      .on('progress', (progress) => {
        console.log(`Processing: ${progress.percent}% done`);
      })
      .on('error', (err) => {
        console.error('Streaming error:', err.message);
        isStreaming = false;
      })
      .on('end', () => {
        console.log('Stream ended');
        isStreaming = false;
      });

    streamProcess.run();
    res.json({ message: 'Stream started successfully' });
    
  } catch (error) {
    console.error('Error starting stream:', error);
    res.status(500).json({ error: 'Failed to start stream' });
  }
});

// Stop streaming endpoint
app.post('/stop', (req, res) => {
  if (!isStreaming || !streamProcess) {
    return res.json({ message: 'No stream is currently running' });
  }

  console.log('Stopping livestream...');
  streamProcess.kill('SIGTERM');
  isStreaming = false;
  streamProcess = null;
  
  res.json({ message: 'Stream stopped successfully' });
});

// Status endpoint
app.get('/status', (req, res) => {
  res.json({
    streaming: isStreaming,
    timestamp: new Date().toISOString()
  });
});

// Root endpoint with simple controls
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Livestreamer Control</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; }
          button { padding: 10px 20px; margin: 10px; font-size: 16px; }
          .start { background-color: #4CAF50; color: white; }
          .stop { background-color: #f44336; color: white; }
        </style>
      </head>
      <body>
        <h1>Livestreamer Control Panel</h1>
        <p>Status: <span id="status">${isStreaming ? 'Streaming' : 'Stopped'}</span></p>
        <button class="start" onclick="startStream()">Start Stream</button>
        <button class="stop" onclick="stopStream()">Stop Stream</button>
        
        <script>
          async function startStream() {
            const response = await fetch('/start', { method: 'POST' });
            const data = await response.json();
            alert(data.message);
            location.reload();
          }
          
          async function stopStream() {
            const response = await fetch('/stop', { method: 'POST' });
            const data = await response.json();
            alert(data.message);
            location.reload();
          }
        </script>
      </body>
    </html>
  `);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down gracefully...');
  if (streamProcess) {
    streamProcess.kill('SIGTERM');
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down...');
  if (streamProcess) {
    streamProcess.kill('SIGTERM');
  }
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`Livestreamer server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Control panel: http://localhost:${PORT}/`);
});
