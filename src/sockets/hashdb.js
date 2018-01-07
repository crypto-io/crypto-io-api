const EventEmitter = require('events');
const {join} = require('path');
const {createWriteStream} = require('fs');

class HashDB extends EventEmitter {
  constructor({ipfs, dbHash, dataPath}) {
    super();
    this.dbHash = dbHash;
    this.ipfs = ipfs;
    this.dataPath = dataPath || process.cwd();
  }

  _promiseResolve(hash, set) {
    return this.ipfs.name.resolve(hash).then(({Path}) => {
      if (process.env.DEBUG) {
        console.log('last known hash:', hash);
        console.log('resolved hash:', hash);
      }

      if (set) {
        set = set.map(url => [url, `${Path}/${url}`]);
        return this._get(set)
      } else {
        return Path;
      }
    });
  }

  _get(set) {
    return new Promise((resolve, reject) => {
      async function run(ipfs, dataPath) {
        const map = new Map();
        for (const file of set) {
          const stream = await ipfs.cat(file[1]);
          stream.write = () => stream.pipe(createWriteStream(join(dataPath, file[0])));
          map.set(file[0], stream);
        }
        resolve(map);
      }
      run(this.ipfs, this.dataPath);
    });
  }

  get(set, hash) {
    if (!set) {
      return console.log('nothing to resolve::no file specified');
    }
    hash = hash || this.dbHash;
    if (!Array.isArray(set)) set = [set];
    if (hash) return this._promiseResolve(hash, set);
    else return this._get(set);
  }

  watch(hash) {
    if (this._watching[hash]) reject('already watching')
    else return this._sync(hash);
  }
}

module.exports = HashDB;
