'use strict';

let Alert = require('util_alert');

const DAILY = Math.floor(24 * 3600 / 3.4);

function update(room) {
  checkStorage(room);

  checkTerminal(room);

  //checkExtensions(room);

  checkSpawns(room);
}

function checkStorage(room) {
  if (!room.hashTime(50) || !room.activeStorage || !room.storage.my) {
    return;
  }

  let free = room.storage.store.getFreeCapacity();
  let total = room.storage.store.getCapacity();

  if (free < total / 20) {
    let message = `${room.link} has low storage space available (${free})`;
    let key = room.name + Alert.Key.STORAGE_FULL;
    Alert.notify(Alert.Destination.BOTH, key, DAILY, message);
  }

  if (!room.isVault) {
    let totalStuff = room.storage.store.getUsedCapacity();
    let stuffOtherThanEnergy = totalStuff - room.storage.store[RESOURCE_ENERGY];

    if (stuffOtherThanEnergy > 350000) {
      let message = `${room.link} storage has too much not-energy`;
      let key = room.name + Alert.Key.STORAGE_FULL;
      Alert.notify(Alert.Destination.BOTH, key, DAILY, message);
    }
  }
}

function checkTerminal(room) {
  if (!room.activeTerminal || !room.terminal.my) {
    return;
  }

  if (room.terminal.disruptTicksRemaining) {
    let message = `${room.link} terminal is disrupted`;
    let key = room.name + Alert.Key.TERMINAL_DISRUPTED;
    Alert.notify(Alert.Destination.BOTH, key, DAILY, message);
  }
}

function checkSpawns(room) {
  for (let spawn of room.spawns) {
    if (spawn.my && spawn.active) {
      checkSpawn(spawn);
    }
  }
}

let spawningCreeps = {};

function checkSpawn(spawn) {
  if (spawn.disruptTicksRemaining) {
    let message = `spawn ${spawn.name} is disrupted`;
    let key = room.name + Alert.Key.SPAWN_DISRUPTED;
    Alert.notify(Alert.Destination.BOTH, key, DAILY, message);
  }

  let mem = Memory.spawns[spawn.name];
  if (Game.time % 10000 == 0) {
    mem._util10k = mem._utilCurrent;
    mem._utilCurrent =  0;
  }

  mem._utilCurrent = mem._utilCurrent || 0;
  if (spawn.spawning) {
    mem._utilCurrent += 1;
    if (spawningCreeps[spawn.name] && spawningCreeps[spawn.name].name == spawn.spawning.name) {
      if (Game.time - spawningCreeps[spawn.name].timestamp > 350) {
        let message = `${spawn.room.link} spawn ${spawn.name} is jammed`;
        let key = spawn.name + Alert.Key.SPAWN_JAMMED;
        Alert.notify(Alert.Destination.BOTH, key, Alert.Frequency.HOURLY, message);
        spawn.spawning.cancel();
      }
    } else {
      spawningCreeps[spawn.name] = {
        name: spawn.spawning.name,
        timestamp: Game.time
      };
    }
    
  } else {
    delete spawningCreeps[spawn.name];
  }
}

module.exports = {
  update,
};