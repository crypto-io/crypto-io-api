const {Transform} = require('stream');
const EventEmitter = require('events');
const emitter = new EventEmitter();
const request = require('request');
const clarinet = require('clarinet');
const { createReadStream, createWriteStream, statSync } = require('fs');
const { join } = require('path');
const { direxists, write } = require('crypto-io-utils');
const checkpoints = require('./../../checkpoints.json');
const DB_ID = 'QmRGE6LpXchjcZM5h6grF7cftqPUho5yw5Uya5M8qQF9KG';
const DATA_PATH = join(process.env.APPDATA, 'crypto-io')
let result;
const HashDB = require('./hashdb.js');

class Writer extends Transform {
  constructor() {
    super();
  }
  _transform(chunk, enc, callback) {
    if (!result) {
      result = chunk;
    } else {
      result += chunk;
    }
    callback(null, chunk)
  }
}

class HandleStream extends EventEmitter {
  constructor(socket = false) {
    super();
    const handleStream = clarinet.createStream();
    let isArray = false;
    let objectOpen = false;
    let firstKey = false;
    let object = {};
    let current = null;
    let host = null;

    handleStream.on('value', (value) => {
      // if (firstKey) {
      //   object = {};
      // }
      // TODO: objectDepth & arrayDepth for better parsing
      if (object && host) {
        if (object[host]) {
          object[host][current] = value;
        }
        return;
      }
      if (isArray) {
        const array = object[current];
        if (array && array.indexOf(value) === -1) {
          object[current] = [...array, value];
        } else if (!array) {
          object[current] = [value];
        }
      } else {
        object[current] = value;
      }
    });
    handleStream.on('key', (key) => {
      if (!objectOpen) {
        object = {};
        host = key;
        object[host] = {};
      } else {
        current = key;
      }
      firstKey = false;
    });
    handleStream.on('openobject', (key) => {
      objectOpen = true;
      current = key;
      firstKey = true;
      objectOpen = true;
    });
    handleStream.on('closeobject', (key) => {
      // this.fire('update', object);
      firstKey = false;
      if (objectOpen) { // ensures no duplicates are returned
        if (socket) {
          socket.emit('update', object);
        } else {
          this.emit('object', object);
        }

        // for (const socket of this.peers) {
        // }
        object = {};
      }
      objectOpen = false;
    });
    handleStream.onopenarray = () => {
      if (objectOpen === true) {
        isArray = true;
      }
      // opened an array.
    };
    handleStream.onclosearray = () => {
      if (objectOpen === true) {
        isArray = false;
      }
      // closed an array.
    };
    return handleStream;
  }
}

const inminutes = min => {
  return (Number(min) * 60000)
}

const inhours = hours => {
  return (Number(hours) * 60) * inminutes(1)
}
// TODO: que writes & exit after write only!
class CryptoIoDb extends EventEmitter {
  constructor(ipfs) {
    super();
    this.lastId = checkpoints[0].hash; // retrieve hash from checkpoints
    this.ipfs = ipfs;
    global.db = global.db || new HashDB({ipfs, dbHash: DB_ID, dataPath: join(DATA_PATH, 'db')});
    const db = global.db;
    db.get(['prices.json', 'symbols.json']).then(map => {
      // console.log(map.get('symbols.json').headers['x-content-length'])
      // write file to local disk
      map.forEach(stream => stream.write());
    })
    console.log();
    // this.pricesWriter = new Writer('prices');
    this.pricesStream = new HandleStream();
    this.sync();
  }

  sync() {
    setInterval(() => {
      this.update();
    }, inminutes(1));

    setInterval(() => {
      this.updateSymbols();
    }, inhours(24))
  }

  promiseResolve(id) {
    return this.ipfs.name.resolve(id).then(({Path}) => {
      return Path;
    });
  }

  request(socket) {
    const path = join(process.env.APPDATA, 'crypto-io/db/prices.json');
    socket.emit('syncing');

    async function run(self) {
      async function socketRequest(self, socket) {
        socket = new HandleStream(socket)
        const id = await self.promiseResolve('QmRGE6LpXchjcZM5h6grF7cftqPUho5yw5Uya5M8qQF9KG')
        self.lastId = id;
        await request(`https://ipfs.io/${id}/prices.json`)
          .pipe(socket)
      }
      try {
        statSync(path)
        self.hasFile = true;
        await createReadStream(path).pipe(new HandleStream(socket));
        await socketRequest(self, socket);

      } catch (e) {
        if (process.env.DEBUG) {
          console.log(e);
        }
        if (self.lastId) {
          await request(`https://ipfs.io/${self.lastId}/prices.json`).pipe(new HandleStream(socket))
        }
        await socketRequest(self, socket);
      }

      socket.emit('synced');
    }
    run(this);
  }



  update() {
    console.log('checking for changes');
    console.log('resolving hash');
    async function run(self) {
      const hash = await self.promiseResolve(DB_ID);
      console.log(`last known hash: ${self.lastId}`);
      console.log(`new hash: ${hash}`);
      if (self.lastId !== hash) {
        self.emit('update'); // notify an update is on the way.
        self.lastId = hash;
        await request(`https://ipfs.io/${hash}/prices.json`)
          .pipe(new HandleStream())
          .pipe(createWriteStream(join(DATA_PATH, 'db/prices.json')));
      }
    }
    run(this);
  };

  updateSymbols() {
    console.log('checking for changes');
    console.log('resolving hash');
    async function run(self) {
      const hash = await self.promiseResolve(DB_ID);
      console.log(`last known hash: ${self.lastId}`);
      console.log(`new hash: ${hash}`);
      if (self.lastId !== hash) {
        self.emit('update'); // notify an update is on the way.
        self.lastId = hash;
        await request(`https://ipfs.io/${hash}/prices.json`)
          .pipe(new HandleStream())
          .pipe(createWriteStream(join(DATA_PATH, 'db/prices.json')));
      }
    }
    run(this);
  };
}

module.exports = CryptoIoDb;
