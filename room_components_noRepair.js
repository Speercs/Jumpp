'use strict';

function update(room) {
  if (!room.memory.noRepair) {
    return;
  }
  
  room.memory.noRepair =
      _.uniq(_.map(_.compact(_.map(room.memory.noRepair, Game.getObjectById)),'id'));
  
  if (!room.memory.noRepair.length) {
    delete room.memory.noRepair;
  }
}

module.exports = {
  update,
};