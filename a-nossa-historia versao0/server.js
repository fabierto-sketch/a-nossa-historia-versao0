"use strict";
const express = require("express");
const http = require("http");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: false }, maxHttpBufferSize: 1e6 });
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "change-me-now";
const DATA_DIR = path.join(__dirname, "data");
const LOCAL_FILE = path.join(DATA_DIR, "local.json");
let pool = null;

try {
  if (process.env.DATABASE_URL) {
    const { Pool } = require("pg");
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
      max: 5
    });
  }
} catch (e) { console.error("PostgreSQL indisponível:", e.message); }

app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/api/", rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }));

const defaultContent = {
  welcomeLetter: "Minha querida Bernardete,\\n\\nQuis criar este pequeno universo para nós. Para guardar o que já vivemos, sorrir com as nossas brincadeiras e imaginar tudo aquilo que ainda queremos viver.\\n\\nCada página é um bocadinho da nossa história. Obrigado por fazeres parte dela.\\n\\nCom carinho, o teu Portuga ❤️",
  chapters: [
    { id: 1, title: "Um encontro inesperado", subtitle: "Às vezes, tudo começa com uma simples conversa.", body: "Foi através de uma aplicação que dois caminhos se cruzaram. Ainda não sabiam o que aquela primeira conversa viria a significar.", prompt: "O que te despertou mais curiosidade no início?", choices: ["A maneira de conversar", "A curiosidade de conhecer melhor", "A simpatia", "Algo difícil de explicar", "Outra coisa"] },
    { id: 2, title: "As primeiras conversas", subtitle: "Uma mensagem tornou-se parte dos nossos dias.", body: "As conversas foram ganhando espaço na rotina. Entre mensagens e chamadas, nasceu a vontade de continuar a descobrir o outro.", prompt: "Qual destas pequenas coisas mais aproxima duas pessoas à distância?", choices: ["Uma mensagem inesperada", "Uma chamada de vídeo", "Partilhar o dia", "Rir juntos", "Todas elas"] },
    { id: 3, title: "Quando percebi que eras diferente", subtitle: "Há pessoas que nos despertam algo especial.", body: "A admiração cresce nos detalhes: a inteligência, o sorriso, a maneira de pensar, a atenção e a forma única de estar presente.", prompt: "O que mais admiras na pessoa que está do outro lado?", choices: ["A inteligência", "O sorriso", "A personalidade", "O carinho", "A cumplicidade"] },
    { id: 4, title: "Portugal ❤️ Brasil", subtitle: "Dois países, um oceano e uma ligação.", body: "Porto e Rio de Janeiro ficam longe no mapa. Mas uma conversa, uma chamada ou um pensamento podem encurtar essa distância.", prompt: "Se pudessem aparecer juntos num lugar agora, qual escolheriam?", choices: ["À beira-mar", "A passear numa cidade", "Num jantar tranquilo", "Em casa, sem pressa", "Num lugar surpresa"] },
    { id: 5, title: "As nossas brincadeiras", subtitle: "Porque o amor também sabe rir.", body: "Jogos, Stop, perguntas, provocações e gargalhadas. A leveza também faz parte daquilo que se constrói a dois.", prompt: "Quem costuma provocar mais o outro?", choices: ["Alberto", "Bernardete", "Os dois por igual", "Depende do dia"] },
    { id: 6, title: "A distância e as saudades", subtitle: "Estar longe não significa estar ausente.", body: "Há dias de trabalho, pausas para conversar, mensagens e videochamadas. A presença também se constrói com atenção, confiança e carinho.", prompt: "O que ajuda mais quando a saudade aperta?", choices: ["Uma videochamada", "Uma mensagem carinhosa", "Falar dos planos", "Recordar momentos", "Saber que estamos presentes"] },
    { id: 7, title: "Agosto de 2027 — o nosso encontro", subtitle: "Um sonho que esperamos transformar em memória.", body: "Este capítulo é uma janela para o futuro. O primeiro encontro presencial ainda está por acontecer. Aqui podem imaginar como gostariam que fosse esse momento.", prompt: "Qual seria o primeiro gesto nesse encontro?", choices: ["Um abraço demorado", "Olhar nos olhos", "Um beijo", "Rir de nervosismo", "Deixar acontecer naturalmente"] }
  ],
  challenges: [
    "Descreve o outro em três palavras, sem repetir elogios habituais.",
    "Conta uma pequena coisa do teu dia que gostavas de partilhar pessoalmente.",
    "Escolhe uma música que associes à vossa história e explica porquê.",
    "Diz uma coisa que ainda gostarias de aprender sobre o outro.",
    "Inventem o nome de uma tradição que gostariam de ter quando estiverem juntos.",
    "Cada um escreve uma memória favorita das vossas conversas.",
    "Planeiem um encontro perfeito com três detalhes simples."
  ]
};

let local = { rooms: {}, content: defaultContent, memories: [], letters: [] };
function loadLocal() {
  try { if (fs.existsSync(LOCAL_FILE)) local = { ...local, ...JSON.parse(fs.readFileSync(LOCAL_FILE, "utf8")) }; }
  catch (e) { console.error("Não foi possível ler dados locais:", e.message); }
}
function saveLocal() {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(LOCAL_FILE, JSON.stringify(local, null, 2)); }
  catch (e) { console.error("Não foi possível guardar dados locais:", e.message); }
}
loadLocal();

async function initDb() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_content (id INTEGER PRIMARY KEY DEFAULT 1, data JSONB NOT NULL);
    CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS memories (id TEXT PRIMARY KEY, data JSONB NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS letters (id TEXT PRIMARY KEY, data JSONB NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())
  `);
  const c = await pool.query("SELECT data FROM app_content WHERE id=1");
  if (!c.rowCount) await pool.query("INSERT INTO app_content(id,data) VALUES(1,$1)", [defaultContent]);
  else local.content = c.rows[0].data;
  const r = await pool.query("SELECT code,data FROM rooms");
  for (const row of r.rows) local.rooms[row.code] = row.data;
  const m = await pool.query("SELECT data FROM memories ORDER BY created_at DESC");
  local.memories = m.rows.map(x => x.data);
  const l = await pool.query("SELECT data FROM letters ORDER BY created_at DESC");
  local.letters = l.rows.map(x => x.data);
}
async function persistRoom(code) {
  if (pool) await pool.query("INSERT INTO rooms(code,data,updated_at) VALUES($1,$2,NOW()) ON CONFLICT(code) DO UPDATE SET data=EXCLUDED.data,updated_at=NOW()", [code, local.rooms[code]]);
  else saveLocal();
}
async function persistContent() {
  if (pool) await pool.query("INSERT INTO app_content(id,data) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data", [local.content]);
  else saveLocal();
}
async function persistItem(table, item) {
  if (pool) await pool.query(`INSERT INTO ${table}(id,data) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data`, [item.id, item]);
  else saveLocal();
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || "")), bb = Buffer.from(String(b || ""));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
const adminTokens = new Set();
function requireAdmin(req, res, next) {
  const token = req.get("x-admin-token") || req.query.token;
  if (token && adminTokens.has(token)) return next();
  return res.status(401).json({ error: "Autenticação necessária." });
}
app.get("/api/content", (req, res) => res.json({ content: local.content }));
app.post("/api/admin/login", (req, res) => {
  if (!safeEqual(req.body.password, ADMIN_PASSWORD)) return res.status(401).json({ error: "Palavra-passe incorreta." });
  const token = crypto.randomBytes(32).toString("hex");
  adminTokens.add(token);
  res.json({ token });
});
app.get("/api/admin/content", requireAdmin, (req, res) => res.json({ content: local.content }));
app.put("/api/admin/content", requireAdmin, async (req, res) => {
  const incoming = req.body.content;
  if (!incoming || !Array.isArray(incoming.chapters) || !Array.isArray(incoming.challenges)) return res.status(400).json({ error: "Conteúdo inválido." });
  local.content = { ...local.content, ...incoming };
  await persistContent();
  res.json({ ok: true });
});
app.get("/api/health", (req, res) => res.json({ ok: true, database: !!pool }));

app.post("/api/rooms", async (req, res) => {
  const name = String(req.body.name || "").trim().slice(0, 32);
  if (!name) return res.status(400).json({ error: "Indica o teu nome." });
  let code;
  do { code = crypto.randomBytes(3).toString("hex").toUpperCase(); } while (local.rooms[code]);
  local.rooms[code] = {
    code, players: [{ id: crypto.randomUUID(), name, joinedAt: Date.now() }],
    chapter: 1, answers: {}, completed: [], chat: [], createdAt: Date.now(),
    status: "waiting", challengeIndex: 0
  };
  await persistRoom(code);
  res.json({ code, playerId: local.rooms[code].players[0].id });
});
app.post("/api/rooms/:code/join", async (req, res) => {
  const code = String(req.params.code).toUpperCase();
  const name = String(req.body.name || "").trim().slice(0, 32);
  const room = local.rooms[code];
  if (!room) return res.status(404).json({ error: "Sala não encontrada." });
  if (!name) return res.status(400).json({ error: "Indica o teu nome." });
  let player = room.players.find(p => p.name.toLowerCase() === name.toLowerCase());
  if (!player) {
    if (room.players.length >= 2) return res.status(409).json({ error: "Esta sala já tem dois jogadores." });
    player = { id: crypto.randomUUID(), name, joinedAt: Date.now() };
    room.players.push(player);
  }
  room.status = room.players.length === 2 ? "playing" : "waiting";
  await persistRoom(code);
  res.json({ code, playerId: player.id, room: publicRoom(room) });
});
function publicRoom(room) {
  return { code: room.code, players: room.players, chapter: room.chapter, completed: room.completed, status: room.status, answers: room.answers, chat: room.chat.slice(-40), challengeIndex: room.challengeIndex };
}
app.get("/api/rooms/:code", (req, res) => {
  const room = local.rooms[String(req.params.code).toUpperCase()];
  if (!room) return res.status(404).json({ error: "Sala não encontrada." });
  res.json({ room: publicRoom(room) });
});
app.post("/api/memories", async (req, res) => {
  const item = { id: crypto.randomUUID(), title: String(req.body.title || "").slice(0,100), date: String(req.body.date || "").slice(0,30), text: String(req.body.text || "").slice(0,2000), author: String(req.body.author || "").slice(0,32), createdAt: Date.now() };
  if (!item.title || !item.text) return res.status(400).json({ error: "Preenche o título e a recordação." });
  local.memories.unshift(item); await persistItem("memories", item); res.json({ item });
});
app.get("/api/memories", (req, res) => res.json({ memories: local.memories }));
app.post("/api/letters", async (req, res) => {
  const item = { id: crypto.randomUUID(), from: String(req.body.from || "").slice(0,32), to: String(req.body.to || "").slice(0,32), text: String(req.body.text || "").slice(0,3000), createdAt: Date.now() };
  if (!item.text.trim()) return res.status(400).json({ error: "Escreve a tua carta." });
  local.letters.unshift(item); await persistItem("letters", item); res.json({ item });
});
app.get("/api/letters", (req, res) => res.json({ letters: local.letters }));

io.on("connection", socket => {
  socket.on("room:join", async ({ code, playerId }) => {
    code = String(code || "").toUpperCase();
    const room = local.rooms[code];
    if (!room || !room.players.some(p => p.id === playerId)) return socket.emit("app:error", "Não foi possível entrar nesta sala.");
    socket.join(code); socket.data.code = code; socket.data.playerId = playerId;
    socket.emit("room:state", publicRoom(room));
    socket.to(code).emit("room:presence", { online: true });
    io.to(code).emit("room:state", publicRoom(room));
  });
  socket.on("answer:submit", async ({ chapter, answer }) => {
    const code = socket.data.code, room = local.rooms[code];
    if (!room || !room.players.some(p => p.id === socket.data.playerId)) return;
    const ch = Math.max(1, Math.min(7, Number(chapter) || room.chapter));
    room.answers[ch] ||= {};
    room.answers[ch][socket.data.playerId] = String(answer || "").slice(0,500);
    if (Object.keys(room.answers[ch]).length >= 2 && !room.completed.includes(ch)) room.completed.push(ch);
    await persistRoom(code);
    io.to(code).emit("room:state", publicRoom(room));
  });
  socket.on("chapter:next", async ({ chapter }) => {
    const code = socket.data.code, room = local.rooms[code];
    if (!room || room.players.length < 2) return;
    const target = Math.max(1, Math.min(7, Number(chapter) || room.chapter + 1));
    if (target <= 1 || room.completed.includes(target - 1)) {
      room.chapter = target; await persistRoom(code); io.to(code).emit("room:state", publicRoom(room));
    }
  });
  socket.on("challenge:next", async () => {
    const code = socket.data.code, room = local.rooms[code];
    if (!room) return;
    room.challengeIndex = (room.challengeIndex + 1) % Math.max(1, local.content.challenges.length);
    await persistRoom(code); io.to(code).emit("room:state", publicRoom(room));
  });
  socket.on("chat:send", async ({ text }) => {
    const code = socket.data.code, room = local.rooms[code];
    if (!room) return;
    const player = room.players.find(p => p.id === socket.data.playerId);
    const msg = { id: crypto.randomUUID(), name: player?.name || "Jogador", text: String(text || "").trim().slice(0,500), at: Date.now() };
    if (!msg.text) return;
    room.chat.push(msg); room.chat = room.chat.slice(-100); await persistRoom(code); io.to(code).emit("chat:new", msg);
  });
  socket.on("webrtc:signal", ({ signal }) => {
    const code = socket.data.code;
    if (code && signal) socket.to(code).emit("webrtc:signal", { signal });
  });
  socket.on("disconnect", () => {
    if (socket.data.code) socket.to(socket.data.code).emit("room:presence", { online: false });
  });
});

app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

initDb().then(() => {
  server.listen(PORT, () => console.log(`A Nossa História disponível na porta ${PORT}`));
}).catch(err => {
  console.error("Erro ao iniciar base de dados:", err);
  server.listen(PORT, () => console.log(`Servidor iniciado na porta ${PORT} (com aviso de BD)`));
});
