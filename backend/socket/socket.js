// Socket.js
import { Server } from "socket.io";
import http from "http";
import express from "express";
import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: ['http://localhost:3000'],
        methods: ['GET', 'POST'],
    },
});

// Redis clients for Pub/Sub
const redis = new Redis(process.env.REDIS_URL);         // Redis client for general operations
const pubClient = new Redis(process.env.REDIS_URL);     // Publisher
const subClient = new Redis(process.env.REDIS_URL);     // Subscriber

const userSocketMap = {}; // In-memory cache for socket IDs

// Subscribe to the 'userStatus' channel to listen for user connection updates
subClient.subscribe("userStatus");

subClient.on("message", (channel, message) => {
    if (channel === "userStatus") {
        const { userId, action } = JSON.parse(message);
        io.emit("getOnlineUsers", Object.keys(userSocketMap));
    }
});

export const getReceiverSocketId = (receiverId) => {
    return userSocketMap[receiverId];
};

io.on("connection", (socket) => {
    const userId = socket.handshake.query.userId;

    if (userId) {
        userSocketMap[userId] = socket.id;
        redis.hset("userSocketMap", userId, socket.id);  // Store user and socket in Redis
        pubClient.publish("userStatus", JSON.stringify({ userId, action: "connect" }));
    }

    socket.on("disconnect", () => {
        delete userSocketMap[userId];
        redis.hdel("userSocketMap", userId);  // Remove user from Redis
        pubClient.publish("userStatus", JSON.stringify({ userId, action: "disconnect" }));
    });
});

export { app, io, server };
