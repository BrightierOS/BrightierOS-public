// BrightierOS server.js
// Express, WebSocket and systeminformation server.
const filesRouter = require("./routes/files");

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const si = require('systeminformation');
const { exec } = require('child_process');
const os = require('os');
const users = require('./lib/users');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// O terminal (WebSocket) executa comandos do SO: só administradores autenticados.
function terminalAllowed(req) {
  try {
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token') || '';
    const session = users.sessionFromToken(token);
    return !!session && session.role === 'admin';
  } catch (_) {
    return false;
  }
}

const PORT = Number(process.env.PORT) || 3000;

const handleStartupError = (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Close the other process and try again.`);
  } else {
    console.error(err);
  }

  process.exit(1);
};

process.on('SIGINT', () => {
  console.log('\nStopping BrightierOS...');
  // Fecha todos os WebSockets pra não travar o shutdown
  wss.clients.forEach((client) => client.close());
  server.close(() => process.exit(0));
  // Garantia: se travar, força saída depois de 3s
  setTimeout(() => process.exit(1), 3000);
});

process.on('SIGTERM', () => {
  console.log('Stopping BrightierOS...');
  wss.clients.forEach((client) => client.close());
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 3000);
});

app.use(express.json());

// Defesa em profundidade: a página do terminal só é servida para administradores.
app.get('/console.html', (req, res) => {
  const session = users.sessionFromToken((req.headers['authorization'] || '').replace(/^Bearer\s+/i, '') || (new URL(req.url, 'http://localhost').searchParams.get('token') || ''));
  if (!session || session.role !== 'admin') {
    return res.status(403).send('Acesso negado: o terminal é restrito a administradores.');
  }
  res.sendFile(require('path').join(__dirname, 'public', 'console.html'));
});

app.use(express.static('public'));
app.use("/api/files", filesRouter);
const loadPlugins = require('./routes/plugin');
loadPlugins(app);
// Load user‑generated plugins
const loadStores = require('./routes/store');
loadStores(app);
// Mount user router for authentication and user management
const userRouter = require('./routes/user');
app.use('/api/users', userRouter);

// Mount admin router for system settings and admin audit logs
const adminRouter = require('./routes/admin');
app.use('/api/admin', adminRouter);

// Mount update router for version checking and updates
const updateRouter = require('./routes/update');
app.use('/api/update', updateRouter);


wss.on('connection', (socket, req) => {
  // Bloqueio de segurança: apenas administradores autenticados acessam o terminal.
  if (!terminalAllowed(req)) {
    console.warn('Conexão de terminal recusada: não-admin ou sem token.');
    try { socket.send('Acesso negado: o terminal é restrito a administradores.'); } catch (_) {}
    socket.close();
    return;
  }

  console.log('Console connected.');

  const pkg = require('./package.json');
  socket.send(`BrightierOS Console

Version ${pkg.version} Connected to ${os.hostname()}

Type "help" for available commands.`);

  let currentProcess = null;

  socket.on('message', async (message) => {
    const command = message.toString().trim();
    if (!command) return;

    // Interrompe processo atual com Ctrl+C
    if (command === '__INTERRUPT__') {
      if (currentProcess) {
        currentProcess.kill('SIGINT');
        currentProcess = null;
        socket.send('^C\n');
      }
      return;
    }

    const args = command.split(/\s+/);
    const [first] = args;

    switch (first.toLowerCase()) {
      case 'help':
        socket.send(`BrightierOS Commands

help about version hostname time stats clear exit

Other commands are executed by the operating system.`);
        return;

      case 'about':
        socket.send('BrightierOS\nYour infrastructure. Brighter.');
        return;

      case 'version':
        socket.send(`BrightierOS v${require('./package.json').version}`);
        return;

      case 'hostname':
        socket.send(os.hostname());
        return;

      case 'time':
        socket.send(new Date().toLocaleString('pt-BR'));
        return;

      case 'stats': {
        const cpu = await si.currentLoad();
        const mem = await si.mem();
        socket.send(`CPU: ${cpu.currentLoad.toFixed(1)}% RAM: ${((mem.used / mem.total) * 100).toFixed(1)}% Memory: ${(mem.used / 1024 / 1024 / 1024).toFixed(1)}GB / ${(mem.total / 1024 / 1024 / 1024).toFixed(1)}GB`);
        return;
      }

      case 'clear':
        socket.send('__CLEAR__');
        return;

      case 'exit':
        socket.close();
        return;
    }

    currentProcess = exec(command, (error, stdout, stderr) => {
      currentProcess = null;
      if (error) return socket.send(error.message);
      if (stderr) return socket.send(stderr);
      socket.send(stdout || 'Done.');
    });
  });
});

app.get('/api/stats', async (req, res) => {
  try {
    const [cpuLoad, cpuInfo, mem, graphics, disks] = await Promise.all([
      si.currentLoad(),
      si.cpu(),
      si.mem(),
      si.graphics(),
      si.fsSize(),
    ]);

    res.json({
      time: new Date().toLocaleTimeString('pt-BR'),
      cpu: {
        name: cpuInfo.brand,
        usage: Number(cpuLoad.currentLoad.toFixed(1)),
      },
      ram: {
        usage: Number(((mem.used / mem.total) * 100).toFixed(1)),
        used: (mem.used / 1024 / 1024 / 1024).toFixed(1),
        total: (mem.total / 1024 / 1024 / 1024).toFixed(1),
      },
      gpu: graphics.controllers
        .filter((g) => !g.model.toLowerCase().includes('virtual'))
        .map((g) => ({ name: g.model, usage: Number(g.utilizationGpu || 0) })),
      storage: disks.map((d) => ({
        drive: d.fs,
        usage: Number(((d.used / d.size) * 100).toFixed(1)),
        used: (d.used / 1024 / 1024 / 1024).toFixed(1),
        total: (d.size / 1024 / 1024 / 1024).toFixed(1),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve system information.' });
  }
});

server.on('error', handleStartupError);
wss.on('error', (err) => {
  console.error('WebSocket error (not fatal):', err.message);
});

server.listen(PORT, () => {
  const actualPort = server.address().port;
  console.log(`BrightierOS running at http://localhost:${actualPort}`);
});

// Mount trash router
const trashRouter = require('./routes/trash');
app.use('/api/files', trashRouter);
