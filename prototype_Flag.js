'use strict';

let Ram = require('flag_role_ram');
let Spawner = require('flag_role_spawner');


Flag.prototype.execute = function () {
  if (this.memory.execute && this.memory.ttl > 0) {
    this.memory.ttl -= 1;
    
    if (this.memory.ttl == 0) {
      this.memory.execute = false;
    }
  }

  switch (this.memory.role) {
    case 'ram':
      Ram.run(this);
      break;
    case 'spawner':
      Spawner.run(this);
      break;
    default:
      flag.logError('Unknown role.');
      break;
  }
}

Flag.prototype.init = function() {
  delete this.memory.init;
  
  if (this.name.startsWith('Wrecker')) {
    this.memory = {
        execute: false,
        role: 'spawner',
        wrecker: {
            sourceRooms: [],
            count: 1
        }
    }
  }

  if (this.name.startsWith('Drone')) {
    this.memory = {
        execute: false,
        role: 'spawner',
        drone: {
            sourceRooms: [],
            count: 1
        }
    }
  }

  if (this.name.startsWith('Defense')) {
    this.memory = {
        execute: false,
        role: 'spawner',
        sourceRooms: [],
        guardian: {}
    }
  }

  if (this.name.startsWith('Occupy')) {
    this.memory = {
        execute: false,
        role: 'spawner',
        sourceRooms: [],
        guardian: {
            model: 2
        }
    }
  }
}

Flag.prototype.census = function() {
  let result = 'Name                Position       TTL\n';
  _.values(this.creeps).forEach(c => {
      result += _.padRight(c.name, 20);
      result += _.padLeft(`<a href = '${roomURL(c.pos.roomName)}'>${c.pos.roomName}</a>`, 8);
      result += _.padLeft(c.pos.x + ',' + c.pos.y, 6);
      result += _.padLeft(' ' + c.totalTicksToLive, 6);
      result += '\n';
  });
  return result;
}

Flag.prototype.logDebug = function (message) {
  if (this.memory.debug) {
    console.log(this.name + ': ' + message);
  }
}

Flag.prototype.logError = function (message) {
  console.log(this.name + ': ' + message);
}

Object.defineProperty(Flag.prototype, 'naked', {
  get: function() {
    if (this._naked) {
      return this._naked;
    } else {
      return this._naked = !this.pos.hasRampart();
    }
  },
  set: function() {},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Flag.prototype, 'worldPos', {
  get: function() {
    if (this._worldPos) {
      return this._worldPos;
    } else {
      return this._worldPos = WorldPosition.fromRoomPosition(this.pos);
    }
  },
  set: function() {},
  enumerable: false,
  configurable: true,
});

