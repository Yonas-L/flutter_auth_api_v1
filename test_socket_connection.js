const { io } = require('socket.io-client');

// Test Socket.IO connection
const socket = io('ws://localhost:8080', {
  auth: {
    token: 'test-token' // This will fail authentication, but we can see the connection attempt
  }
});

socket.on('connect', () => {
  console.log('✅ Connected to Socket.IO server');
  console.log('Socket ID:', socket.id);
});

socket.on('connected', (data) => {
  console.log('✅ Authenticated:', data);
});

socket.on('error', (error) => {
  console.log('❌ Socket error:', error);
});

socket.on('connect_error', (error) => {
  console.log('❌ Connection error:', error.message);
});

socket.on('disconnect', (reason) => {
  console.log('❌ Disconnected:', reason);
});

// Test connection for 5 seconds then disconnect
setTimeout(() => {
  console.log('🔌 Disconnecting...');
  socket.disconnect();
  process.exit(0);
}, 5000);
