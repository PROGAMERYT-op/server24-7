const mineflayer = require('mineflayer');
const pathfinder = require('mineflayer-pathfinder').pathfinder;
const Movements = require('mineflayer-pathfinder').Movements;
const { GoalNear } = require('mineflayer-pathfinder').goals;
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const path = require('path');

// Load configuration
let config;
try {
  config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
} catch (error) {
  console.error('Error loading config.json:', error.message);
  process.exit(1);
}

// Bot state
let botState = {
  connected: false,
  position: { x: 0, y: 0, z: 0 },
  center: { x: config.patrol.centerX, y: config.patrol.centerY, z: config.patrol.centerZ },
  isPatrolling: false,
  currentTarget: null,
  health: 20,
  food: 20,
  lastChat: '',
  players: [],
  serverConfigured: false,
  switchingServers: false
};

// Global bot variable
let bot;

// Function to create and configure bot
function createNewBot() {
  bot = mineflayer.createBot({
    host: config.server.host,
    port: config.server.port,
    username: config.bot.username,
    password: config.bot.password || undefined,
    version: config.bot.version,
    // Connection stability options
    keepAlive: true,
    checkTimeoutInterval: 30000,
    closeTimeout: 60000,
    // Retry connection options
    retryOnDisconnect: false, // We handle reconnection manually
    // Disable chat plugin to prevent chat processing crashes
    plugins: {
      chat: false
    }
  });
  
  // Remove any remaining chat listeners as backup
  const client = bot._client;
  ['player_chat', 'system_chat', 'disguised_chat', 'chat'].forEach(event => {
    client.removeAllListeners(event);
  });
  
  setupBotEvents();
}

// Function to setup bot event handlers
function setupBotEvents() {
  // Load pathfinder plugin
  bot.loadPlugin(pathfinder);

bot.on('spawn', () => {
  console.log('Bot spawned successfully!');
  botState.connected = true;
  // Use bot's actual spawn position as center
  botState.center = bot.entity.position.clone();
  console.log(`Center point set to spawn position: ${botState.center.x}, ${botState.center.y}, ${botState.center.z}`);
  
  // Set up pathfinder movements
  const movements = new Movements(bot);
  bot.pathfinder.setMovements(movements);
  
  // Always start patrolling after spawn (reconnection or first connection)
  setTimeout(() => {
    console.log('Auto-starting patrol after spawn...');
    startPatrolling();
  }, 2000);
});

bot.on('error', (err) => {
  console.log('Bot error:', err);
  botState.connected = false;
  // Stop patrol on error to prevent conflicts
  botState.isPatrolling = false;
});

// Add connection monitoring
bot.on('connect', () => {
  console.log('Bot connecting to server...');
});

bot.on('login', () => {
  console.log('Bot logged in successfully');
});

// Monitor keepalive packets to detect connection issues early
bot.on('packet', (data, packetMeta) => {
  if (packetMeta.name === 'keep_alive') {
    // Connection is healthy
  }
});

bot.on('end', (reason) => {
  console.log('Bot disconnected:', reason);
  botState.connected = false;
  // Stop current patrol to prevent conflicts
  botState.isPatrolling = false;
  
  // Only auto-reconnect if not switching servers manually
  if (!botState.switchingServers) {
    setTimeout(() => {
      console.log('Attempting to reconnect...');
      try {
        createNewBot();
      } catch (error) {
        console.log('Reconnection failed:', error.message);
        // Try again after longer delay if failed
        setTimeout(() => createNewBot(), 10000);
      }
    }, 5000);
  } else {
    console.log('Not auto-reconnecting (switching servers)');
    botState.switchingServers = false;
  }
});

// Update bot position and detect teleports
bot.on('move', () => {
  if (bot.entity) {
    const newPosition = {
      x: Math.round(bot.entity.position.x * 10) / 10,
      y: Math.round(bot.entity.position.y * 10) / 10,
      z: Math.round(bot.entity.position.z * 10) / 10
    };
    
    // Check if bot has been teleported (more than 5 blocks from center)
    if (botState.center && botState.connected) {
      const distance = Math.sqrt(
        Math.pow(newPosition.x - botState.center.x, 2) +
        Math.pow(newPosition.z - botState.center.z, 2) // Only check X and Z, ignore Y
      );
      
      if (distance > config.patrol.radius + 2) { // Add 2 block buffer to avoid false positives
        console.log(`Teleport detected! Distance from center: ${distance.toFixed(2)} blocks`);
        console.log(`Old center: ${botState.center.x}, ${botState.center.y}, ${botState.center.z}`);
        
        // Update center to new position
        botState.center = {
          x: newPosition.x,
          y: newPosition.y,
          z: newPosition.z
        };
        
        console.log(`New center updated to: ${botState.center.x}, ${botState.center.y}, ${botState.center.z}`);
      }
    }
    
    botState.position = newPosition;
  }
});

// Update health and food
bot.on('health', () => {
  botState.health = bot.health;
  botState.food = bot.food;
});

// Chat processing completely disabled due to server protocol issues
// Use web UI "Set New Center" to change patrol coordinates

// Update player list
bot.on('playerJoined', (player) => {
  updatePlayerList();
});

bot.on('playerLeft', (player) => {
  updatePlayerList();
});

function updatePlayerList() {
  botState.players = Object.keys(bot.players).filter(name => name !== bot.username);
}

// Close setupBotEvents function
}

// Add safety net for any remaining chat processing errors
process.on('uncaughtException', (err) => {
  if (err && err.message && err.message.includes('unknown chat format code')) {
    console.log('Ignoring chat processing error (server compatibility issue)');
    return;
  }
  throw err; // Re-throw other errors
});

// Don't automatically connect - wait for user input
console.log('Bot ready. Waiting for server configuration...');

// Movement and patrolling functions
function getRandomPoint() {
  const radius = config.patrol.radius;
  const angle = Math.random() * 2 * Math.PI;
  const distance = Math.random() * radius;
  
  return {
    x: botState.center.x + Math.cos(angle) * distance,
    y: botState.center.y,
    z: botState.center.z + Math.sin(angle) * distance
  };
}

async function moveToPosition(target) {
  if (!bot.pathfinder) {
    console.log('Pathfinder not available, using basic movement');
    return;
  }

  try {
    botState.currentTarget = target;
    await bot.pathfinder.goto(new GoalNear(target.x, target.y, target.z, 1));
    console.log(`Reached position: ${target.x}, ${target.y}, ${target.z}`);
  } catch (error) {
    console.log('Movement error:', error.message);
  }
}

async function moveToCenter() {
  console.log(`Moving to center: ${botState.center.x}, ${botState.center.y}, ${botState.center.z}`);
  await moveToPosition(botState.center);
}

async function patrol() {
  if (!botState.connected || !botState.isPatrolling) {
    console.log('Patrol stopped: connected=' + botState.connected + ', patrolling=' + botState.isPatrolling);
    return;
  }
  
  try {
    // Move to random point
    const randomPoint = getRandomPoint();
    console.log(`Patrolling to: ${randomPoint.x}, ${randomPoint.y}, ${randomPoint.z}`);
    await moveToPosition(randomPoint);
    console.log(`Successfully reached patrol point`);
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Return to center
    console.log('Returning to center');
    await moveToCenter();
    console.log(`Successfully returned to center`);
    
    // Wait before next patrol
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Continue patrolling - ensure continuous operation
    if (botState.connected && botState.isPatrolling) {
      console.log('Continuing patrol...');
      patrol(); // Direct recursive call to ensure continuity
    } else {
      console.log('Patrol loop ended: connected=' + botState.connected + ', patrolling=' + botState.isPatrolling);
    }
  } catch (error) {
    console.log('Patrol error:', error.message);
    // Always retry if still connected and patrolling, with more aggressive retrying
    if (botState.connected && botState.isPatrolling) {
      console.log('Retrying patrol in 3 seconds...');
      setTimeout(patrol, 3000);
    } else {
      console.log('Not retrying patrol: connected=' + botState.connected + ', patrolling=' + botState.isPatrolling);
    }
  }
}

function startPatrolling() {
  if (botState.connected && !botState.isPatrolling) {
    botState.isPatrolling = true;
    console.log('Starting patrol...');
    patrol();
  }
}

function stopPatrolling() {
  botState.isPatrolling = false;
  console.log('Patrol stopped');
}

// Web server setup
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API endpoints
app.get('/api/bot-status', (req, res) => {
  res.json({
    connected: botState.connected,
    serverConfigured: botState.serverConfigured,
    position: botState.position,
    center: botState.center,
    isPatrolling: botState.isPatrolling,
    health: botState.health,
    food: botState.food,
    lastChat: botState.lastChat,
    players: botState.players,
    uptime: bot && bot.player ? Date.now() - bot.player.ping : 0,
    currentServer: {
      host: config.server.host,
      port: config.server.port
    }
  });
});

app.post('/api/set-center', (req, res) => {
  const { x, y, z } = req.body;
  if (typeof x === 'number' && typeof y === 'number' && typeof z === 'number') {
    botState.center = { x, y, z };
    moveToCenter();
    res.json({ success: true, center: botState.center });
  } else {
    res.status(400).json({ error: 'Invalid coordinates' });
  }
});

app.post('/api/toggle-patrol', (req, res) => {
  if (botState.isPatrolling) {
    stopPatrolling();
  } else {
    startPatrolling();
  }
  res.json({ success: true, isPatrolling: botState.isPatrolling });
});

app.post('/api/update-server', (req, res) => {
  const { host, port } = req.body;
  
  // Validate input
  if (!host || typeof host !== 'string' || host.trim() === '') {
    return res.status(400).json({ error: 'Invalid host' });
  }
  
  if (!port || typeof port !== 'number' || port < 1 || port > 65535) {
    return res.status(400).json({ error: 'Invalid port number' });
  }
  
  try {
    // Update config object
    config.server.host = host.trim();
    config.server.port = port;
    
    // Write updated config to file
    fs.writeFileSync('config.json', JSON.stringify(config, null, 2));
    
    // Set switching flag to prevent auto-reconnect race
    botState.switchingServers = true;
    
    // Disconnect current bot if connected
    if (bot) {
      console.log(`Switching to new server: ${host}:${port}`);
      botState.connected = false;
      botState.isPatrolling = false;
      bot.quit('Switching servers');
    }
    
    // Connect to new server after a short delay
    setTimeout(() => {
      botState.serverConfigured = true;
      createNewBot();
    }, 2000);
    
    res.json({ success: true, message: 'Server updated successfully' });
  } catch (error) {
    console.error('Error updating server config:', error);
    res.status(500).json({ error: 'Failed to update server configuration' });
  }
});

app.post('/api/disconnect', (req, res) => {
  try {
    console.log('User requested disconnect');
    botState.serverConfigured = false;
    botState.connected = false;
    botState.isPatrolling = false;
    botState.switchingServers = true;
    
    if (bot) {
      bot.quit('User requested disconnect');
    }
    
    res.json({ success: true, message: 'Disconnected from server' });
  } catch (error) {
    console.error('Error disconnecting:', error);
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start web server
const server = app.listen(config.web.port, '0.0.0.0', () => {
  console.log(`Web dashboard running on port ${config.web.port}`);
  console.log(`Visit: http://localhost:${config.web.port}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down...');
  if (bot) {
    bot.quit();
  }
  server.close();
  process.exit(0);
});

module.exports = { bot, botState };