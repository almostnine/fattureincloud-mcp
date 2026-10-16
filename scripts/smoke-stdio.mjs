// Prova di fumo senza dipendenze: avvia il bundle su stdio, fa l'handshake MCP e conta i tool.
// Uso: node scripts/smoke-stdio.mjs [bundle] [modalità] [tool attesi]
import { spawn } from 'node:child_process';

const [bundle = 'dist/index.js', mode = 'readonly', expected = '17'] = process.argv.slice(2);
const child = spawn(process.execPath, [bundle], {
  env: { PATH: process.env.PATH, FIC_MODE: mode },
  stdio: ['pipe', 'pipe', 'inherit'],
});
const send = (msg) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...msg })}\n`);
let buf = '';
const timer = setTimeout(() => {
  console.error('Timeout: nessuna risposta dal server');
  child.kill();
  process.exit(1);
}, 15000);

child.stdout.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i);
    buf = buf.slice(i + 1);
    const msg = JSON.parse(line); // stdout deve contenere solo JSON-RPC
    if (msg.id === 1) {
      send({ method: 'notifications/initialized' });
      send({ id: 2, method: 'tools/list' });
    } else if (msg.id === 2) {
      clearTimeout(timer);
      const n = msg.result.tools.length;
      console.log(`Node ${process.version}, modalità ${mode}: ${n} tool`);
      child.kill();
      process.exit(String(n) === expected ? 0 : 1);
    }
  }
});

send({
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } },
});
