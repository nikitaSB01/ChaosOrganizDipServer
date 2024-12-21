const Koa = require("koa");
const Router = require("koa-router");
const bodyParser = require("koa-bodyparser");
const cors = require("@koa/cors");
const multer = require("@koa/multer");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const app = new Koa();
const router = new Router();

app.use(cors());
app.use(bodyParser());

// Заглушки данных
const messages = []; // Для хранения текстовых сообщений и ссылок
const files = []; // Для хранения информации о загруженных файлах

// Вебсокет-сервер
const wss = new WebSocket.Server({ port: 3001 });

wss.on("connection", (ws) => {
  console.log("WebSocket: Client connected");

  ws.on("message", (message) => {
    const parsedMessage = JSON.parse(message);

    // Рассылка сообщений всем подключённым клиентам
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(parsedMessage));
      }
    });
  });

  ws.on("close", () => {
    console.log("WebSocket: Client disconnected");
  });
});

// Маршрут для проверки статуса сервера
router.get("/status", (ctx) => {
  ctx.body = { status: "Server is running!" };
});

// Сохранение текстовых сообщений и ссылок
router.post("/messages", (ctx) => {
  const { type, content } = ctx.request.body;

  if (!type || !content) {
    ctx.status = 400;
    ctx.body = { error: "Invalid request data" };
    return;
  }

  const newMessage = {
    id: Date.now(),
    type, // text, link
    content,
    createdAt: new Date(),
  };

  messages.push(newMessage);

  // Рассылка нового сообщения всем клиентам через WebSocket
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(newMessage));
    }
  });

  ctx.status = 201;
  ctx.body = newMessage;
});

// Ленивая подгрузка сообщений
router.get("/messages", (ctx) => {
  const { offset = 0, limit = 10 } = ctx.query;

  const paginatedMessages = messages
    .slice(-limit - offset, -offset || undefined)
    .reverse();

  ctx.body = paginatedMessages;
});

// Загрузка файлов
const upload = multer({ dest: "uploads/" });

router.post("/upload", upload.single("file"), (ctx) => {
  const file = ctx.file;

  if (!file) {
    ctx.status = 400;
    ctx.body = { error: "No file uploaded" };
    return;
  }

  const newFile = {
    id: Date.now(),
    filename: file.filename,
    originalname: file.originalname,
    mimetype: file.mimetype,
    path: file.path,
    uploadedAt: new Date(),
  };

  files.push(newFile);
  ctx.status = 201;
  ctx.body = newFile;
});

// Скачивание файлов
router.get("/download/:filename", (ctx) => {
  const { filename } = ctx.params;
  const file = files.find((f) => f.filename === filename);

  if (!file) {
    ctx.status = 404;
    ctx.body = { error: "File not found" };
    return;
  }

  ctx.set("Content-disposition", `attachment; filename=${file.originalname}`);
  ctx.set("Content-type", file.mimetype);
  ctx.body = fs.createReadStream(path.resolve(file.path));
});

// Подключение маршрутов
app.use(router.routes()).use(router.allowedMethods());

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
