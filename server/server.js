// Plearn Town – tiny real-time relay server
// Every player sends its "presence" (name, look, position, game state…).
// The server keeps the latest presence of everybody in the same room and, 10 times a second,
// sends each player only what changed. No database, nothing is stored on disk.
const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const MAX_PER_ROOM = 60;          // players in one room
const MAX_MSG = 4096;             // bytes per message
const MAX_RATE = 30;              // messages per second per player
const TICK_MS = 100;              // 10 updates a second

const rooms = new Map();          // room name -> { clients:Set, pres:Map(id->obj), sent:Map(id->json per field) }

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  let players = 0; for (const r of rooms.values()) players += r.clients.size;
  res.end(`Plearn Town server is awake. Players online: ${players}\n`);
});

const wss = new WebSocketServer({ server, maxPayload: MAX_MSG, perMessageDeflate: { threshold: 256 } });

const cleanRoom = s => (String(s || 'main').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24)) || 'main';
const newId = () => 'p' + Math.random().toString(36).slice(2, 10);

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://x');
  const roomName = cleanRoom(url.searchParams.get('room'));
  let room = rooms.get(roomName);
  if (!room) { room = { clients: new Set(), pres: new Map(), sent: new Map(), gone: new Set() }; rooms.set(roomName, room); }
  if (room.clients.size >= MAX_PER_ROOM) { ws.send(JSON.stringify({ t: 'full' })); ws.close(); return; }

  ws.id = newId(); ws.room = room; ws.alive = true; ws.count = 0; ws.countT = Date.now();
  room.clients.add(ws);
  // hello: your id + everybody already here
  ws.send(JSON.stringify({ t: 'hi', id: ws.id, peers: [...room.pres].map(([id, pr]) => ({ id, pr })) }));

  ws.on('pong', () => { ws.alive = true; });
  ws.on('message', data => {
    ws.alive = true;
    const now = Date.now();
    if (now - ws.countT > 1000) { ws.countT = now; ws.count = 0; }
    if (++ws.count > MAX_RATE) return;                 // too fast: ignore
    let m; try { m = JSON.parse(data); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    if (m.t === 'p' && m.pr && typeof m.pr === 'object' && !Array.isArray(m.pr)) room.pres.set(ws.id, m.pr);
    // m.t === 'k' is a keep-alive, nothing to do
  });
  ws.on('close', () => {
    room.clients.delete(ws); room.pres.delete(ws.id); room.sent.delete(ws.id); room.gone.add(ws.id);
  });
});

// send only what changed since last time (field by field), 10 times a second
setInterval(() => {
  for (const [name, room] of rooms) {
    if (room.clients.size === 0 && room.gone.size === 0) { rooms.delete(name); continue; }
    const changed = {};
    let any = false;
    for (const [id, pr] of room.pres) {
      let last = room.sent.get(id); if (!last) { last = {}; room.sent.set(id, last); }
      let diff = null;
      for (const k of Object.keys(pr)) {
        const js = JSON.stringify(pr[k]);
        if (last[k] !== js) { (diff = diff || {})[k] = pr[k]; last[k] = js; }
      }
      for (const k of Object.keys(last)) if (!(k in pr)) { (diff = diff || {})[k] = null; delete last[k]; }
      if (diff) { changed[id] = diff; any = true; }
    }
    const removed = [...room.gone]; room.gone.clear();
    if (!any && !removed.length) continue;
    const msg = JSON.stringify({ t: 'd', c: changed, r: removed });
    for (const c of room.clients) if (c.readyState === 1) c.send(msg);
  }
}, TICK_MS);

// drop players whose connection died
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false; try { ws.ping(); } catch (e) {}
  }
}, 25000);

server.listen(PORT, () => console.log('Plearn Town server on port ' + PORT));
