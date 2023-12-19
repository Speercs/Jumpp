'use strict';

let Drone = require('role_drone');
let EventLog = require('util_event_log');
let SpawnJob = require('util_spawnJob');

const State = {
  CLAIM: "claim",
  BUILD: "build"
};

function doClaim(room) {
  if (room.controller.my) {
    delete room.memory.claimController;
    delete room.memory.claimerModel;
    delete room.memory.claimerSource;
    room.memory.brick.state = State.BUILD;
    room.logError('Brick: Claimed, switching to BUILD state.')
    return;
  }
}

const DRONE_MODEL = 4;
const WALL_HEIGHT = 16 * 1000 * 1000;

function doBuild(room) {
  let drones = _.filter(
      room.ownedCreeps,
      c => c.memory.role == 'drone' && c.memory.workRoom == room.name);

  if (!drones.length) {
    let result = Drone.requestSpawnRoom(
        [room.memory.sourceRoom],
        DRONE_MODEL,
        room.name,
        SpawnJob.PRIORITY_LOW);
    if (result != OK) {
      room.logError('Failed to spawn Drone:' + result);
    }
  }

  if (room.controller.level < 2) {
    return;
  }

  let walkables = room.walkableTilesNearController();
  if (walkables.length && !room.constructionSites.length) {
    room.logError(`Brick: Building wall at ${walkables[0].link}`);
    walkables[0].createConstructionSite(STRUCTURE_WALL);
  }

  if (walkables.length) {
    return;
  }

  let walls = room.controller.pos.findInRange(room.constructedWalls, 1);

  let weakestWall = _.min(walls, 'hits');

  if (weakestWall.hits > WALL_HEIGHT) {
    if (room.controller.level > 3) {
      room.logError('Brick room has oddly high level. Manual unclaim aborted.');
      return;
    }

    _.forEach(drones, d => d.memory.state = 99);
    room.logError('Done bricking. Unclaimed.');
    Game.notify(`Done bricking ${room.name}.`);
    EventLog.writeEntry(EventLog.DEBUG, room.name, `Done bricking.`);
    delete room.memory.brick;
    room.controller.unclaim();
  }
}

function doInit(room) {
  if (!room.memory.sourceRoom) {
    let nearestBase = room.controller.pos.findClosestTerminal({minRCL: 8}).room;
    room.memory.sourceRoom = nearestBase.name;
  }

  room.memory.claimController = true;
  room.logError('Brick: Initialized, switching to CLAIM state.')
  room.memory.brick.state = State.CLAIM;
  return;
}

function update(room) {
  if (!room.memory.brick) {
    return;
  }

  switch(room.memory.brick.state) {
    case State.CLAIM:
      doClaim(room);
      break;
    case State.BUILD:
      doBuild(room);
      break;
    default:
      doInit(room);
      break;
  }
}

module.exports = {
  update,
}
