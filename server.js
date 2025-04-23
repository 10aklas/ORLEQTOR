const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // In production, restrict this to your domain
    methods: ["GET", "POST"]
  }
});

// Store active users and rooms
const activeUsers = new Map(); // socket.id -> username
const userSockets = new Map(); // username -> socket.id
const rooms = new Map(); // roomId -> {users: [{username, socketId}], type: 'random'|'friend'|'join'}
const randomQueue = []; // Users waiting for random chat

// Generate a random room ID
function generateRoomId(prefix = 'FRD') {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const numbers = '23456789';
  let code = `${prefix}-`;
  
  // Add 3 random numbers
  for (let i = 0; i < 3; i++) {
    code += numbers.charAt(Math.floor(Math.random() * numbers.length));
  }
  
  code += '-';
  
  // Add 3 random numbers
  for (let i = 0; i < 3; i++) {
    code += numbers.charAt(Math.floor(Math.random() * numbers.length));
  }
  
  return code;
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  
  // Update online count for all users
  const updateOnlineCount = () => {
    io.emit('online_count', activeUsers.size);
  };
  
  updateOnlineCount();
  
  // Handle user disconnect
  socket.on('disconnect', () => {
    const username = activeUsers.get(socket.id);
    if (username) {
      // Remove from random queue if present
      const queueIdx = randomQueue.findIndex(user => user.socketId === socket.id);
      if (queueIdx !== -1) {
        randomQueue.splice(queueIdx, 1);
      }
      
      // Handle leaving rooms
      rooms.forEach((roomData, roomId) => {
        const userIdx = roomData.users.findIndex(u => u.socketId === socket.id);
        if (userIdx !== -1) {
          // Remove user from room
          roomData.users.splice(userIdx, 1);
          
          // Notify remaining users
          socket.to(roomId).emit('user_left', username);
          
          // Delete room if empty
          if (roomData.users.length === 0) {
            rooms.delete(roomId);
          }
        }
      });
      
      // Remove user from maps
      activeUsers.delete(socket.id);
      userSockets.delete(username);
      updateOnlineCount();
      console.log(`User disconnected: ${username}`);
    }
  });
  
  // Create a new room
  socket.on('create_room', (data) => {
    const { username } = data;
    if (!username) return;
    
    // Register user if not already registered
    activeUsers.set(socket.id, username);
    userSockets.set(username, socket.id);
    
    // Create a new room
    const roomId = generateRoomId();
    rooms.set(roomId, {
      users: [{ username, socketId: socket.id }],
      type: 'friend'
    });
    
    // Join the socket.io room
    socket.join(roomId);
    
    // Send room created confirmation
    socket.emit('room_created', roomId);
    updateOnlineCount();
  });
  
  // Join an existing room
  socket.on('join_room', (data) => {
    const { roomId, username, type } = data;
    if (!roomId || !username) return;
    
    // Register user if not already registered
    activeUsers.set(socket.id, username);
    userSockets.set(username, socket.id);
    
    // Try to join the room
    const room = rooms.get(roomId);
    const responseData = {
      roomId,
      type,
      success: false
    };
    
    if (room && room.users.length < 2) { // Limit to 2 users per room
      // Add user to room
      room.users.push({ username, socketId: socket.id });
      
      // Join the socket.io room
      socket.join(roomId);
      
      // Send success response
      responseData.success = true;
      socket.emit('room_joined', responseData);
      
      // Notify other users in the room
      socket.to(roomId).emit('user_joined', username);
    } else {
      // Room doesn't exist or is full
      socket.emit('room_joined', responseData);
    }
    
    updateOnlineCount();
  });
  
  // Find a random chat partner
  socket.on('find_random_chat', (data) => {
    const { username } = data;
    if (!username) return;
    
    // Register user if not already registered
    activeUsers.set(socket.id, username);
    userSockets.set(username, socket.id);
    
    // Check if there's someone waiting in the queue
    if (randomQueue.length > 0) {
      // Get the first user in queue
      const partner = randomQueue.shift();
      
      // Create a new room for these two users
      const roomId = generateRoomId('RND');
      rooms.set(roomId, {
        users: [
          { username: partner.username, socketId: partner.socketId },
          { username, socketId: socket.id }
        ],
        type: 'random'
      });
      
      // Join the socket.io room
      socket.join(roomId);
      io.sockets.sockets.get(partner.socketId)?.join(roomId);
      
      // Notify both users
      io.to(roomId).emit('room_joined', {
        roomId,
        type: 'random',
        success: true
      });
      
      // Let users know about each other
      socket.to(roomId).emit('user_joined', username);
      socket.emit('user_joined', partner.username);
    } else {
      // Add to waiting queue
      randomQueue.push({ username, socketId: socket.id });
    }
    
    updateOnlineCount();
  });
  
  // Cancel random chat search
  socket.on('cancel_random_search', () => {
    const queueIdx = randomQueue.findIndex(user => user.socketId === socket.id);
    if (queueIdx !== -1) {
      randomQueue.splice(queueIdx, 1);
    }
  });
  
  // Leave a room
  socket.on('leave_room', (data) => {
    const { roomId, username } = data;
    if (!roomId) return;
    
    const room = rooms.get(roomId);
    if (room) {
      // Remove user from room
      const userIdx = room.users.findIndex(u => u.socketId === socket.id);
      if (userIdx !== -1) {
        room.users.splice(userIdx, 1);
        
        // Leave the socket.io room
        socket.leave(roomId);
        
        // Notify other users
        socket.to(roomId).emit('user_left', username);
        
        // Delete room if empty
        if (room.users.length === 0) {
          rooms.delete(roomId);
        }
      }
    }
  });
  
  // Close a room
  socket.on('close_room', (data) => {
    const { roomId } = data;
    if (!roomId) return;
    
    const room = rooms.get(roomId);
    if (room) {
      // Notify all users in the room
      io.to(roomId).emit('room_closed');
      
      // Make all sockets leave the room
      room.users.forEach(user => {
        const userSocket = io.sockets.sockets.get(user.socketId);
        if (userSocket) {
          userSocket.leave(roomId);
        }
      });
      
      // Delete the room
      rooms.delete(roomId);
    }
  });
  
  // Send a message
  socket.on('send_message', (data) => {
    const { roomId, message } = data;
    if (!roomId || !message) return;
    
    const username = activeUsers.get(socket.id);
    if (!username) return;
    
    const room = rooms.get(roomId);
    if (room) {
      // Broadcast message to all users in the room
      io.to(roomId).emit('chat_message', {
        username,
        message,
        timestamp: new Date()
      });
    }
  });
  
  // Typing indicators
  socket.on('typing', (data) => {
    const { roomId } = data;
    if (!roomId) return;
    
    const username = activeUsers.get(socket.id);
    if (username) {
      socket.to(roomId).emit('typing', username);
    }
  });
  
  socket.on('stop_typing', (data) => {
    const { roomId } = data;
    if (!roomId) return;
    
    socket.to(roomId).emit('stop_typing');
  });
  
  // Request online count
  socket.on('update_online_count', updateOnlineCount);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
