// DOM Elements
const homeContainer = document.querySelector('.home-container');
const chatInterface = document.getElementById('chat-interface');
const messageArea = document.getElementById('message-area');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const leaveChat = document.getElementById('leave-chat');
const chatTitle = document.getElementById('chat-title');
const usernameInput = document.getElementById('username');
const onlineCount = document.getElementById('online-count');
const typingIndicator = document.getElementById('typing-indicator');

// Buttons
const randomChatBtn = document.getElementById('random-chat-btn');
const friendChatBtn = document.getElementById('friend-chat-btn');
const joinChatBtn = document.getElementById('join-chat-btn');

// Modals
const randomChatModal = document.getElementById('random-chat-modal');
const friendChatModal = document.getElementById('friend-chat-modal');
const joinChatModal = document.getElementById('join-chat-modal');

// Modal buttons
const cancelRandomChat = document.getElementById('cancel-random-chat');
const cancelFriendChat = document.getElementById('cancel-friend-chat');
const cancelJoin = document.getElementById('cancel-join');
const proceedJoin = document.getElementById('proceed-join');

// Status messages
const randomStatus = document.getElementById('random-status');
const friendStatus = document.getElementById('friend-status');
const joinStatus = document.getElementById('join-status');

// Friend code display and join code input
const friendCode = document.getElementById('friend-code');
const joinCode = document.getElementById('join-code');

// Chat state
let currentRoomId = '';
let currentUsername = '';
let socket = null;
let typing = false;
let typingTimeout = null;
let currentPartnerName = '';
let verifiedUsers = new Set();
let pendingVerification = new Set();

// Set random username as placeholder
usernameInput.placeholder = "User_" + Math.floor(Math.random() * 10000);

// Connect to Socket.io server
function connectToServer() {
    // Connect to your deployed server URL - using relative path for development
    socket = io();
    
    // Socket event listeners
    socket.on('connect', () => {
        console.log('Connected to server');
        socket.emit('update_online_count');
    });
    
    socket.on('disconnect', () => {
        console.log('Disconnected from server');
    });
    
    socket.on('online_count', (count) => {
        onlineCount.innerHTML = `<i class="fas fa-circle"></i> ${count} online`;
    });
    
    socket.on('chat_message', (data) => {
        addMessage(data.message, data.username === currentUsername);
    });
    
    socket.on('user_joined', (username) => {
        currentPartnerName = username;
        addSystemMessage(`${username} has joined the chat`);
    });
    
    socket.on('user_left', (username) => {
        addSystemMessage(`${username} has left the chat`);
    });
    
    socket.on('room_created', (roomId) => {
        currentRoomId = roomId;
        friendCode.textContent = roomId;
    });
    
    socket.on('room_joined', (roomData) => {
        currentRoomId = roomData.roomId;
        
        if (roomData.success) {
            if (roomData.type === 'friend') {
                friendStatus.textContent = 'Successfully joined room!';
                setTimeout(() => {
                    friendChatModal.style.display = 'none';
                    showChatInterface(`Chat Room: ${currentRoomId}`);
                }, 1000);
            } else if (roomData.type === 'join') {
                joinStatus.textContent = 'Successfully joined room!';
                setTimeout(() => {
                    joinChatModal.style.display = 'none';
                    showChatInterface(`Chat Room: ${currentRoomId}`);
                }, 1000);
            } else if (roomData.type === 'random') {
                randomStatus.textContent = 'Found a chat partner!';
                setTimeout(() => {
                    randomChatModal.style.display = 'none';
                    showChatInterface('Random Chat');
                }, 1000);
            }
        } else {
            if (roomData.type === 'join') {
                joinStatus.textContent = 'Room not found or full';
            }
        }
    });
    
    socket.on('room_closed', () => {
        addSystemMessage('The chat room has been closed');
        setTimeout(() => {
            returnToHome();
        }, 3000);
    });
    
    socket.on('typing', (username) => {
        if (username !== currentUsername) {
            typingIndicator.textContent = `${username} is typing...`;
        }
    });
    
    socket.on('stop_typing', () => {
        typingIndicator.textContent = '';
    });
    
    // User verification related events
    socket.on('user_verification_request', (data) => {
        pendingVerification.add(data.userId);
        addSystemMessage(`Verifying ${data.username} is a real person...`);
        
        // Simple CAPTCHA like verification
        setTimeout(() => {
            socket.emit('verify_user_response', {
                userId: data.userId,
                roomId: currentRoomId,
                verified: true
            });
        }, 2000);
    });
    
    socket.on('user_verified', (data) => {
        verifiedUsers.add(data.userId);
        currentPartnerName = data.username;
        addSystemMessage(`${data.username} has been verified as a real user!`);
    });
    
    socket.on('bot_detected', (data) => {
        addSystemMessage(`Warning: ${data.username} appears to be automated and has been flagged.`);
    });
    
    socket.on('duplicate_ip_warning', () => {
        addSystemMessage("Warning: Multiple connections detected from your IP address. This may restrict your ability to join new chats.");
    });
    
    socket.on('connection_quality', (data) => {
        if (data.quality === 'poor') {
            addSystemMessage("Warning: Poor connection quality detected. Messages may be delayed.");
        }
    });
}

// Show the chat interface
function showChatInterface(title) {
    homeContainer.style.display = 'none';
    chatInterface.style.display = 'flex';
    chatTitle.textContent = title;
    messageArea.innerHTML = ''; // Clear previous messages
    
    // Add welcome system message
    addSystemMessage('Welcome to the chat! Remember to be respectful.');
}

function returnToHome() {
    if (currentRoomId && socket) {
        socket.emit('leave_room', {
            roomId: currentRoomId,
            username: currentUsername
        });
    }
    currentRoomId = '';
    homeContainer.style.display = 'block';
    chatInterface.style.display = 'none';
}

// Add message to the chat
function addMessage(message, isOutgoing = false) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    messageElement.classList.add(isOutgoing ? 'outgoing' : 'incoming');
    messageElement.textContent = message;
    
    const messageMetaElement = document.createElement('div');
    messageMetaElement.classList.add('message-meta');
    
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    messageMetaElement.textContent = isOutgoing ? `You • ${timestamp}` : `${currentPartnerName || 'User'} • ${timestamp}`;
    
    messageElement.appendChild(messageMetaElement);
    messageArea.appendChild(messageElement);
    messageArea.scrollTop = messageArea.scrollHeight;
}

// Add system message
function addSystemMessage(message) {
    const systemElement = document.createElement('div');
    systemElement.classList.add('system-message');
    systemElement.textContent = message;
    messageArea.appendChild(systemElement);
    messageArea.scrollTop = messageArea.scrollHeight;
}

// Validate username
function validateUsername() {
    const username = usernameInput.value.trim() || usernameInput.placeholder;
    if (username.length < 3) {
        alert('Username must be at least 3 characters long');
        return false;
    }
    currentUsername = username;
    return true;
}

// Handle sending messages
function sendMessage() {
    const message = messageInput.value.trim();
    if (message && currentRoomId) {
        socket.emit('send_message', {
            roomId: currentRoomId,
            message: message,
            username: currentUsername
        });
        messageInput.value = '';
    }
}

// Handle typing indicator
function handleTyping() {
    if (!typing) {
        typing = true;
        socket.emit('typing', {
            roomId: currentRoomId,
            username: currentUsername
        });
    }
    
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        typing = false;
        socket.emit('stop_typing', {
            roomId: currentRoomId
        });
    }, 1000);
}

// Initialize Socket.io connection on page load
document.addEventListener('DOMContentLoaded', connectToServer);

// Event listeners
randomChatBtn.addEventListener('click', () => {
    if (!validateUsername()) return;
    
    randomChatModal.style.display = 'flex';
    // Fix: There's a mismatch - the server expects find_random_chat but your UI calls join_random
    socket.emit('find_random_chat', {
        username: currentUsername
    });
});

friendChatBtn.addEventListener('click', () => {
    if (!validateUsername()) return;
    
    friendChatModal.style.display = 'flex';
    socket.emit('create_room', {
        username: currentUsername,
        type: 'friend'
    });
});

joinChatBtn.addEventListener('click', () => {
    if (!validateUsername()) return;
    
    joinChatModal.style.display = 'flex';
});

proceedJoin.addEventListener('click', () => {
    const code = joinCode.value.trim();
    if (!code) {
        joinStatus.textContent = 'Please enter a valid code';
        return;
    }
    
    socket.emit('join_room', {
        roomId: code,
        username: currentUsername,
        type: 'join'
    });
});

cancelRandomChat.addEventListener('click', () => {
    // Fix: Server expects cancel_random_search not cancel_random
    socket.emit('cancel_random_search', {
        username: currentUsername
    });
    randomChatModal.style.display = 'none';
});

cancelFriendChat.addEventListener('click', () => {
    // Fix: Server doesn't have cancel_friend event, use close_room instead
    socket.emit('close_room', {
        roomId: currentRoomId
    });
    friendChatModal.style.display = 'none';
});

cancelJoin.addEventListener('click', () => {
    joinChatModal.style.display = 'none';
});

leaveChat.addEventListener('click', () => {
    returnToHome();
});

sendButton.addEventListener('click', sendMessage);

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
    handleTyping();
});

messageInput.addEventListener('input', handleTyping);

// Activity tracking
let activityTimeout;
let recentActivity = false;

function resetActivityTimer() {
    clearTimeout(activityTimeout);
    activityTimeout = setTimeout(() => {
        // Prompt user to verify they're still active
        addSystemMessage("Are you still there? Please send a message to continue.");
        
        socket.emit('activity_check', {
            roomId: currentRoomId,
            username: currentUsername
        });
        
        // Give user 30 seconds to respond before disconnecting
        setTimeout(() => {
            if (!recentActivity) {
                returnToHome();
                addSystemMessage("You've been disconnected due to inactivity.");
            }
        }, 30000);
    }, 300000); // 5 minutes of inactivity
}

document.addEventListener('mousemove', () => {
    recentActivity = true;
    resetActivityTimer();
});

document.addEventListener('keypress', () => {
    recentActivity = true;
    resetActivityTimer();
});

// Function to authenticate connected users
function authenticateUser(userId) {
    if (verifiedUsers.has(userId)) {
        return true;
    }
    
    socket.emit('request_verification', {
        userId: userId,
        roomId: currentRoomId
    });
    
    return false;
}

// Rate limiting for messages
let messageCount = 0;
let lastMessageTime = Date.now();

function checkMessageRateLimit() {
    const currentTime = Date.now();
    const timeElapsed = currentTime - lastMessageTime;
    
    if (timeElapsed < 500) { // Less than 0.5 second between messages
        messageCount++;
        
        if (messageCount > 5) { // More than 5 rapid messages
            addSystemMessage("Warning: You're sending messages too quickly. Please slow down.");
            return false;
        }
    } else {
        // Reset counter if enough time has passed
        if (timeElapsed > 5000) { // 5 seconds
            messageCount = 0;
        }
    }
    
    lastMessageTime = currentTime;
    return true;
}

// Start the activity timer when the page loads
resetActivityTimer();
