// index.js
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { createClient } from 'redis';
import { v4 as uuidv4 } from 'uuid';

// Create an Express application
const app = express();

// Define a simple route
app.get('/', (req, res) => {
  res.send('Hello from Express!');
});

// Create an HTTP server using the Express app
const server = createServer(app);

// Initialize the WebSocket server instance
const wss = new WebSocketServer({ server });

// Create Redis clients for publishing and subscribing
const redisSubscriber = createClient();
const redisPublisher = createClient();

async function startServer() {
  // Connect Redis clients
  await redisSubscriber.connect();
  await redisPublisher.connect();

  // Map to store clients with their IDs
  const clients = new Map();

  // Subscribe to the 'messages' channel
  await redisSubscriber.subscribe('messages', (message) => {
    const data = JSON.parse(message);

    if (data.type === 'broadcast') {
      // Broadcast message to all connected WebSocket clients
      wss.clients.forEach((client) => {
        if (client.readyState === client.OPEN) {
          client.send(JSON.stringify(data));
        }
      });
    } else if (data.type === 'message') {
      // Send message to a specific client
      const recipientWs = clients.get(data.recipientId);
      if (recipientWs && recipientWs.readyState === recipientWs.OPEN) {
        recipientWs.send(JSON.stringify(data));
      }
    }
  });

  wss.on('connection', (ws) => {
    const clientId = uuidv4();
    ws.clientId = clientId;
    clients.set(clientId, ws);

    console.log(`Client connected: ${clientId}`);

    // Send the client their ID
    ws.send(JSON.stringify({ type: 'welcome', clientId }));

    // Handle incoming messages from WebSocket clients
    ws.on('message', (message) => {
      console.log(`Received: ${message}`);

      const data = JSON.parse(message);

      if (data.type === 'message') {
        // Publish the message to Redis for one-to-one messaging
        redisPublisher.publish(
          'messages',
          JSON.stringify({
            type: 'message',
            message: data.message,
            senderId: ws.clientId,
            recipientId: data.recipientId,
          })
        );
      } else if (data.type === 'broadcast') {
        // Publish the message to Redis for broadcasting
        redisPublisher.publish(
          'messages',
          JSON.stringify({
            type: 'broadcast',
            message: data.message,
            senderId: ws.clientId,
          })
        );
      }
    });

    ws.on('error', (error) => {
      console.error(`Client error: ${error}`);
      ws.close();
    });

    ws.on('close', () => {
      console.log(`Client disconnected: ${clientId}`);
      clients.delete(clientId);
    });
  });

  // Start the server
  
  const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is listening on port ${PORT}`);
});
}

startServer().catch((error) => {
  console.error(`Error starting server: ${error}`);
});
