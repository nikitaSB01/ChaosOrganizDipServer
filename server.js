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

app.use(
  cors({
    origin: "*", // Разрешить все источники
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], // Разрешённые методы
    allowHeaders: ["Content-Type", "Authorization", "Accept"], // Разрешённые заголовки
  })
);

// Путь к папке uploads
const uploadsPath = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath); // Создаём папку, если её нет
}
console.log("Static files served from:", uploadsPath);

// Путь к файлу messages.json
const messagesFilePath = path.join(__dirname, "messages/messages.json");
console.log("Path to messages.json:", messagesFilePath);

// Функция для чтения сообщений из файла
function loadMessagesFromFile() {
  if (fs.existsSync(messagesFilePath)) {
    console.log("File exists. Reading data...");
    const data = fs.readFileSync(messagesFilePath, "utf-8");
    try {
      return JSON.parse(data);
    } catch (error) {
      console.error("Error parsing JSON from file:", error);
      return [];
    }
  }
  console.log("File does not exist. Returning empty array.");
  return [];
}

// Функция для сохранения сообщений в файл
function saveMessagesToFile(messages) {
  console.log("Saving messages to file:", messages); // Отладка
  fs.writeFileSync(messagesFilePath, JSON.stringify(messages, null, 2));
}

// Загружаем сообщения при старте сервера
const messages = loadMessagesFromFile();

// Вебсокет-сервер
const wss = new WebSocket.Server({ port: 3001 });

wss.on("connection", (ws) => {
  console.log("WebSocket: Client connected");

  ws.on("message", (message) => {
    const parsedMessage = JSON.parse(message);
    const newMessage = {
      id: Date.now(),
      type: parsedMessage.type,
      content: parsedMessage.content,
      isSelf: parsedMessage.isSelf || false,
      createdAt: new Date(),
    };

    messages.push(newMessage);
    saveMessagesToFile(messages);

    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(newMessage));
      }
    });
  });

  ws.on("close", () => {
    console.log("WebSocket: Client disconnected");
  });
});

// Маршрут для обработки файлов из папки uploads вручную
router.get("/uploads/:filename", (ctx) => {
  const { filename } = ctx.params;
  const filePath = path.join(uploadsPath, filename);

  if (fs.existsSync(filePath)) {
    ctx.set("Content-Type", "application/octet-stream");
    ctx.body = fs.createReadStream(filePath);
  } else {
    ctx.status = 404;
    ctx.body = { error: "File not found" };
  }
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
    type,
    content,
    createdAt: new Date(),
  };

  messages.push(newMessage); // Добавляем сообщение в массив
  saveMessagesToFile(messages); // Сохраняем массив сообщений в файл

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

  const paginatedMessages = messages.slice(offset, offset + limit);

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

  console.log("Uploaded file path:", path.resolve(file.path)); // Отладка

  const newMessage = {
    id: Date.now(),
    type: "file",
    content: `http://localhost:3000/uploads/${file.filename}`,
    originalname: file.originalname,
    mimetype: file.mimetype,
    createdAt: new Date(),
  };

  messages.push(newMessage);
  saveMessagesToFile(messages);

  ctx.status = 201;
  ctx.body = newMessage;
});

// Подключение маршрутов
app.use(router.routes()).use(router.allowedMethods());

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

router.get("/", (ctx) => {
  ctx.body = {
    message: "Welcome to Chaos Organizer API",
  };
});
