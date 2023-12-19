'use strict';

Object.defineProperty(Creep.prototype, 'likelyNextPos', {
  get: function() {
    if (this._likelyNextPos) return this._likelyNextPos;
  
    return this._likelyNextPos = guessNextPos(this);
  },
  set: function() {},
  enumerable: false,
  configurable: true,
});

function blockCallback(roomName) {
  let costs = new PathFinder.CostMatrix;
  let room = Game.rooms[roomName];

  room.find(FIND_CREEPS).forEach(function(creep) {
    costs.set(creep.pos.x, creep.pos.y, 0xff);
  });
  
  return costs;
}
  
function guessNextPos(creep) {
  // Easy cases.
  if (creep.fatigue) return creep.pos;

  if (creep.hits < creep.hitsMax && !creep.getActiveBodyparts(MOVE)) return creep.pos;

  if (creep.owner.username == 'Source Keeper') {
    let lair = Game.getObjectById(creep.name.substring(6));
    if (creep.pos.isNearTo(lair.source)) {
      return creep.pos;
    }
    let result = PathFinder.search(
        creep.pos,
        {pos: lair.source.pos, range:1},
        {maxRooms:1, plainCost:2, swampCost:10, roomCallback:blockCallback});
    if (result.path.length && !result.incomplete) {
      return result.path[0];
    }
    // Lazy guess. Just predict he'll hold still, though he likely won't.
    return creep.pos;
  }
}