'use strict';

let SpawnJob = require('util_spawnJob');
let Upgrader = require('role_upgrader');

function update(room) {
    if (!room.my ||
        room.spawns.length == 0 ||
        room.energyAvailable < 200 ||
        room.controller.upgradeBlocked) {
      return;
    }
  
    let myActiveSpawns = _.filter(room.spawns, s => s.my && s.active);
  
    if (myActiveSpawns.length != 1) return;
  
    let spawn = myActiveSpawns[0];
  
    if (spawn.spawning) return;
  
    if (room.controller.ticksToDowngrade > 5000 &&
        (room.controller.maxTicksToDowngrade - room.controller.ticksToDowngrade < 15000)) {
      return;
    }
  
    let myUpgraders = _.filter(room.myCreeps, c => c.memory.role == 'upgrader' && c.memory.model == 100);
    if (myUpgraders.length) return;
  
    room.logDebug(`I think I should spawn a model-100 upgrader.`);
    if (Upgrader.requestSpawn(room, 100, room, SpawnJob.PRIORITY_LOW) != OK) {
      room.logError('Failed to order Upgrader.');
    }
  }
  
  module.exports = {
    update,
  }
  