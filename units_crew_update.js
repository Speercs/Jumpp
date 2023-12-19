'use strict';

require('units_crew_commands');
let Crew = require('units_crew_crew');


function postToGlobal() {
  for (let id in Memory.crews) {
    let mem = Memory.crews[id];

    if (mem.delete) {
      if (global[id] instanceof CrewExecutor) {
        delete global[id];
      }
      delete Memory.crews[id];
    } else if (global[id]) {
      if (!(global[id] instanceof CrewExecutor)) {
        console.log(`Invalid crew ${id} can't be added to global because conflict.`);
      }
    } else {
      global[id] = new CrewExecutor(id);
    }
  }
}

class CrewExecutor {
  constructor(id) {
    this.id = id;
    this.memory = Memory.crews[this.id];
  }

  abort() {
    Memory.crews[this.id].state = Crew.State.ABORT;
    return `Aborting.`;
  }

  debug(value) {
    if (value == undefined) {
      value = true;
    }
    Memory.crews[this.id].debug = value;
    return OK;
  }

  nextRoom(roomName) {
    if (!Memory.rooms[roomName] || Memory.rooms[roomName].role != 'outpost') {
      console.log(`Bad target`);
      return ERR_INVALID_ARGS;
    }
    Memory.crews[this.id].nextRoom = roomName;
    return OK;
  }

  renew() {
    Memory.crews[this.id].state = 'renew';
    return OK;
  }

  target(roomName) {
    if (!Memory.rooms[roomName] || Memory.rooms[roomName].role != 'outpost') {
      console.log(`Bad target`);
      return ERR_INVALID_ARGS;
    }
    Memory.crews[this.id].targetRoom = roomName;
    return OK;
  }

  work() {
    Memory.crews[this.id].state = 'work';
    return OK;
  }
}

function preSpawnUpdate() {
  if (!Memory.crews) {
    Memory.crews = {};
  }

  for (let key in Memory.crews) {
    try {
      Crew.preSpawnUpdate(key);
    } catch (err) {
      console.log(`Crew ${key} preUpdate error: ${err}`);
    }
  }

}

function postSpawnUpdate() {
  for (let key in Memory.crews) {
    try {
      Crew.postSpawnUpdate(key);
    } catch (err) {
      console.log(`Crew ${key} update error: ${err}`);
    }
  }

  postToGlobal();
}

module.exports = {
  preSpawnUpdate,
  postSpawnUpdate,
}