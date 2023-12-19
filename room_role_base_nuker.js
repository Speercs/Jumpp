'use strict';

function update(room) {
  if (!room.memory.nuker) {
    return;
  }

  if (!room.nuker) {
    delete room.memory.nuker;
    return;
  }

  if (!room.memory.nuker.launches) {
    room.memory.nuker.launches = [];
    room.logError(`Initializing nuker.launches`);
  }

  if (!room.memory.nuker.launches.length) {
    return;
  }

  let nextLaunch = room.memory.nuker.launches[0];

  let targetPos = new RoomPosition(
    nextLaunch.target.x,
    nextLaunch.target.y,
    nextLaunch.target.roomName);

  let ticksUntilLaunch = nextLaunch.launchTime - Game.time;

  if (ticksUntilLaunch > 1000) {
    if (ticksUntilLaunch % 1000 == 0) {
      room.logError(`Next launch in ${ticksUntilLaunch} ticks, target = ${targetPos}`);
    }
  } else if (ticksUntilLaunch > 100) {
    if (ticksUntilLaunch % 100 == 0) {
      room.logError(`Next launch in ${ticksUntilLaunch} ticks, target = ${targetPos}`);
    }
  } else if (ticksUntilLaunch > 10) {
    if (ticksUntilLaunch % 10 == 0) {
      room.logError(`Next launch in ${ticksUntilLaunch} ticks, target = ${targetPos}`);
    }
  }

  if (ticksUntilLaunch > 0) {
    return;
  }

  room.nuker.launchNuke(targetPos);
  room.memory.nuker.launches = _.rest(room.memory.nuker.launches);
}

module.exports = {
  update
}
  