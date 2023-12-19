'use strict';

require('units_worm_commands');

let Otacon = require('units_worm_otacon');
let Worm = require('units_worm_worm');

function postToGlobal() {
  for (let id in Memory.worms) {
    let mem = Memory.worms[id];

    if (mem.delete) {
      if (global[id] instanceof WormExecutor) {
        delete global[id];
      }
      delete Memory.worms[id];
    } else if (global[id]) {
      if (!(global[id] instanceof WormExecutor)) {
        console.log(`Invalid worm ${id} can't be added to global because conflict.`);
      }
    } else {
      global[id] = new WormExecutor(id);
    }
  }
}

function drawStuff() {
  for (let id in Memory.worms) {
    let mem = Memory.worms[id];
    let target = Memory.otacon &&
        Memory.otacon[mem.targetRoom] &&
        Memory.otacon[mem.targetRoom].targets &&
        Memory.otacon[mem.targetRoom].targets[id];
    if (target && target.roomName) {
      let visual = new RoomVisual(mem.targetRoom);
      visual.text(
          `${_.trimLeft(id, 'worm')}`,
          target.x, target.y + 0.25,
          {color:'yellow'});
    }
    let headCreep = Game.getObjectById(mem.creeps[0]);
    if (headCreep &&
        headCreep.pos &&
        target &&
        target.roomName &&
        !headCreep.pos.isEqualTo(target)) {
      let head = headCreep.pos;
      let visual = new RoomVisual(head.roomName);
      visual.text(`${_.trimLeft(id, 'worm')}`, head.x, head.y + 0.25, {color:'yellow'});
    }
  }
}

class WormExecutor {
  constructor(id) {
    this.id = id;
  }

  abort() {
    Memory.worms[this.id].state = Worm.State.ABORT;
    return `Aborting.`;
  }

  debug(value) {
    if (value == undefined) {
      value = true;
    }
    Memory.worms[this.id].debug = value;
    return OK;
  }

  move(direction) {
    _(this.elements).forEach(e => e.move(direction)).value();
  }
}

Object.defineProperty(WormExecutor.prototype, 'elements', {
  get: function() {
    if (this._elements != undefined) {
      return this._elements;
    }

    return this._elements = (Game.units[this.id] && Game.units[this.id].elements) || [];
  },
  set: function() {},
  enumerable: false,
  configurable: true,
});


function updateAll() {
  if (!Memory.worms) {
    Memory.worms = {};
  }

  for (let key in Memory.worms) {
    try {
      Worm.preUpdate(key);
    } catch (err) {
      console.log(`Worm ${key} preUpdate error: ${err}`);
    }
  }

  try {
    Otacon.update();
  } catch (err) {
    console.log(`Otacon.update error: ${err}`);
  }

  for (let key in Memory.worms) {
    try {
      Worm.update(key);
    } catch (err) {
      console.log(`Worm ${key} update error: ${err}`);
    }
  }

  try {
    drawStuff();
  } catch (err) {
    console.log(`Worm drawStuff error: ${err}`);
  }

  postToGlobal();
}

module.exports = {
  updateAll
}
