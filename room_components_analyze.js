'use strict';

function update(room) {
  if (!room.memory.analyze) {
    return;
  }

  try {
    updateImpl(room);
  } catch (err) {
    room.logError(`Analyze error: ${err}`);
  }
}

function updateImpl(room) {
}

module.exports = {
  update,
};