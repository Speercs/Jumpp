'use strict';

function update(room) {
  if (!room.memory.dismantle) {
    return;
  }
  
  room.memory.dismantle =
      _.uniq(_.map(_.compact(_.map(room.memory.dismantle, Game.getObjectById)),'id'));
  
  if (!room.memory.dismantle.length) {
    delete room.memory.dismantle;
  }
}

module.exports = {
  update,
};