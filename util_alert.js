'use strict';

const Destination = {
  CONSOLE: 0,
  EMAIL: 1,
  BOTH: 2,
};

const Frequency = {
  DAILY: Math.floor(24 * 3600 / 3.4),
  HOURLY: Math.floor(3600 / 3.4),
  SPAM: 0
};

const Key = {
  // Base monitoring
  STORAGE_FULL: 0,
  TERMINAL_DISRUPTED: 1,
  SPAWN_DISRUPTED: 2,
  SPAWN_JAMMED: 3,
  POWER_CREEP_DEAD: 4,
  POWER_CREEP_SPAWNED: 5,

  // Resource gathering
  UNUSED_DEPOSIT: 10,
  WORKING_DEPOSIT: 11,

  // Misc debug
  CRANE_OUT_OF_POSITION: 20,
  CIVILIANS_ATTACKED: 21,
  RCL0_ATTACK_CONTROLLER: 22,
  INCOMING_NUKE: 23,
  CANT_REACH_CORE: 24,
  SHARDERS_WITHOUT_SEND: 25,
  NO_TUG: 26,
  POWER_CREEP_BLOCKED: 27,
  LONGAGO_NEXT_SCAN: 28,
  TOWER_DEFENSE: 29,
  BOOST_MINER: 30,

  // Sector stuff
  NEW_PORTALS: 50,
  PORTALS_DECAYING: 51,
  PORTALS_DECAYED: 52,
  NEWBIE_ZONE: 53,
  
  // Scouting
  LESS_WORK_SPACE: 60,
}

let nextCleanup = 0;

function cleanup() {
  if (nextCleanup > Game.time) {
    return;
  }

  Memory._blockedMessageKeys = _.pick(Memory._blockedMessageKeys, v => v > Game.time);
  nextCleanup = Game.time + 500;
}

function notify(destination, key, timeout, message) {
  if (!Memory._blockedMessageKeys) {
    Memory._blockedMessageKeys = {};
  }

  cleanup();

  if (Memory._blockedMessageKeys[key] > Game.time) {
    return OK;
  }

  Memory._blockedMessageKeys[key] = Game.time + timeout;

  if ([Destination.CONSOLE, Destination.BOTH].includes(destination)) {
    console.log(message);
  }

  if ([Destination.EMAIL, Destination.BOTH].includes(destination)) {
    Game.notify(message);
  }

  return OK;
}

module.exports = {
  Destination,
  Frequency,
  Key,

  notify,
}