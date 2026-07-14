// BrightierOS server.js
// Express, WebSocket and systeminformation server.
const filesRouter = require("./routes/files");
const userRouter = require("./routes/user");
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const si = require('systeminformation');
const { exec } = require('child_process');
const os = require('os');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

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
  console.log('Stopping BrightierOS...');
  server.close(() => process.exit(0));
});

process.on('SIGTERM', () => {
  console.log('Stopping BrightierOS...');
  server.close(() => process.exit(0));
});

app.use(express.json());
app.use(express.static('public'));
app.use("/api/files", filesRouter);
app.use("/api/users", userRouter);
// Load user‑generated plugins
const loadStores = require('./routes/store');
loadStores(app);


wss.on('connection', (socket) => {
  console.log('Console connected.');

  socket.send(`BrightierOS Console

Version 0.0.1-dev Connected to ${os.hostname()}

Type "help" for available commands.`);

  socket.on('message', async (message) => {
    const command = message.toString().trim();
    if (!command) return;

    const args = command.split(/\s+/);
    const [first] = args;

    switch (first.toLowerCase()) {
      case 'help':
        socket.send(`BrightierOS Commands

help about version hostname time stats clear exit

Other commands are executed by Windows.`);
        return;

      case 'about':
        socket.send('BrightierOS\nYour infrastructure. Brighter.');
        return;

      case 'version':
        socket.send('BrightierOS v0.0.1-dev');
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

    exec(command, (error, stdout, stderr) => {
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
wss.on('error', handleStartupError);

server.listen(PORT, () => {
  const actualPort = server.address().port;
  console.log(`BrightierOS running at http://localhost:${actualPort}`);
});
