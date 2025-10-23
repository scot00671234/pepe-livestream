// ========================================
// FULLY AUTOMATIC LIVESTREAMER v3.0
// ========================================
const ffmpeg = require('fluent-ffmpeg');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

console.log('ðŸš€ FULLY AUTOMATIC LIVESTREAMER v3.0 STARTING...');

// Configuration
const DROPBOX_URL = 'https://www.dropbox.com/scl/fi/esjfz5uujwgafvcjidx0g/generated_video-10.mp4?rlkey=isfdeugfzv1p4t9fqne9g48pm&st=btbst1gu&dl=1';
const STREAM_KEY = 'bFTdmGKyY9cx';

// Multiple RTMP endpoints for fallback
const RTMP_ENDPOINTS = [
  'rtmps://pump-prod-tg2x8veh.rtmp.livekit.cloud/x',
  'rtmp://pump-prod-tg2x8veh.rtmp.livekit.cloud/x',
  'rtmps://pump-prod-tg2x8veh.rtmp.livekit.cloud/x'
];

// Streaming configurations
const STREAMING_CONFIGS = [
  {
    name: 'High Performance',
    inputOptions: ['-re', '-stream_loop', '-1', '-fflags', '+genpts', '-avoid_negative_ts', 'make_zero'],
    outputOptions: ['-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency', '-crf', '22', '-maxrate', '3M', '-bufsize', '1M', '-g', '30', '-c:a', 'aac', '-b:a', '128k', '-f', 'flv']
  },
  {
    name: 'Stable Fallback',
    inputOptions: ['-re', '-stream_loop', '-1', '-fflags', '+genpts', '-avoid_negative_ts', 'make_zero'],
    outputOptions: ['-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency', '-crf', '25', '-maxrate', '2M', '-bufsize', '1M', '-g', '60', '-c:a', 'aac', '-b:a', '96k', '-f', 'flv']
  },
  {
    name: 'Ultra Stable',
    inputOptions: ['-re', '-stream_loop', '-1', '-fflags', '+genpts', '-avoid_negative_ts', 'make_zero'],
    outputOptions: ['-c:v', 'libx264', '-preset', 'fast', '-tune', 'zerolatency', '-crf', '28', '-maxrate', '1M', '-bufsize', '2M', '-g', '120', '-c:a', 'aac', '-b:a', '64k', '-f', 'flv']
  }
];

// Global variables
let streamProcess = null;
let isStreaming = false;
let currentEndpointIndex = 0;
let currentConfigIndex = 0;
let restartAttempts = 0;
const MAX_RESTART_ATTEMPTS = 10;
let healthCheckInterval = null;
let lastStreamActivity = Date.now();

// Stream health monitoring
function startHealthMonitoring() {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
  }
  
  healthCheckInterval = setInterval(() => {
    if (isStreaming) {
      const timeSinceLastActivity = Date.now() - lastStreamActivity;
      if (timeSinceLastActivity > 30000) {
        console.log('Stream timeout detected - restarting...');
        restartStream();
      }
    }
  }, 5000);
}

function stopHealthMonitoring() {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
}

// Restart stream function
function restartStream() {
  console.log('ðŸ”„ Restarting stream...');
  
  if (streamProcess) {
    streamProcess.kill('SIGTERM');
    streamProcess = null;
  }
  
  isStreaming = false;
  stopHealthMonitoring();
  
  // Try different approach
  currentConfigIndex = (currentConfigIndex + 1) % STREAMING_CONFIGS.length;
  if (currentConfigIndex === 0) {
    currentEndpointIndex = (currentEndpointIndex + 1) % RTMP_ENDPOINTS.length;
  }
  
  setTimeout(() => {
    startStream();
  }, 2000);
}

// Start streaming function
function startStream() {
  if (isStreaming) {
    return;
  }

  console.log('ðŸŽ¥ Starting automatic stream...');
  
  try {
    const config = STREAMING_CONFIGS[currentConfigIndex];
    const endpoint = RTMP_ENDPOINTS[currentEndpointIndex];
    const rtmpUrl = ${endpoint}/;
    
    console.log(Using config: );
    console.log(Using endpoint: );
    
    streamProcess = ffmpeg()
      .input(DROPBOX_URL)
      .inputOptions(config.inputOptions)
      .outputOptions(config.outputOptions)
      .output(rtmpUrl)
      .on('start', (commandLine) => {
        console.log('âœ… Stream started successfully');
        console.log('FFmpeg command:', commandLine);
        isStreaming = true;
        lastStreamActivity = Date.now();
        startHealthMonitoring();
      })
      .on('progress', (progress) => {
        console.log(Processing: % done);
        lastStreamActivity = Date.now();
      })
      .on('error', (err) => {
        console.error('âŒ Streaming error:', err.message);
        console.error('Error code:', err.code);
        
        isStreaming = false;
        stopHealthMonitoring();
        
        if (restartAttempts < MAX_RESTART_ATTEMPTS) {
          restartAttempts++;
          console.log(ðŸ”„ Auto-restarting stream (attempt /)...);
          restartStream();
        } else {
          console.error('âŒ Max restart attempts reached');
        }
      })
      .on('end', () => {
        console.log('Stream ended');
        isStreaming = false;
        stopHealthMonitoring();
      });

    streamProcess.run();
    
  } catch (error) {
    console.error('Error starting stream:', error);
    isStreaming = false;
  }
}

// Simple status endpoint
app.get('/status', (req, res) => {
  res.json({
    streaming: isStreaming,
    currentConfig: STREAMING_CONFIGS[currentConfigIndex].name,
    currentEndpoint: RTMP_ENDPOINTS[currentEndpointIndex],
    restartAttempts: restartAttempts,
    timestamp: new Date().toISOString()
  });
});

// Simple status page
app.get('/', (req, res) => {
  res.send(
    <html>
      <head>
        <title>Pepe Livestreamer - Auto Mode</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
          .status-card { background: white; padding: 30px; border-radius: 15px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); max-width: 600px; margin: 0 auto; }
          .status { font-size: 28px; font-weight: bold; margin: 20px 0; }
          .streaming { color: #4CAF50; }
          .stopped { color: #f44336; }
          .info { margin: 15px 0; font-size: 16px; }
          .auto-badge { background: #4CAF50; color: white; padding: 5px 15px; border-radius: 20px; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="status-card">
          <h1>ðŸŽ¥ Pepe Livestreamer</h1>
          <div class="auto-badge">FULLY AUTOMATIC</div>
          <p class="status" id="status"></p>
          <div class="info">
            <p><strong>Mode:</strong> Fully Automatic</p>
            <p><strong>Current Config:</strong> <span id="config"></span></p>
            <p><strong>Endpoint:</strong> <span id="endpoint">/3</span></p>
            <p><strong>Restart Attempts:</strong> <span id="attempts"></span></p>
          </div>
          <p style="color: #666; font-style: italic; margin-top: 30px;">
            ðŸš€ Stream runs automatically on deployment<br>
            ðŸ”„ Auto-restarts on any error<br>
            ðŸ›¡ï¸ Multiple fallback configurations<br>
            âš¡ No manual intervention needed!
          </p>
        </div>
        
        <script>
          async function updateStatus() {
            try {
              const response = await fetch('/status');
              const data = await response.json();
              
              document.getElementById('status').textContent = data.streaming ? 'Streaming' : 'Stopped';
              document.getElementById('status').className = data.streaming ? 'status streaming' : 'status stopped';
              document.getElementById('config').textContent = data.currentConfig;
              document.getElementById('attempts').textContent = data.restartAttempts;
            } catch (error) {
              console.error('Error updating status:', error);
            }
          }
          
          setInterval(updateStatus, 5000);
          updateStatus();
        </script>
      </body>
    </html>
  );
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    streaming: isStreaming,
    timestamp: new Date().toISOString()
  });
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down gracefully...');
  if (streamProcess) {
    streamProcess.kill('SIGTERM');
  }
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down...');
  if (streamProcess) {
    streamProcess.kill('SIGTERM');
  }
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
  }
  process.exit(0);
});

// Start server and auto-start stream
app.listen(PORT, () => {
  console.log('=== FULLY AUTOMATIC LIVESTREAMER v3.0 ===');
  console.log(Server running on port );
  console.log(Status page: http://localhost:/);
  console.log('ðŸš€ AUTO-STARTING STREAM IN 3 SECONDS...');
  
  // Auto-start stream on deployment
  setTimeout(() => {
    console.log('ðŸŽ¥ AUTO-STARTING STREAM NOW...');
    startStream();
  }, 3000);
});
