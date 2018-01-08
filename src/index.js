const api = require('express')();
const server = require('http').Server(api);
const io = require('socket.io')(server);
const CryptoDaemon = require('crypto-daemon');
const CryptoIoDb = require('./sockets/db');
const daemon = new CryptoDaemon();
api.set('port', (process.env.PORT || 6060));

const ready = () => {
  const IPFS = require('ipfs-api');

  const ipfs = new IPFS({
    PeerID: Math.random(),
    EXPERIMENTAL: {
      pubsub: true,
    },
  });

  const db = new CryptoIoDb(ipfs);

  io.on('connection', socket => {
    // connections.push(socket.id);
    socket.emit('announce', 'syncing-db');
    socket.on('disconnect', () => {
      // const index = connections.indexOf(socket.id);
      // console.log(index);
      // connections.splice(index, 1);
      // db.remove(socket.id);
    });
    db.on('update', data => {
      io.emit('announce', 'syncing-db');
    });

    db.on('item', data => {
      io.emit('update', data);
    });

    db.request(socket);
  });
}

daemon.on('ready', () => ready());

daemon.start().catch(error => {
  ready();
});

server.listen(api.get('port'), () => {
  console.log('Crypto-io api is running on port', api.get('port'));
});
