'use strict';

let Alert = require('util_alert');
let Sharder = require('role_sharder');
let SpawnJob = require('util_spawnJob');
 

const SHARDER_MODEL = 1;

function update(room) {
  let mem = room.memory.sharders;

  if (!mem ||
      !mem.period ||
      !room.terminal ||
      !room.terminal.active ||
      !room.terminal.my) {
    return;
  }

  if (mem._lastSpawn && mem._lastSpawn.spawnTime + mem.period > Game.time) {
    return;
  }

  if (!mem.send || !mem.send.length) {
    let message = `${room.link} has sharders with no stuff to send`;
    let key = room.name + Alert.Key.SHARDERS_WITHOUT_SEND;
    Alert.notify(Alert.Destination.BOTH, key, DAILY, message);
    return;
  }

  if(numCreepsInTransit() > 12) {
    // Must be one of those transit delays. Wait. We don't want twenty guys emerging at once.
    return;
  }

  let priority = mem.priority || SpawnJob.PRIORITY_DEFAULT;

  try {
    if (Sharder.requestSpawn(
        [room.name],
        SHARDER_MODEL,
        room.name,
        priority) != OK) {
      room.logError(`Failed to queue sharder.`);
    }
  } catch (err) {
    room.logError(`Exception in Sharder.requestSpawn: ${err}`);
  }
}

function numCreepsInTransit() {
  if (!Memory.shardLocal || !Memory.shardLocal.departures) {
    return 0;
  }

  return _.sum(Memory.shardLocal.departures, o => _.keys(o).length);
}

module.exports = {
  update,
}
