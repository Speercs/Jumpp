'use strict';

const Result = {
  WIN: "win",
  LOSE: "lose",
  DRAW: "draw"
}

function getAttacks(room) {
  let attackEvents = room.hostileAttackEvents;

  let subjects = [];

  _.forEach(attackEvents, function (a) {
      subjects.push(Game.getObjectById(a.objectId));
      subjects.push(Game.getObjectById(a.data.targetId))
  });

  let hostiles = _(subjects).filter('hostile').map('id').value();
  let friendlies = _(subjects).filter(c => !c.hostile).map('id').value();

  return {attackEvents, friendlies, hostiles};
}

const PRUNE_AGE = 150000;
const PRUNE_SIZE = 2;

function pruneIncidents(room) {
  room.memory.fight.lastPrune = Game.time;
  let ageCutoff = Game.time - PRUNE_AGE;
  for (let key in room.memory.fight.incidents) {
    let incident = room.memory.fight.incidents[key];
    if (incident.endTime < ageCutoff || !incident.endTime) {
      delete room.memory.fight.incidents[key];
    }
  }

  while (_.keys(room.memory.fight.incidents).length > PRUNE_SIZE) {
    let keys = _.keys(room.memory.fight.incidents)
    let key = _.min(keys, k => room.memory.fight.incidents[k].endTime);
    delete room.memory.fight.incidents[key];
  }
}

function updateFight(room) {
  let attacks = getAttacks(room);

  let incident = room.memory.fight.incidents[room.memory.fight.currentFight];
  if (!incident) {
    room.logError(`fight.update.updateFight hits bad data. Trying to fix.`);
    delete room.memory.fight.currentFight;
    return;
  }

  if (attacks.attackEvents.length) {
    incident.friendlies = _.union(incident.friendlies, attacks.friendlies);
    incident.hostiles = _.union(incident.hostiles, attacks.hostiles);
  }

  function aliveAndInRoom(id) {
    let object = Game.getObjectById(id);
    return object && object.room.name == room.name;
  }

  let friendliesInRoom = _.any(incident.friendlies, o => aliveAndInRoom(o));
  if (friendliesInRoom) {
    room.logDebug(`Updating lastFriendlySighted.`);
    incident.lastFriendlySighted = Game.time;
  }

  let hostilesInRoom = _.any(incident.hostiles, o => aliveAndInRoom(o));
  if (hostilesInRoom) {
    room.logDebug(`Updating lastHostileSighted.`);
    incident.lastHostileSighted = Game.time;
  }

  if (incident.lastFriendlySighted + 10 >= Game.time &&
    incident.lastHostileSighted + 10 >= Game.time) {
    return;
  }

  let result;

  if (friendliesInRoom) {
    result = Result.WIN;
  } else if (hostilesInRoom) {
    result = Result.LOSE;
  } else {
    result = Result.DRAW;
  }

  incident.endTime = Math.min(incident.lastFriendlySighted, incident.lastHostileSighted);
  incident.result = result;
  delete room.memory.fight.currentFight;
  pruneIncidents(room);
}

function updateIdle(room) {
  let attacks = getAttacks(room);

  if ((room.memory.fight.lastPrune || 0) < Game.time - 1000) {
    pruneIncidents(room);
  }

  if (!attacks.attackEvents.length) {
    return;
  }

  let key = `${room.name}${Game.time}`;
  room.memory.fight.currentFight = key;
  if (!room.memory.fight.incidents) {
    room.memory.fight.incidents = {};
  }

  room.memory.fight.incidents[key] = {
    startTime: Game.time,
    lastFriendlySighted: Game.time,
    lastHostileSighted: Game.time,
    friendlies: attacks.friendlies,
    hostiles: attacks.hostiles
  };
}

function update(room) {
  try {
    if (!room.memory.fight) {
      room.memory.fight = {};
    }

    if (room.memory.fight.currentFight) {
      updateFight(room);
    } else {
      updateIdle(room);
    }
  } catch (err) {
    room.logError(`Error in Fight.update: ${err}`);
  }
}

module.exports = {
  update,
};