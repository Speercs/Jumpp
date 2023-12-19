'use strict';

const State = {
  INIT: 'init',
  LURK: 'lurk',
  SUCCESS: 'success',
  FAILED: 'failed',
};

function update(room) {
  let mem = room.memory.destroy;
  let repeat = false;
  let maxRepeat = 2;

  if (!mem) return;

  function setState(newState) {
    mem._state = newState;
    repeat = true;
  }

  function logError(message) {
    room.logError(`Destroy: ${message}`);
  }

  function doInit() {
    if (!mem._sourceRoom) {
      logError(`Looking for source room`);
      let terminal = room.controller.pos.findClosestTerminal({minRCL:8, minLabs:3});
      if (!terminal) {
        logError('FAIL. Failed to find sourceRoom.');
        mem._failCause = 'findClosestTerminal failed';
        setState(State.FAILED);
        repeat = false;
        return;
      }

      mem._sourceRoom = terminal.room.name;
      logError(`Using ${terminal.room.link} as sourceRoom.`)
    }

    logError(`Done initializing.`);
    setState(State.LURK);
  }

  const LAUNCH_PERIOD = 2000;

  function doLurk() {
    if (!room.memory.reduce &&
        !room.spawns.length &&
        !room.towers.length &&
        !room.memory.noReduce) {
      room.memory.reduce = {};
      room.logError(`Room likely auto-broken. Reducing.`);
    }

    if (!room.controller.level) {
      logError(`SUCCEEDED. Room destroyed.`);
      Game.notify(`Room ${room.name} successfully auto-destroyed.`);
      room.memory.reduce = {};
      delete room.memory.destroy;
      return;
    }

    if (mem._lastLaunch + LAUNCH_PERIOD > Game.time) return;

    if (room.controller.safeMode > 100) return;

    if (room.towers.length > 3) {
      logError(`Too hard a target for auto-destroy. Aborting.`);
      setState(State.FAILED);
      mem._failCause = 'too hard';
      return;
    }

    if (!room.towers.length && !room.spawns.length && !room.extensions.length) {
      // Sit tight. No need to launch.
      return;
    }

    if (room.towers.length < 2) {
      logError(`Attempting to launch 'oneTower' worm.`);
      mem._lastLaunch = Game.time;
      let result = Game.rooms[mem._sourceRoom].launchWorm(room.name, {config: 'oneTower'});
      logError(result);
      return;
    }

    if (room.towers.length < 4) {
      logError(`Attempting to launch 'hitter' worm.`);
      mem._lastLaunch = Game.time;
      let result = Game.rooms[mem._sourceRoom].launchWorm(room.name, {config: 'hitter'});
      logError(result);
      return;
    }
  }

  do {
    switch (mem._state) {
      case State.LURK:
        doLurk();
        break;
      case State.INIT:
        doInit();
        break;
      case State.FAILED:
        break;
      case State.SUCCESS:
        break;
      default:
        setState(State.INIT);
        break;
    }
    maxRepeat--;
  } while (repeat && maxRepeat);
}

function shouldDestroy(room) {
  if (room.controller && room.controller.level > 5) return false;

  if (!room.spawns.length) return false;

  if (!room.controller || !room.controller.level) return false;

  if (isFriendly(room.controller.owner.username)) return false;

  if (NEIGHBORS.includes(room.controller.owner.username)) return false;

  if (room.memory.destroy) return false;

  if (room.memory.allow) return false;

  return room.newHostileBasesForbidden();
}

module.exports = {
  shouldDestroy,
  update,
};