'use strict';

let Alert = require('util_alert');
let Corer = require('role_corer');
let SpawnJob = require('util_spawnJob');

const State = {
  BREAK: 'break',
  FINISH: 'finish',
  LOOT: 'loot',
  IGNORE: 'ignore'
};

function updateLesserCore(room) {
  let myCorers = _.filter(room.ownedCreeps, c => c.memory.role == 'corer');
  if (myCorers.length) {
    return;
  }

  let sourceRooms = [room.memory.base];
  let model = 1;

  Corer.requestSpawnRoom(sourceRooms, model, room.name, SpawnJob.PRIORITY_DEFAULT);
}

function initCore(room) {
  if (room.invaderCore.level > 3) {
    // Oh good heavens no.
    return;
  }

  if (!room.sector.canClearCores) {
    return;
  }

  room.logError(`initCore, level-${room.invaderCore.level} core present.`);

  let nearestTerminal = room.invaderCore.pos.findClosestTerminal({minRCL: 8, minLabs:3});
  if (!nearestTerminal) {
    let message = `${room.name} has level-${room.invaderCore.level} core that we can't reach.`;
    let key = room.name + Alert.Key.CANT_REACH_CORE;
    Alert.notify(Alert.Destination.BOTH, key, Alert.Frequency.DAILY, message);
    room.memory.core = {state: State.IGNORE, level: room.invaderCore.level};
    return;
  }

  // Trigger mapping
  room.strongholdExposureToDefendingShootersMap;

  let state = State.BREAK;
  let level = room.invaderCore.level;
  let sourceRoom = nearestTerminal.room.name;

  room.memory.core = {state, level, sourceRoom};
}

function updateEasyCore(room) {
  function setState(state) {
    room.memory.core.state = state;
  }

  function getCorerModelFromRoomState() {
    if (room.invaderCore) {
      return room.memory.core.level + 1;
    } else if (room.nakedInvaders.length) {
      return 21;
    } else {
      return 20;
    }
  }

  function orderCorerIfNoneExist() {
    let myCorers = _.filter(room.ownedCreeps, c => c.memory.role == 'corer');
    if (myCorers.length) {
      return;
    }
  
    let sourceRooms = [room.memory.core.sourceRoom];
    let model = getCorerModelFromRoomState();
  
    room.logDebug(`requesting model-${model} corer from ${sourceRooms}`);
    Corer.requestSpawnRoom(sourceRooms, model, room.name, SpawnJob.PRIORITY_DEFAULT);
  }

  function doEasyCoreBreak() {
    if (!room.invaderCore) {
      return setState(State.FINISH);
    }

    orderCorerIfNoneExist();
  }

  function doEasyCoreFinish() {
    if (_.all(room.containers, 'naked') && !room.nakedInvaders.length) {
      return setState(State.LOOT);
    }

    orderCorerIfNoneExist();
  }

  function doEasyCoreLoot() {
    room.logDebug(`Done clearing core. Ordering looters.`);
    room.memory.loot = {};
    delete room.memory.core;
    return;
  }

  switch (room.memory.core.state) {
    case State.BREAK:
      doEasyCoreBreak();
      break;
    case State.FINISH:
      doEasyCoreFinish()
      break;
    case State.LOOT:
      doEasyCoreLoot();
      break;
    case State.IGNORE:
      if (!room.invaderCore) {
        delete room.memory.core;
      }
      break;
  }
}

function update(room) {
  if (room.invaderCore) {
    room.sector.reportCore(room.invaderCore);
  } else if (room.keeperLairs.length && room.invaderCoreRuin) {
    room.sector.reportCore(room.invaderCoreRuin);
  }

  if (room.invaderCore && room.invaderCore.level == 0) {
    return updateLesserCore(room);
  }

  if (room.invaderCore &&
      room.invaderCore.level &&
      room.invaderCore.invulnerability < 200 &&
      !room.memory.core) {
    initCore(room);
  }

  if (!room.memory.core) {
    return;
  }

  // Deal with the thing.
  if (room.memory.core.level < 5) {
    return updateEasyCore(room);
  }
}

module.exports = {
  update,
}
