// ========================================
// FULLY AUTOMATIC LIVESTREAMER v3.0
// ========================================
const ffmpeg = require('fluent-ffmpeg');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

console.log('🚀 FULLY AUTOMATIC LIVESTREAMER v3.0 STARTING...');

// Configuration
const VIDEO_URLS = [
  'https://www.dropbox.com/scl/fi/esjfz5uujwgafvcjidx0g/generated_video-10.mp4?rlkey=isfdeugfzv1p4t9fqne9g48pm&st=btbst1gu&dl=1',
  'https://www.dropbox.com/scl/fi/mx6tmkzl5a66fmvirk1o2/202510240744-7.mp4?rlkey=f9594j9jhvwk78ez6ui64f1yd&st=wh1mqgrm&dl=1'
];

// Ultimate fallback - Embedded Pepe image when everything fails
const FALLBACK_IMAGE_SVG = `data:image/svg+xml;base64,${Buffer.from(`
<svg width="400" height="300" viewBox="0 0 400 300" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="400" height="300" fill="#80d380"/>
  <rect x="100" y="50" width="200" height="200" rx="10" fill="#60a660"/>
  <circle cx="150" cy="120" r="15" fill="#000000"/>
  <circle cx="250" cy="120" r="15" fill="#000000"/>
  <rect x="140" y="150" width="120" height="10" rx="5" fill="#000000"/>
  <rect x="170" y="200" width="60" height="40" rx="5" fill="#ffffff"/>
  <text x="200" y="225" font-family="Arial" font-size="14" fill="#000000" text-anchor="middle">PEPE</text>
</svg>`).toString('base64')}`;
const STREAM_KEY = 'bFTdmGKyY9cx';

// Multiple RTMP endpoints for fallback
const RTMP_ENDPOINTS = [
  'rtmps://pump-prod-tg2x8veh.rtmp.livekit.cloud/x',
  'rtmp://pump-prod-tg2x8veh.rtmp.livekit.cloud/x',
  'rtmp://pump-prod-tg2x8veh.rtmp.livekit.cloud/x'
];

// Streaming configurations
const STREAMING_CONFIGS = [
  {
    name: 'High Performance',
    inputOptions: ['-re', '-fflags', '+genpts', '-avoid_negative_ts', 'make_zero'],
    outputOptions: ['-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency', '-crf', '22', '-maxrate', '3M', '-bufsize', '1M', '-g', '30', '-c:a', 'aac', '-b:a', '128k', '-f', 'flv']
  },
  {
    name: 'Stable Fallback',
    inputOptions: ['-re', '-fflags', '+genpts', '-avoid_negative_ts', 'make_zero'],
    outputOptions: ['-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency', '-crf', '25', '-maxrate', '2M', '-bufsize', '1M', '-g', '60', '-c:a', 'aac', '-b:a', '96k', '-f', 'flv']
  },
  {
    name: 'Ultra Stable',
    inputOptions: ['-re', '-fflags', '+genpts', '-avoid_negative_ts', 'make_zero'],
    outputOptions: ['-c:v', 'libx264', '-preset', 'fast', '-tune', 'zerolatency', '-crf', '28', '-maxrate', '1M', '-bufsize', '2M', '-g', '120', '-c:a', 'aac', '-b:a', '64k', '-f', 'flv']
  }
];

// Global variables
let streamProcess = null;
let isStreaming = false;
let currentEndpointIndex = 0;
let currentConfigIndex = 0;
let currentVideoIndex = 0;
let restartAttempts = 0;
const MAX_RESTART_ATTEMPTS = 10;
let healthCheckInterval = null;
let videoRotationInterval = null;
let lastStreamActivity = Date.now();
const VIDEO_ROTATION_INTERVAL = 5 * 60 * 1000; // 5 minutes in milliseconds

// Fallback mode variables
let isFallbackMode = false;
let fallbackAttempts = 0;
const MAX_FALLBACK_ATTEMPTS = 5;

// Video validation function
function validateVideoUrl(url) {
  // Check if URL has proper dl=1 parameter for Dropbox
  if (url.includes('dropbox.com') && !url.includes('dl=1')) {
    console.log('⚠️ Warning: Dropbox URL missing dl=1 parameter');
    return false;
  }
  return true;
}

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

// Video rotation functions
function startVideoRotation() {
  if (videoRotationInterval) {
    clearInterval(videoRotationInterval);
  }
  
  // Rotate videos every 5 minutes
  videoRotationInterval = setInterval(() => {
    if (isStreaming && !isFallbackMode) {
      console.log('🔄 Time-based rotation to next video...');
      rotateToNextVideo();
    }
  }, VIDEO_ROTATION_INTERVAL);
}

function stopVideoRotation() {
  if (videoRotationInterval) {
    clearInterval(videoRotationInterval);
    videoRotationInterval = null;
  }
}

function rotateToNextVideo() {
  const previousVideo = currentVideoIndex + 1;
  currentVideoIndex = (currentVideoIndex + 1) % VIDEO_URLS.length;
  const nextVideo = currentVideoIndex + 1;
  
  console.log('🔄 ROTATING VIDEOS:');
  console.log('   Previous: Video ' + previousVideo + '/' + VIDEO_URLS.length);
  console.log('   Next: Video ' + nextVideo + '/' + VIDEO_URLS.length);
  console.log('   URL: ' + VIDEO_URLS[currentVideoIndex]);
  
  // Restart stream with new video
  if (streamProcess) {
    streamProcess.kill('SIGTERM');
    streamProcess = null;
  }
  
  isStreaming = false;
  stopHealthMonitoring();
  stopVideoRotation();
  
  setTimeout(() => {
    startStream();
  }, 2000);
}

// Ultimate fallback mode - use static Pepe image
function startFallbackMode() {
  console.log('🚨 ENTERING ULTIMATE FALLBACK MODE - PEPE IMAGE');
  console.log('🔄 All video sources failed, using static Pepe image as last resort');
  
  isFallbackMode = true;
  fallbackAttempts++;
  
  if (streamProcess) {
    streamProcess.kill('SIGTERM');
    streamProcess = null;
  }
  
  isStreaming = false;
  stopHealthMonitoring();
  stopVideoRotation();
  
  setTimeout(() => {
    startFallbackStream();
  }, 3000);
}

function startFallbackStream() {
  if (isStreaming) {
    return;
  }

  console.log('🖼️ Starting fallback stream with Pepe image...');
  
  try {
    const config = STREAMING_CONFIGS[2]; // Use ultra stable config
    const endpoint = RTMP_ENDPOINTS[currentEndpointIndex]; // Use current endpoint
    const rtmpUrl = endpoint + '/' + STREAM_KEY;
    
    console.log('Using fallback config: ' + config.name);
    console.log('Using endpoint: ' + endpoint);
    console.log('Using embedded fallback image (SVG)');
    
    streamProcess = ffmpeg()
      .input(FALLBACK_IMAGE_SVG)
      .inputOptions(['-loop', '1', '-r', '1', '-t', '3600']) // Loop image for 1 hour
      .outputOptions(['-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'stillimage', '-crf', '30', '-maxrate', '500k', '-bufsize', '1M', '-g', '60', '-c:a', 'aac', '-b:a', '32k', '-f', 'flv'])
      .output(rtmpUrl)
      .on('start', (commandLine) => {
        console.log('✅ Fallback stream started successfully');
        console.log('FFmpeg command:', commandLine);
        isStreaming = true;
        lastStreamActivity = Date.now();
        startHealthMonitoring();
      })
      .on('progress', (progress) => {
        console.log('Fallback processing: ' + progress.percent + '% done');
        lastStreamActivity = Date.now();
      })
      .on('error', (err) => {
        console.error('❌ Fallback streaming error:', err.message);
        
        isStreaming = false;
        stopHealthMonitoring();
        
        if (fallbackAttempts < MAX_FALLBACK_ATTEMPTS) {
          fallbackAttempts++;
          console.log('🔄 Retrying fallback stream (attempt ' + fallbackAttempts + '/' + MAX_FALLBACK_ATTEMPTS + ')...');
          
          // Try different endpoint
          currentEndpointIndex = (currentEndpointIndex + 1) % RTMP_ENDPOINTS.length;
          console.log('Trying endpoint: ' + RTMP_ENDPOINTS[currentEndpointIndex]);
          
          setTimeout(() => {
            startFallbackStream();
          }, 5000);
        } else {
          console.error('❌ All fallback attempts exhausted - stream offline');
        }
      })
      .on('end', () => {
        console.log('Fallback stream ended');
        isStreaming = false;
        stopHealthMonitoring();
      });

    streamProcess.run();
    
  } catch (error) {
    console.error('Error starting fallback stream:', error);
    isStreaming = false;
  }
}

// Restart stream function
function restartStream() {
  console.log('🔄 Restarting stream...');
  
  if (streamProcess) {
    streamProcess.kill('SIGTERM');
    streamProcess = null;
  }
  
  isStreaming = false;
  stopHealthMonitoring();
  
  // Check if we should enter fallback mode
  if (restartAttempts >= MAX_RESTART_ATTEMPTS && !isFallbackMode) {
    console.log('🚨 Max restart attempts reached - entering fallback mode');
    startFallbackMode();
    return;
  }
  
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

  console.log('🎥 Starting automatic stream...');
  
  try {
    const config = STREAMING_CONFIGS[currentConfigIndex];
    const endpoint = RTMP_ENDPOINTS[currentEndpointIndex];
    const rtmpUrl = endpoint + '/' + STREAM_KEY;
    const currentVideoUrl = VIDEO_URLS[currentVideoIndex];
    
    // Validate video URL
    if (!validateVideoUrl(currentVideoUrl)) {
      console.log('⚠️ Video URL validation failed, rotating to next video...');
      rotateToNextVideo();
      return;
    }
    
    console.log('📺 STREAM SETUP:');
    console.log('   Config: ' + config.name);
    console.log('   Endpoint: ' + endpoint);
    console.log('   Video: ' + (currentVideoIndex + 1) + '/' + VIDEO_URLS.length);
    console.log('   URL: ' + currentVideoUrl);
    
    streamProcess = ffmpeg()
      .input(currentVideoUrl)
      .inputOptions(config.inputOptions)
      .outputOptions(config.outputOptions)
      .output(rtmpUrl)
      .on('start', (commandLine) => {
        console.log('✅ Stream started successfully');
        console.log('FFmpeg command:', commandLine);
        isStreaming = true;
        lastStreamActivity = Date.now();
        startHealthMonitoring();
        startVideoRotation();
      })
      .on('progress', (progress) => {
        console.log('Processing: ' + progress.percent + '% done');
        lastStreamActivity = Date.now();
      })
      .on('error', (err) => {
        console.error('❌ Streaming error:', err.message);
        console.error('Error code:', err.code);
        
        isStreaming = false;
        stopHealthMonitoring();
        stopVideoRotation();
        
        if (restartAttempts < MAX_RESTART_ATTEMPTS) {
          restartAttempts++;
          console.log('🔄 Auto-restarting stream (attempt ' + restartAttempts + '/' + MAX_RESTART_ATTEMPTS + ')...');
          restartStream();
        } else {
          console.error('❌ Max restart attempts reached');
        }
      })
      .on('end', () => {
        console.log('Stream ended - video finished playing');
        isStreaming = false;
        stopHealthMonitoring();
        stopVideoRotation();
        
        // If not in fallback mode, rotate to next video
        if (!isFallbackMode) {
          console.log('🎥 Video finished, rotating to next video...');
          setTimeout(() => {
            rotateToNextVideo();
          }, 2000);
        }
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
    currentVideo: isFallbackMode ? 'FALLBACK' : (currentVideoIndex + 1),
    totalVideos: isFallbackMode ? 'FALLBACK' : VIDEO_URLS.length,
    currentVideoUrl: isFallbackMode ? 'EMBEDDED_SVG' : VIDEO_URLS[currentVideoIndex],
    isFallbackMode: isFallbackMode,
    restartAttempts: restartAttempts,
    fallbackAttempts: fallbackAttempts,
    timestamp: new Date().toISOString()
  });
});

// Simple status page
app.get('/', (req, res) => {
  const statusHtml = isStreaming ? (isFallbackMode ? 'Fallback Mode' : 'Streaming') : 'Stopped';
  const configName = STREAMING_CONFIGS[currentConfigIndex].name;
  const endpointNum = currentEndpointIndex + 1;
  const videoNum = isFallbackMode ? 'FALLBACK' : (currentVideoIndex + 1);
  
  const html = '<html><head><title>Pepe Livestreamer - Auto Mode</title>' +
    '<style>body{font-family:Arial,sans-serif;margin:40px;background:#f5f5f5}' +
    '.status-card{background:white;padding:30px;border-radius:15px;box-shadow:0 4px 20px rgba(0,0,0,0.1);max-width:600px;margin:0 auto}' +
    '.status{font-size:28px;font-weight:bold;margin:20px 0}' +
    '.streaming{color:#4CAF50}' +
    '.fallback{color:#ff6b35}' +
    '.stopped{color:#f44336}' +
    '.info{margin:15px 0;font-size:16px}' +
    '.auto-badge{background:#4CAF50;color:white;padding:5px 15px;border-radius:20px;font-size:14px}' +
    '</style></head><body>' +
    '<div class="status-card">' +
    '<h1>🎥 Pepe Livestreamer</h1>' +
    '<div class="auto-badge">FULLY AUTOMATIC</div>' +
    '<p class="status" id="status">' + statusHtml + '</p>' +
    '<div class="info">' +
    '<p><strong>Mode:</strong> Fully Automatic</p>' +
    '<p><strong>Current Config:</strong> <span id="config">' + configName + '</span></p>' +
    '<p><strong>Endpoint:</strong> <span id="endpoint">' + endpointNum + '/3</span></p>' +
    '<p><strong>Current Video:</strong> <span id="video">' + videoNum + (isFallbackMode ? '' : ('/' + VIDEO_URLS.length)) + '</span></p>' +
    '<p><strong>Restart Attempts:</strong> <span id="attempts">' + restartAttempts + '</span></p>' +
    (isFallbackMode ? '<p><strong>Fallback Mode:</strong> <span style="color:#ff6b35;font-weight:bold">ACTIVE - EMBEDDED PEPE SVG</span></p>' : '') +
    '</div>' +
    '<p style="color:#666;font-style:italic;margin-top:30px">' +
    '🚀 Stream runs automatically on deployment<br>' +
    '🔄 Auto-restarts on any error<br>' +
    '🎥 Rotates between multiple videos every 5 minutes<br>' +
    '🛡️ Multiple fallback configurations<br>' +
    '🖼️ Ultimate fallback: Pepe image when all else fails<br>' +
    '⚡ No manual intervention needed!' +
    '</p>' +
    '</div>' +
    '<script>' +
    'async function updateStatus(){' +
    'try{' +
    'const response=await fetch("/status");' +
    'const data=await response.json();' +
    'document.getElementById("status").textContent=data.streaming?(data.isFallbackMode?"Fallback Mode":"Streaming"):"Stopped";' +
    'document.getElementById("status").className=data.streaming?(data.isFallbackMode?"status fallback":"status streaming"):"status stopped";' +
    'document.getElementById("config").textContent=data.currentConfig;' +
    'document.getElementById("video").textContent=data.isFallbackMode?"FALLBACK":(data.currentVideo+"/"+data.totalVideos);' +
    'document.getElementById("attempts").textContent=data.restartAttempts;' +
    '}catch(error){' +
    'console.error("Error updating status:",error);' +
    '}' +
    '}' +
    'setInterval(updateStatus,5000);' +
    'updateStatus();' +
    '</script>' +
    '</body></html>';
  
  res.send(html);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    streaming: isStreaming,
    timestamp: new Date().toISOString()
  });
});

// Manual rotation endpoint for testing
app.post('/rotate', (req, res) => {
  if (isStreaming && !isFallbackMode) {
    console.log('🔄 Manual rotation triggered via API');
    rotateToNextVideo();
    res.json({ 
      success: true, 
      message: 'Video rotation triggered',
      currentVideo: currentVideoIndex + 1,
      totalVideos: VIDEO_URLS.length
    });
  } else {
    res.json({ 
      success: false, 
      message: 'Cannot rotate - not streaming or in fallback mode',
      streaming: isStreaming,
      fallbackMode: isFallbackMode
    });
  }
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
  if (videoRotationInterval) {
    clearInterval(videoRotationInterval);
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
  if (videoRotationInterval) {
    clearInterval(videoRotationInterval);
  }
  process.exit(0);
});

// Start server and auto-start stream
app.listen(PORT, () => {
  console.log('=== FULLY AUTOMATIC LIVESTREAMER v3.0 ===');
  console.log('Server running on port ' + PORT);
  console.log('Status page: http://localhost:' + PORT + '/');
  console.log('🚀 AUTO-STARTING STREAM IN 3 SECONDS...');
  
  // Auto-start stream on deployment
  setTimeout(() => {
    console.log('🎥 AUTO-STARTING STREAM NOW...');
    startStream();
  }, 3000);
});