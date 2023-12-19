'use strict';

const PRIORITY_DEFAULT = 128;
const PRIORITY_CRITICAL = 32;
const PRIORITY_HIGH = 64;
const PRIORITY_UNIT = 63;
const PRIORITY_LOW = 256;

function requestSpawn(rooms, body, name, opts, priority) {
  return requestSpawnImpl(rooms, undefined, body, name, opts, priority);
}

function requestSpawnSpawn(rooms, spawns, body, name, opts, priority) {
  return requestSpawnImpl(rooms, spawns, body, name, opts, priority);
}

function requestSpawnImpl(rooms, spawns, body, name, opts, priority) {
  if (!Memory.spawnJobs || Array.isArray(Memory.spawnJobs)) {
    Memory.spawnJobs = {};
    Memory.spawnJobsKey = 0;
  }

  // Fail-safe: If the creep reindex operation has failed, forbid all
  // spawning. Spawner code is probably misbehaving if it's running at all.
  if (!Memory.spawnEnabled) {
    return ERR_TIRED;
  }
  
  if (!rooms.length) {
    return ERR_INVALID_ARGS;
  }
  
  let key = 'Key' + Memory.spawnJobsKey++;
  
  let spawnJob = {
      key: key,
      rooms: rooms,
      spawns: spawns,
      body: body,
      bodyCost: getBodyCost(body),
      name: name,
      opts: opts,
      priority: priority,
  }

  Memory.spawnJobs[key] = spawnJob;

  return OK;
}

module.exports = {
    PRIORITY_DEFAULT,
    PRIORITY_CRITICAL,
    PRIORITY_HIGH,
    PRIORITY_UNIT,
    PRIORITY_LOW,
    requestSpawn,
    requestSpawnSpawn,
}
