'use strict';

let Alert = require('util_alert');
let Nav = require('util_nav');
let Observe = require('util_observe');

const CoreState = {
  UNKNOWN: 'unknown',
  ALIVE: 'alive',
  DEAD: 'dead',
}

class Sector {
  constructor(roomName) {
      let sectorName = Nav.getSectorCenter(roomName);

      if (!sectorName) {
        throw `invalid roomName`;
      }

      if (!Memory.sectors) {
        Memory.sectors = {};
      }

      if (!Game.sectors) {
        Game.sectors = {};
      }

      if (!Memory.sectors[sectorName]) {
        Memory.sectors[sectorName] = {};
      }

      if (!Game.sectors[sectorName]) {
        Game.sectors[sectorName] = this;
      }

      this.name = sectorName;
      this.memory = Memory.sectors[sectorName];
  };

  update() {
    if (this.lastUpdate == Game.time) {
      return;
    }

    this.lastUpdate = Game.time;
    let hash1024 = this.name.hashCode() & 1023;

    if (this.memory.canClearCores === undefined && hash1024 == 100) {
      console.log(`Sector ${roomNameLink(this.name)} needs canClearCores explicitly set.`);
    }

    if (hash1024 == 200 && this.canClearCores) {
      checkCenterNineActive(this.name);
    }

    if (hash1024 == 300 && this.myBases.length > 1) {
      checkEntireSectorScans(this.name);
    }

    updatePortals(this.name);
  }

  reportCore(core) {
    if (core instanceof StructureInvaderCore) {
      if (core.level == 0) {
        // Not interested in zeros.
        return;
      }
      let state = CoreState.ALIVE;
      let expiry = Game.time + core.collapseTicksRemaining;
      let pos = core.pos;
      let level = core.level;
      this.memory.core = {state, pos, level, expiry};
    } else if (core instanceof Ruin) {
      let state = CoreState.DEAD;
      let expiry = Game.time + core.ticksToDecay;
      let pos = core.pos;
      let level = (this.memory.core && this.memory.core.level) || `unknown`;
      this.memory.core = {state, pos, level, expiry};
    }
  }
}

function checkCenterNineActive(sectorName) {
  let xy = Nav.roomNameToXY(sectorName);
  let cx = xy[0], cy = xy[1];

  console.log(`Checking center nine in sector ${sectorName}`);

  for (let y = cy - 1; y <= cy + 1; y++) {
    for (let x = cx - 1; x <= cx + 1; x++) {
      let roomName = Nav.getRoomNameFromXY(x, y);
      if (!Memory.rooms[roomName]) {
        console.log(`Activating room ${roomName} in sector ${sectorName}`);
        let role = roomName.isSectorCenter() ? 'center' : 'skLair';
        Memory.rooms[roomName] = {role};
      }
    }
  }
}

function checkEntireSectorScans(sectorName) {
  let xy = Nav.roomNameToXY(sectorName);
  let cx = xy[0], cy = xy[1];

  for (let y = cy - 4; y <= cy + 4; y++) {
    for (let x = cx - 4; x <= cx + 4; x++) {
      let roomName = Nav.getRoomNameFromXY(x, y);

      if (roomName.isCenterNine()) {
        continue;
      }

      if (!Memory.rooms[roomName]) {
        console.log(`Enabling scans on room ${roomName} in sector ${sectorName}`);
        Memory.rooms[roomName] = {role:'wilderness', execute:false, _nextScan: 1};
      } else if (!(Memory.rooms[roomName]._nextScan < Game.time + 1000)) {
        console.log(`Room ${roomName} doesn't get scanned enough.`);
        Observe.setNextScan(roomName, 1);
      }
    }
  }
}

function updatePortals(sectorName) {
  let centerRoom = Game.rooms[sectorName];

  if (!centerRoom) {
    return;
  }

  let mem = Memory.sectors[sectorName];
  let portal = centerRoom.portals[0];

  if (mem.portals) {
    if (portal) {
      if (!_.isFinite(mem.portals.expiry) && _.isFinite(portal.ticksToDecay)) {
        let key = sectorName + Alert.Key.PORTALS_DECAYING;
        let message = `Portals from sector ${sectorName} to sector ${portal.destination.roomName}` +
            ` have begun decaying, and expire in ${portal.ticksToDecay} ticks.`;
        Alert.notify(Alert.Destination.BOTH, key, Alert.Frequency.DAILY, message);

        mem.portals.expiry = Game.time + portal.ticksToDecay;
      }
    } else {
      let key = sectorName + Alert.Key.PORTALS_DECAYED;
      let message = `Portals from sector ${sectorName} to sector ${mem.portals.destination} have ` +
          `decayed.`;
      Alert.notify(Alert.Destination.BOTH, key, Alert.Frequency.DAILY, message);

      delete mem.portals;
    }
  } else if (!mem.portals && portal) {
    let key = sectorName + Alert.Key.NEW_PORTALS;
    let message = `Portals from sector ${sectorName} to sector ${portal.destination.roomName}` + 
        ` have appeared.`;
    Alert.notify(Alert.Destination.BOTH, key, Alert.Frequency.DAILY, message);

    mem.portals = {
        destination: portal.destination.roomName,
        expiry: Game.time + portal.ticksToDecay};
  }
}

Object.defineProperty(Sector.prototype, 'myBases', {
  get: function() {
    if (this._myBases) {
      return this._myBases;
    }

    return this._myBases = _.filter(Game.bases, b => b.sector == this);
  },
  set: function() {},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Sector.prototype, 'invaderCoreState', {
  get: function() {
    return (this.memory.core && this.memory.core.state) || CoreState.UNKNOWN;
  },
  set: function() {},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Sector.prototype, 'invaderCoreLevel', {
  get: function() {
    return (this.memory.core && this.memory.core.level);
  },
  set: function() {},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Sector.prototype, 'invaderCorePosition', {
  get: function() {
    if (this.memory.core && this.memory.core.pos) {
      return new RoomPosition(
        this.memory.core.pos.x,
        this.memory.core.pos.y,
        this.memory.core.pos.roomName);
    }
  },
  set: function() {},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Sector.prototype, 'coreExpiry', {
  get: function() {
    return this.memory.core && this.memory.core.expiry;
  },
  set: function() {},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Sector.prototype, 'canClearCores', {
  get: function() {
    return this.memory.canClearCores;
  },
  set: function() {},
  enumerable: false,
  configurable: true,
});


global.Sector = Sector;

module.exports = {
  CoreState
}