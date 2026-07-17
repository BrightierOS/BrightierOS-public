// BrightierOS server.js
// Ponto de entrada: bootstrap do Express, WebSocket e carregamento de rotas.
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const { exec } = require("child_process");
const os = require("os");
const si = require("systeminformation");
const users = require("./lib/users");
const metrics = require("./lib/metrics");
const infrastructure = require("./lib/infrastructure");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Terminal WebSocket: só administradores autenticados.
function terminalAllowed(req) {
  try {
    const url = new URL(req.url, "http://localhost");
    const token = url.searchParams.get("token") || "";
    const session = users.sessionFromToken(token);
    return !!session && session.role === "admin";
  } catch (_) { return false; }
}

const PORT = Number(process.env.PORT) || 3000;

const handleStartupError = (err) => {
  if (err && err.code === "EADDRINUSE") {
    console.error("Port " + PORT + " is already in use. Close the other process.");
  } else {
    console.error(err);
  }
  process.exit(1);
};

process.on("SIGINT", () => {
  console.log("\nStopping BrightierOS...");
  try { metrics.stop(); } catch (_) {}
  wss.clients.forEach((c) => c.close());
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 3000);
});

process.on("SIGTERM", () => {
  console.log("Stopping BrightierOS...");
  try { metrics.stop(); } catch (_) {}
  wss.clients.forEach((c) => c.close());
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 3000);
});

app.use(express.json());

// Rotas - arquivos principais
const filesRouter = require("./routes/files");
app.use("/api/files", filesRouter);

// Rotas - core (console, error pages, stats)
const { router: coreRouter, staticMiddleware } = require("./routes/core");
app.use("/", coreRouter);
app.use(staticMiddleware);

// Rotas - plugins e stores
const loadPlugins = require("./routes/plugin");
loadPlugins(app);
const loadStores = require("./routes/store");
loadStores(app);

// Rotas - autenticação e usuários
const userRouter = require("./routes/user");
app.use("/api/users", userRouter);

// Rotas - admin
const adminRouter = require("./routes/admin");
app.use("/api/admin", adminRouter);

// Rotas - métricas, serviços e infraestrutura (v0.8.0)
app.use("/api/metrics", require("./routes/metrics"));
app.use("/api/services", require("./routes/services"));
app.use("/api/infrastructure", require("./routes/infrastructure"));

// Rotas - update
const updateRouter = require("./routes/update");
app.use("/api/update", updateRouter);

// Rotas - trash
const trashRouter = require("./routes/trash");
app.use("/api/files", trashRouter);

// Fallback 404
app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    res.status(404).json({ success: false, error: "Not found" });
  } else {
    res.status(404).sendFile(require("path").join(__dirname, "public", "404.html"));
  }
});

wss.on("connection", (socket, req) => {
  // Bloqueio de segurança: apenas administradores autenticados acessam o terminal.
  if (!terminalAllowed(req)) {
    console.warn("Conexão de terminal recusada: não-admin ou sem token.");
    try { socket.send("Acesso negado: o terminal é restrito a administradores."); } catch (_) {}
    socket.close();
    return;
  }

  console.log("Console connected.");

  const pkg = require("./package.json");
  socket.send(`BrightierOS Console

Version ${pkg.version} Connected to ${os.hostname()}

Type "help" for available commands.`);

  let currentProcess = null;

  socket.on("message", async (message) => {
    const command = message.toString().trim();
    if (!command) return;

    // Interrompe processo atual com Ctrl+C
    if (command === "__INTERRUPT__") {
      if (currentProcess) {
        currentProcess.kill("SIGINT");
        currentProcess = null;
        socket.send("^C\n");
      }
      return;
    }

    const args = command.split(/\s+/);
    const [first] = args;

    switch (first.toLowerCase()) {
      case "help":
        socket.send(`BrightierOS Commands

help about version hostname time stats clear exit

Other commands are executed by the operating system.`);
        return;

      case "about":
        socket.send("BrightierOS\nYour infrastructure. Brighter.");
        return;

      case "version":
        socket.send(`BrightierOS v${require("./package.json").version}`);
        return;

      case "hostname":
        socket.send(os.hostname());
        return;

      case "time":
        socket.send(new Date().toLocaleString("pt-BR"));
        return;

      case "stats": {
        const cpu = await si.currentLoad();
        const mem = await si.mem();
        socket.send(`CPU: ${cpu.currentLoad.toFixed(1)}% RAM: ${((mem.used / mem.total) * 100).toFixed(1)}% Memory: ${(mem.used / 1024 / 1024 / 1024).toFixed(1)}GB / ${(mem.total / 1024 / 1024 / 1024).toFixed(1)}GB`);
        return;
      }

      case "clear":
        socket.send("__CLEAR__");
        return;

      case "exit":
        socket.close();
        return;
    }

    currentProcess = exec(command, (error, stdout, stderr) => {
      currentProcess = null;
      if (error) return socket.send(error.message);
      if (stderr) return socket.send(stderr);
      socket.send(stdout || "Done.");
    });
  });
});

server.on("error", handleStartupError);
wss.on("error", (err) => {
  console.error("WebSocket error (not fatal):", err.message);
});

server.listen(PORT, () => {
  const actualPort = server.address().port;
  console.log(`BrightierOS running at http://localhost:${actualPort}`);
  // v0.8.0: registra o nó local na infraestrutura e inicia o coletor periódico
  // de métricas em background (o histórico passa a ser registrado continuamente).
  try { infrastructure.ensureLocalNode(); } catch (e) { console.warn("[Infra] Falha ao registrar nó local:", e.message); }
  try { metrics.start(); console.log("[Metrics] Coletor periódico de métricas iniciado."); } catch (e) { console.warn("[Metrics] Falha ao iniciar coletor:", e.message); }
});