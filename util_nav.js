'use strict';

let RoomCallback = require('util_roomCallback');


function roomNameToXY(name) {
  if (!name) {
    throw new Error().stack;
  }
  name = name.toUpperCase();

  let match = name.match(/^(\w)(\d+)(\w)(\d+)$/);
  if(!match) {
    return [undefined, undefined];
  }
  let [,hor,x,ver,y] = match;

  if(hor == 'W') {
    x = -x-1;
  }
  else {
    x = +x;
  }
  if(ver == 'N') {
    y = -y-1;
  }
  else {
    y = +y;
  }
  return [x, y];
};

function getRoomNameFromXY(x, y) {
  if(x < 0) {
    x = 'W'+(-x-1);
  }
  else {
    x = 'E'+(x);
  }
  if(y < 0) {
    y = 'N'+(-y-1);
  }
  else {
    y = 'S'+(y);
  }
  return ""+x+y;
};

function getNearestIntersection(roomName) {
  let match = roomName.match(/^(\w)(\d+)(\w)(\d+)$/);

  if (match) {
    let horz = _.round(match[2], -1);
    let vert = _.round(match[4], -1);
    return `${match[1]}${horz}${match[3]}${vert}`;
  }
}

function getSectorCenter(roomName) {
  let match = roomName.match(/^(\w)(\d+)(\w)(\d+)$/);

  if (match && match[2] % 10 && match[4] % 10) {
    let horz = _.floor(match[2], -1) + 5;
    let vert = _.floor(match[4], -1) + 5;
    return `${match[1]}${horz}${match[3]}${vert}`;
  }
}

function getRoomDistanceManhattan(a, b) {
  if (!a || !b) return NaN;

  let xya = roomNameToXY(a);
  let xyb = roomNameToXY(b);

  return Math.abs(xya[0] - xyb[0]) + Math.abs(xya[1] - xyb[1]);
}

function getNearestBaseManhattan(roomName) {
  return _.min(Game.bases, b => getRoomDistanceManhattan(roomName, b.name));
}

function findCentermostOpenSquare(roomName, side) {
  let terrain = Game.map.getRoomTerrain(roomName);

  if (!terrain) {
    console.log(`Error: Invalid room name.`)
    return ERR_INVALID_ARGS;
  }

  if (side < 1 || (side & 1 != 1)) {
    console.log(`Error: side must be a positive odd number`);
    return ERR_INVALID_ARGS;
  }

  function checkRegionWithCenter(cx, cy) {
    let min = (1 - side) / 2;
    let max = min + side;
    for (let x = cx + min; x < cx + max; x++) {
      for (let y = cy + min; y < cy + max; y++) {
        if (terrain.get(x, y) == TERRAIN_MASK_WALL) {
          return false;
        }
      }
    }

    return true;
  }

  for (let topLeftXY = 24; topLeftXY >= (side - 1) / 2; topLeftXY--) {
    let lowerLimit = topLeftXY;
    let upperLimit = 49 - topLeftXY;
    for (let step = 0; step < upperLimit - lowerLimit; step++) {
      if (checkRegionWithCenter(lowerLimit + step, lowerLimit)) {
        return new RoomPosition(lowerLimit + step, lowerLimit, roomName);
      }
      if (checkRegionWithCenter(upperLimit, lowerLimit + step)) {
        return new RoomPosition(upperLimit, lowerLimit + step, roomName);
      }
      if (checkRegionWithCenter(upperLimit - step, upperLimit)) {
        return new RoomPosition(upperLimit - step, upperLimit, roomName);
      }
      if (checkRegionWithCenter(lowerLimit, upperLimit - step)) {
        return new RoomPosition(lowerLimit, upperLimit - step, roomName);
      }
    }
  }
}

function findNearestEnergyDrop(pos) {
  let base = Game.rooms[Memory.rooms[pos.roomName].base];

  if (!base) {
    base = getNearestBaseManhattan(pos.roomName);
    if (!base) return;
    if (Game.map.getRoomLinearDistance(pos.roomName, base.name) > 1) return;
  }

  let possibleDrops = _(base.dropLinks).union([base.terminal, base.storage]).compact().value();

  let goals = _(possibleDrops)
      .map(x => new Object({pos: x.pos, range:1}))
      .value();

  let result = PathFinder.search(
    pos,
      goals,
      {
        roomCallback: RoomCallback.longhaulerRoundTripCallback,
        plainCost: 2,
        swampCost: 2.1,
        maxCost: 900,
        maxOps: 4000
      });

  if (!result.incomplete) {
    let lastStep = _.last(result.path);
    if (!lastStep) return;
    let destinations = lastStep.findInRange(possibleDrops, 1);
    if (destinations.length) {
      result.destination = destinations[0].id;
    }
    result.steps = result.path.length;
  }

  return result;
}

function oppositeDirection(dir) {
  return (dir + 3) % 8 + 1;
}

function findNearestController(pos, roomNames, maxCost = 200) {
  let controllers;
  try {
    controllers = _.map(roomNames, roomControllerPos);
  } catch (err) {
    console.log(`Error in findNearestController (part 1): ${err}`);
  }

  // This was probably our problem.
  if (controllers.length == 0) {
    console.log(`early-existing findNearestController because no controllers found, roomNames = ${roomNames}`);
    return;
  }

  let goals;
  try {
  goals = _(controllers)
      .map(x => new Object({pos: x, range:1}))
      .value();
  } catch (err) {
    console.log(`Error in findNearestController (part 2): ${err}`);
  }
  
  let result;
  result = PathFinder.search(
      pos,
      goals,
      {
        roomCallback: RoomCallback.avoidKeepersCallback,
        plainCost: 1,
        swampCost: 1,
        maxCost: maxCost,
        maxOps: 4000
      });
  
  if (result.incomplete) return;

  return roomControllerPos(_.last(result.path).roomName);
}

module.exports = {
  findCentermostOpenSquare,
  findNearestController,
  findNearestEnergyDrop,
  getNearestBaseManhattan,
  getNearestIntersection,
  getRoomDistanceManhattan,
  getRoomNameFromXY,
  getSectorCenter,
  oppositeDirection,
  roomNameToXY
}