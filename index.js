const ffmpeg = require('fluent-ffmpeg');
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration
const DROPBOX_URL = 'https://www.dropbox.com/scl/fi/esjfz5uujwgafvcjidx0g/generated_video-10.mp4?rlkey=isfdeugfzv1p4t9fqne9g48pm&st=btbst1gu&dl=1';
const RTMP_URL = 'rtmps://pump-prod-tg2x8veh.rtmp.livekit.cloud/x';
const STREAM_KEY = 'bFTdmGKyY9cx';

// Multiple RTMP endpoints for fallback
const RTMP_ENDPOINTS = [
  'rtmps://pump-prod-tg2x8veh.rtmp.livekit.cloud/x',
  'rtmp://pump-prod-tg2x8veh.rtmp.livekit.cloud/x', // Try RTMP instead of RTMPS
  'rtmps://pump-prod-tg2x8veh.rtmp.livekit.cloud/x' // Retry RTMPS
];

let streamProcess = null;
let isStreaming = false;
let restartAttempts = 0;
const MAX_RESTART_ATTEMPTS = 10; // Increased for more attempts
let restartTimeout = null;
let lastErrorTime = null;
let consecutiveErrors = 0;
let currentEndpointIndex = 0;
let currentConfigIndex = 0;
let totalRestartAttempts = 0;
let autoRestartEnabled = true;
let streamHealthCheckInterval = null;
let lastStreamActivity = Date.now();

// Stream health monitoring system
function startStreamHealthMonitoring() {
  if (streamHealthCheckInterval) {
    clearInterval(streamHealthCheckInterval);
  }
  
  streamHealthCheckInterval = setInterval(() => {
    if (isStreaming && autoRestartEnabled) {
      const timeSinceLastActivity = Date.now() - lastStreamActivity;
      
      // If no activity for 30 seconds, consider stream dead
      if (timeSinceLastActivity > 30000) {
        console.log('Stream appears to be dead - no activity for 30 seconds');
        console.log('Auto-restarting stream...');
        handleStreamFailure('Stream timeout - no activity detected');
      }
    }
  }, 5000); // Check every 5 seconds
}

function stopStreamHealthMonitoring() {
  if (streamHealthCheckInterval) {
    clearInterval(streamHealthCheckInterval);
    streamHealthCheckInterval = null;
  }
}

function handleStreamFailure(reason) {
  console.log(`Stream failure detected: ${reason}`);
  isStreaming = false;
  
  if (streamProcess) {
    streamProcess.kill('SIGTERM');
    streamProcess = null;
  }
  
  if (autoRestartEnabled) {
    // Auto-restart the stream
    setTimeout(() => {
      console.log('Auto-restarting stream due to failure...');
      startStreamInternal();
    }, 2000); // 2 second delay before restart
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    streaming: isStreaming,
    restartAttempts: restartAttempts,
    maxRestartAttempts: MAX_RESTART_ATTEMPTS,
    autoRestartEnabled: autoRestartEnabled,
    lastStreamActivity: lastStreamActivity,
    timeSinceLastActivity: Date.now() - lastStreamActivity,
    timestamp: new Date().toISOString()
  });
});

// Multiple streaming configurations for different approaches
const STREAMING_CONFIGS = [
  {
    name: 'High Performance',
    inputOptions: [
      '-re', '-stream_loop', '-1', '-fflags', '+genpts', '-avoid_negative_ts', 'make_zero',
      '-fpsprobesize', '0', '-analyzeduration', '0'
    ],
    outputOptions: [
      '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency',
      '-crf', '22', '-maxrate', '3M', '-bufsize', '1M', '-g', '30', '-keyint_min', '30',
      '-sc_threshold', '0', '-x264opts', 'no-scenecut', '-bf', '0', '-refs', '1',
      '-me_method', 'dia', '-subq', '1', '-trellis', '0', '-aq-mode', '0',
      '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2', '-f', 'flv'
    ]
  },
  {
    name: 'Stable Fallback',
    inputOptions: [
      '-re', '-stream_loop', '-1', '-fflags', '+genpts', '-avoid_negative_ts', 'make_zero',
      '-fpsprobesize', '0', '-analyzeduration', '0'
    ],
    outputOptions: [
      '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency',
      '-crf', '25', '-maxrate', '2M', '-bufsize', '1M', '-g', '60', '-keyint_min', '60',
      '-sc_threshold', '0', '-x264opts', 'no-scenecut', '-bf', '0', '-refs', '1',
      '-me_method', 'dia', '-subq', '1', '-trellis', '0', '-aq-mode', '0',
      '-c:a', 'aac', '-b:a', '96k', '-ar', '44100', '-ac', '2', '-f', 'flv'
    ]
  },
  {
    name: 'Ultra Stable',
    inputOptions: [
      '-re', '-stream_loop', '-1', '-fflags', '+genpts', '-avoid_negative_ts', 'make_zero',
      '-fpsprobesize', '0', '-analyzeduration', '0'
    ],
    outputOptions: [
      '-c:v', 'libx264', '-preset', 'fast', '-tune', 'zerolatency',
      '-crf', '28', '-maxrate', '1M', '-bufsize', '2M', '-g', '120', '-keyint_min', '120',
      '-sc_threshold', '0', '-bf', '0', '-refs', '1',
      '-c:a', 'aac', '-b:a', '64k', '-ar', '44100', '-ac', '2', '-f', 'flv'
    ]
  },
  {
    name: 'Minimal Latency',
    inputOptions: [
      '-re', '-stream_loop', '-1', '-fflags', '+genpts', '-avoid_negative_ts', 'make_zero',
      '-fpsprobesize', '0', '-analyzeduration', '0'
    ],
    outputOptions: [
      '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency',
      '-crf', '30', '-maxrate', '500k', '-bufsize', '500k', '-g', '15', '-keyint_min', '15',
      '-sc_threshold', '0', '-bf', '0', '-refs', '1',
      '-c:a', 'aac', '-b:a', '32k', '-ar', '22050', '-ac', '1', '-f', 'flv'
    ]
  },
  {
    name: 'Compatibility Mode',
    inputOptions: [
      '-re', '-stream_loop', '-1'
    ],
    outputOptions: [
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-maxrate', '1M', '-bufsize', '2M',
      '-g', '60', '-keyint_min', '60', '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-f', 'flv'
    ]
  }
];

function getStreamingConfig() {
  const config = STREAMING_CONFIGS[currentConfigIndex];
  console.log(`Using streaming configuration: ${config.name} (${currentConfigIndex + 1}/${STREAMING_CONFIGS.length})`);
  return config;
}

// Internal streaming function
function startStreamInternal() {
  if (isStreaming) {
    return;
  }

  console.log('Starting livestream...');
  
  try {
    const config = getStreamingConfig();
    
    const currentEndpoint = RTMP_ENDPOINTS[currentEndpointIndex];
    console.log(`Using RTMP endpoint: ${currentEndpoint} (${currentEndpointIndex + 1}/${RTMP_ENDPOINTS.length})`);
    
    streamProcess = ffmpeg()
      .input(DROPBOX_URL)
      .inputOptions(config.inputOptions)
      .outputOptions(config.outputOptions)
      .output(`${currentEndpoint}/${STREAM_KEY}`)
      .on('start', (commandLine) => {
        console.log('FFmpeg command:', commandLine);
        isStreaming = true;
        lastStreamActivity = Date.now();
        startStreamHealthMonitoring();
        console.log('Stream started successfully');
      })
      .on('progress', (progress) => {
        console.log(`Processing: ${progress.percent}% done`);
        lastStreamActivity = Date.now(); // Update activity timestamp
      })
      .on('error', (err) => {
        console.error('Streaming error:', err.message);
        console.error('Error code:', err.code);
        console.error('Error signal:', err.signal);
        
        // Stop health monitoring
        stopStreamHealthMonitoring();
        
        const now = Date.now();
        const timeSinceLastError = lastErrorTime ? now - lastErrorTime : Infinity;
        lastErrorTime = now;
        
        // Track consecutive errors
        if (timeSinceLastError < 10000) { // Within 10 seconds
          consecutiveErrors++;
        } else {
          consecutiveErrors = 1;
        }
        
        // Handle specific error codes
        if (err.code === 224) {
          console.error('FFmpeg conversion failed (code 224) - likely network or RTMP issue');
          console.error(`Consecutive errors: ${consecutiveErrors}`);
        } else if (err.code === 1) {
          console.error('FFmpeg general error (code 1) - check input source');
        } else if (err.signal === 'SIGTERM') {
          console.log('Stream terminated by user - not restarting');
          return;
        }
        
        // Use the new failure handler for automatic restart
        if (autoRestartEnabled) {
          handleStreamFailure(`FFmpeg error: ${err.message} (code ${err.code})`);
        } else {
          isStreaming = false;
        }
      })
      .on('end', () => {
        console.log('Stream ended');
        isStreaming = false;
        restartAttempts = 0; // Reset on manual end
      });

    streamProcess.run();
    
  } catch (error) {
    console.error('Error starting stream:', error);
    isStreaming = false;
  }
}

// Start streaming endpoint
app.post('/start', (req, res) => {
  if (isStreaming) {
    return res.json({ message: 'Stream is already running' });
  }

  // Clear any existing restart timeout
  if (restartTimeout) {
    clearTimeout(restartTimeout);
    restartTimeout = null;
  }
  
  restartAttempts = 0; // Reset restart attempts
  startStreamInternal();
  res.json({ message: 'Stream started successfully' });
});

// Stop streaming endpoint
app.post('/stop', (req, res) => {
  if (!isStreaming || !streamProcess) {
    return res.json({ message: 'No stream is currently running' });
  }

  console.log('Stopping livestream...');
  
  // Stop health monitoring
  stopStreamHealthMonitoring();
  
  // Clear restart timeout
  if (restartTimeout) {
    clearTimeout(restartTimeout);
    restartTimeout = null;
  }
  
  streamProcess.kill('SIGTERM');
  isStreaming = false;
  streamProcess = null;
  restartAttempts = 0; // Reset restart attempts
  
  res.json({ message: 'Stream stopped successfully' });
});

// Status endpoint
app.get('/status', (req, res) => {
  res.json({
    streaming: isStreaming,
    restartAttempts: restartAttempts,
    maxRestartAttempts: MAX_RESTART_ATTEMPTS,
    timestamp: new Date().toISOString()
  });
});

// Streaming stats endpoint
app.get('/stats', (req, res) => {
  const currentConfig = STREAMING_CONFIGS[currentConfigIndex];
  const currentEndpoint = RTMP_ENDPOINTS[currentEndpointIndex];
  
  res.json({
    streaming: isStreaming,
    restartAttempts: restartAttempts,
    maxRestartAttempts: MAX_RESTART_ATTEMPTS,
    hasRestartTimeout: !!restartTimeout,
    consecutiveErrors: consecutiveErrors,
    totalRestartAttempts: totalRestartAttempts,
    currentEndpoint: currentEndpoint,
    currentEndpointIndex: currentEndpointIndex + 1,
    totalEndpoints: RTMP_ENDPOINTS.length,
    currentConfig: currentConfig.name,
    currentConfigIndex: currentConfigIndex + 1,
    totalConfigs: STREAMING_CONFIGS.length,
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    timestamp: new Date().toISOString()
  });
});

// Manual restart endpoint
app.post('/restart', (req, res) => {
  if (isStreaming) {
    console.log('Stopping current stream for restart...');
    stopStreamHealthMonitoring();
    streamProcess.kill('SIGTERM');
    isStreaming = false;
    streamProcess = null;
  }
  
  // Clear any existing restart timeout
  if (restartTimeout) {
    clearTimeout(restartTimeout);
    restartTimeout = null;
  }
  
  restartAttempts = 0; // Reset restart attempts
  console.log('Manual restart requested...');
  
  setTimeout(() => {
    startStreamInternal();
  }, 1000);
  
  res.json({ message: 'Manual restart initiated' });
});

// Auto-restart control endpoints
app.post('/auto-restart/enable', (req, res) => {
  autoRestartEnabled = true;
  console.log('Auto-restart enabled');
  res.json({ message: 'Auto-restart enabled', autoRestartEnabled: true });
});

app.post('/auto-restart/disable', (req, res) => {
  autoRestartEnabled = false;
  stopStreamHealthMonitoring();
  console.log('Auto-restart disabled');
  res.json({ message: 'Auto-restart disabled', autoRestartEnabled: false });
});

app.get('/auto-restart/status', (req, res) => {
  res.json({
    autoRestartEnabled: autoRestartEnabled,
    isStreaming: isStreaming,
    lastStreamActivity: lastStreamActivity,
    timeSinceLastActivity: Date.now() - lastStreamActivity,
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
        <h1>Pepe Livestreamer Control Panel</h1>
        <p>Status: <span id="status">${isStreaming ? 'Streaming' : 'Stopped'}</span></p>
        <p>Auto-Restart: <span id="autoRestartStatus">Enabled</span></p>
        <p>Restart Attempts: <span id="restartAttempts">0</span>/10</p>
        <p>Total Attempts: <span id="totalAttempts">0</span></p>
        <p>Consecutive Errors: <span id="consecutiveErrors">0</span></p>
        <p>Current Config: <span id="currentConfig">High Performance</span></p>
        <p>Current Endpoint: <span id="currentEndpoint">1/3</span></p>
        <p>Last Activity: <span id="lastActivity">0</span> seconds ago</p>
        <button class="start" onclick="startStream()">Start Stream</button>
        <button class="stop" onclick="stopStream()">Stop Stream</button>
        <button onclick="restartStream()" style="background-color: #ff9800; color: white;">Restart Stream</button>
        <button onclick="toggleAutoRestart()" id="autoRestartBtn" style="background-color: #4CAF50; color: white;">Disable Auto-Restart</button>
        <button onclick="loadStats()">Refresh Stats</button>
        
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
          
          async function restartStream() {
            const response = await fetch('/restart', { method: 'POST' });
            const data = await response.json();
            alert(data.message);
            location.reload();
          }
          
          async function toggleAutoRestart() {
            const response = await fetch('/auto-restart/status');
            const data = await response.json();
            
            if (data.autoRestartEnabled) {
              await fetch('/auto-restart/disable', { method: 'POST' });
              document.getElementById('autoRestartBtn').textContent = 'Enable Auto-Restart';
              document.getElementById('autoRestartBtn').style.backgroundColor = '#f44336';
              document.getElementById('autoRestartStatus').textContent = 'Disabled';
              document.getElementById('autoRestartStatus').style.color = '#f44336';
            } else {
              await fetch('/auto-restart/enable', { method: 'POST' });
              document.getElementById('autoRestartBtn').textContent = 'Disable Auto-Restart';
              document.getElementById('autoRestartBtn').style.backgroundColor = '#4CAF50';
              document.getElementById('autoRestartStatus').textContent = 'Enabled';
              document.getElementById('autoRestartStatus').style.color = '#4CAF50';
            }
          }
          
          async function loadStats() {
            const response = await fetch('/stats');
            const data = await response.json();
            document.getElementById('status').textContent = data.streaming ? 'Streaming' : 'Stopped';
            document.getElementById('restartAttempts').textContent = data.restartAttempts;
            document.getElementById('totalAttempts').textContent = data.totalRestartAttempts;
            document.getElementById('consecutiveErrors').textContent = data.consecutiveErrors;
            document.getElementById('currentConfig').textContent = data.currentConfig;
            document.getElementById('currentEndpoint').textContent = `${data.currentEndpointIndex}/${data.totalEndpoints}`;
            
            // Auto-restart status
            const autoRestartResponse = await fetch('/auto-restart/status');
            const autoRestartData = await autoRestartResponse.json();
            document.getElementById('autoRestartStatus').textContent = autoRestartData.autoRestartEnabled ? 'Enabled' : 'Disabled';
            document.getElementById('autoRestartStatus').style.color = autoRestartData.autoRestartEnabled ? '#4CAF50' : '#f44336';
            document.getElementById('autoRestartBtn').textContent = autoRestartData.autoRestartEnabled ? 'Disable Auto-Restart' : 'Enable Auto-Restart';
            document.getElementById('autoRestartBtn').style.backgroundColor = autoRestartData.autoRestartEnabled ? '#4CAF50' : '#f44336';
            
            // Last activity
            const timeSinceActivity = Math.floor((Date.now() - autoRestartData.lastStreamActivity) / 1000);
            document.getElementById('lastActivity').textContent = timeSinceActivity;
            
            // Color coding for status
            const statusEl = document.getElementById('status');
            statusEl.style.color = data.streaming ? '#4CAF50' : '#f44336';
            
            // Color coding for config based on attempt count
            const configEl = document.getElementById('currentConfig');
            if (data.totalRestartAttempts > 5) {
              configEl.style.color = '#ff9800';
            } else if (data.totalRestartAttempts > 2) {
              configEl.style.color = '#ff5722';
            } else {
              configEl.style.color = '#4CAF50';
            }
          }
          
          // Auto-refresh stats every 5 seconds
          setInterval(loadStats, 5000);
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
